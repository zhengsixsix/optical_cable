<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { Loader2 } from 'lucide-vue-next'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import * as GeoTIFF from 'geotiff'

interface Props {
  extent?: [number, number, number, number]
}

const props = defineProps<Props>()

const containerRef = ref<HTMLElement | null>(null)
const loading = ref(false)
const hasData = ref(false)
let isInitialized = false

// 多 tif 文件支持
interface TifMeta {
  url: string
  bbox: [number, number, number, number]
  image: any
  pixelWidth: number
  pixelHeight: number
  width: number
  height: number
}

const DEM_FILES = ['/dem/1.tif', '/dem/2.tif', '/dem/3.tif', '/dem/4.tif', '/dem/5.tif', '/dem/6.tif']
const tifMetaCache = ref<TifMeta[]>([])
const metaLoaded = ref(false)

// 预加载所有 tif 文件的元数据
const loadTifMeta = async () => {
  if (metaLoaded.value) return

  const metas: TifMeta[] = []
  await Promise.all(DEM_FILES.map(async (url) => {
    try {
      const response = await fetch(url)
      const arrayBuffer = await response.arrayBuffer()
      const tiff = await GeoTIFF.fromArrayBuffer(arrayBuffer)
      const image = await tiff.getImage()
      const bbox = image.getBoundingBox() as [number, number, number, number]
      const width = image.getWidth()
      const height = image.getHeight()
      const pixelWidth = (bbox[2] - bbox[0]) / width
      const pixelHeight = (bbox[3] - bbox[1]) / height

      metas.push({ url, bbox, image, pixelWidth, pixelHeight, width, height })
    } catch (e) {
      console.warn(`加载 ${url} 元数据失败:`, e)
    }
  }))

  tifMetaCache.value = metas
  metaLoaded.value = true
}

// EPSG:3857 转经纬度
const mercatorToLatLon = (x: number, y: number): [number, number] => {
  const lon = (x / 20037508.34) * 180
  let lat = (y / 20037508.34) * 180
  lat = (180 / Math.PI) * (2 * Math.atan(Math.exp((lat * Math.PI) / 180)) - Math.PI / 2)
  return [lon, lat]
}

// 查找与区域有交集的 tif 文件（输入是经纬度坐标）
const findTifForExtent = (extentLonLat: [number, number, number, number]): TifMeta | null => {
  const [extMinX, extMinY, extMaxX, extMaxY] = extentLonLat
  for (const meta of tifMetaCache.value) {
    const [minX, minY, maxX, maxY] = meta.bbox
    // 检查是否有交集
    if (extMinX <= maxX && extMaxX >= minX && extMinY <= maxY && extMaxY >= minY) {
      return meta
    }
  }
  return null
}

let scene: THREE.Scene | null = null
let camera: THREE.PerspectiveCamera | null = null
let renderer: THREE.WebGLRenderer | null = null
let controls: OrbitControls | null = null
let terrainMesh: THREE.Mesh | null = null
let waterMesh: THREE.Mesh | null = null
let animationId: number | null = null
let waterTime = 0

// 立体水体着色器
const waterVertexShader = `
  uniform float uTime;
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying vec2 vUv;
  
  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    
    vec3 pos = position;
    
    // 顶面波浪效果
    if (pos.y > 0.0) {
      float wave1 = sin(pos.x * 0.3 + uTime * 1.5) * 0.8;
      float wave2 = sin(pos.z * 0.4 + uTime * 1.2) * 0.6;
      float wave3 = sin((pos.x + pos.z) * 0.2 + uTime * 2.0) * 0.4;
      pos.y += wave1 + wave2 + wave3;
    }
    
    vec4 worldPos = modelMatrix * vec4(pos, 1.0);
    vWorldPos = worldPos.xyz;
    
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`

const waterFragmentShader = `
  uniform float uTime;
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying vec2 vUv;
  
  void main() {
    // 深海到浅海的颜色
    vec3 deepColor = vec3(0.0, 0.05, 0.15);
    vec3 midColor = vec3(0.0, 0.15, 0.35);
    vec3 surfaceColor = vec3(0.1, 0.4, 0.6);
    
    // 根据高度混合颜色
    float heightFactor = clamp((vWorldPos.y + 20.0) / 40.0, 0.0, 1.0);
    vec3 waterColor = mix(deepColor, midColor, heightFactor * 0.5);
    waterColor = mix(waterColor, surfaceColor, heightFactor * heightFactor);
    
    // 流动光线效果
    float flow1 = sin(vWorldPos.x * 0.1 + vWorldPos.z * 0.1 + uTime * 0.8) * 0.5 + 0.5;
    float flow2 = sin(vWorldPos.x * 0.15 - vWorldPos.z * 0.08 + uTime * 0.6) * 0.5 + 0.5;
    float caustics = flow1 * flow2 * 0.3 * heightFactor;
    waterColor += vec3(caustics * 0.5, caustics * 0.7, caustics);
    
    // 边缘菲涅尔效果
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    float fresnel = pow(1.0 - max(dot(vNormal, viewDir), 0.0), 2.0);
    waterColor += vec3(0.1, 0.2, 0.3) * fresnel * 0.5;
    
    // 深度透明度
    float alpha = 0.75 + heightFactor * 0.15;
    
    gl_FragColor = vec4(waterColor, alpha);
  }
`

// 创建立体水体
const createWater = (seaLevel: number) => {
  if (!scene) return

  // 移除旧水体
  if (waterMesh) {
    scene.remove(waterMesh)
    waterMesh.geometry.dispose()
    if (waterMesh.material instanceof THREE.Material) {
      waterMesh.material.dispose()
    }
  }

  // 创建立体水块
  const waterDepth = seaLevel + 5
  const waterGeometry = new THREE.BoxGeometry(110, waterDepth, 110, 32, 16, 32)

  const waterMaterial = new THREE.ShaderMaterial({
    vertexShader: waterVertexShader,
    fragmentShader: waterFragmentShader,
    uniforms: {
      uTime: { value: 0 }
    },
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false
  })

  const mesh = new THREE.Mesh(waterGeometry, waterMaterial)
  mesh.position.y = seaLevel / 2 - 2
  scene.add(mesh)
  waterMesh = mesh
}

const initScene = () => {
  if (!containerRef.value || isInitialized) return

  const width = containerRef.value.clientWidth
  const height = containerRef.value.clientHeight

  if (width === 0 || height === 0) {
    setTimeout(initScene, 100)
    return
  }

  isInitialized = true

  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x1a1a2e)

  camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 10000)
  camera.position.set(0, 100, 150)

  renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setSize(width, height)
  renderer.setPixelRatio(window.devicePixelRatio)
  containerRef.value.appendChild(renderer.domElement)

  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.05

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.5)
  scene.add(ambientLight)

  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8)
  directionalLight.position.set(100, 100, 50)
  scene.add(directionalLight)

  const gridHelper = new THREE.GridHelper(200, 20, 0x444444, 0x222222)
  scene.add(gridHelper)

  animate()
}

const animate = () => {
  animationId = requestAnimationFrame(animate)
  controls?.update()

  // 更新水面动画
  if (waterMesh && waterMesh.material) {
    waterTime += 0.01
    const material = waterMesh.material as THREE.ShaderMaterial
    if (material.uniforms) {
      material.uniforms.uTime.value = waterTime
    }
  }

  if (renderer && scene && camera) {
    renderer.render(scene, camera)
  }
}

const loadTerrainData = async (extent: [number, number, number, number]) => {
  loading.value = true
  hasData.value = false

  try {
    // 预加载 tif 元数据
    await loadTifMeta()

    // 将 EPSG:3857 坐标转换为经纬度
    const [lonMin, latMin] = mercatorToLatLon(extent[0], extent[1])
    const [lonMax, latMax] = mercatorToLatLon(extent[2], extent[3])
    const extentLonLat: [number, number, number, number] = [lonMin, latMin, lonMax, latMax]

    // 查找与区域有交集的 tif 文件
    const tifMeta = findTifForExtent(extentLonLat)
    if (!tifMeta || !tifMeta.image) {
      console.warn('未找到覆盖该区域的 DEM 数据，框选范围:', extentLonLat)
      return
    }

    const { image, bbox, pixelWidth, pixelHeight, width, height } = tifMeta
    const [imgMinX, imgMinY, imgMaxX, imgMaxY] = bbox
    const [extMinX, extMinY, extMaxX, extMaxY] = extentLonLat

    const clampedMinX = Math.max(extMinX, imgMinX)
    const clampedMinY = Math.max(extMinY, imgMinY)
    const clampedMaxX = Math.min(extMaxX, imgMaxX)
    const clampedMaxY = Math.min(extMaxY, imgMaxY)

    const windowMinX = Math.max(0, Math.floor((clampedMinX - imgMinX) / pixelWidth))
    const windowMaxX = Math.min(width, Math.ceil((clampedMaxX - imgMinX) / pixelWidth))
    const windowMinY = Math.max(0, Math.floor((imgMaxY - clampedMaxY) / pixelHeight))
    const windowMaxY = Math.min(height, Math.ceil((imgMaxY - clampedMinY) / pixelHeight))

    // 验证窗口有效性
    if (windowMaxX <= windowMinX || windowMaxY <= windowMinY) {
      console.warn('选择区域超出 DEM 数据范围')
      return
    }

    const targetSize = 128
    const windowWidth = windowMaxX - windowMinX
    const windowHeight = windowMaxY - windowMinY

    const sampleWidth = Math.min(windowWidth, targetSize)
    const sampleHeight = Math.min(windowHeight, targetSize)

    const rasters = await image.readRasters({
      window: [windowMinX, windowMinY, windowMaxX, windowMaxY],
      width: sampleWidth,
      height: sampleHeight,
    })

    const elevationData = rasters[0] as Int16Array
    createTerrain(elevationData, sampleWidth, sampleHeight)
    hasData.value = true
  } catch (error) {
    console.error('加载地形数据失败:', error)
  } finally {
    loading.value = false
  }
}

const createTerrain = (elevationData: Int16Array, width: number, height: number) => {
  if (!scene) return

  if (terrainMesh) {
    scene.remove(terrainMesh)
    terrainMesh.geometry.dispose()
    if (terrainMesh.material instanceof THREE.Material) {
      terrainMesh.material.dispose()
    }
  }

  const geometry = new THREE.PlaneGeometry(100, 100, width - 1, height - 1)

  let minElev = Infinity
  let maxElev = -Infinity
  for (let i = 0; i < elevationData.length; i++) {
    if (elevationData[i] !== -32767) {
      minElev = Math.min(minElev, elevationData[i])
      maxElev = Math.max(maxElev, elevationData[i])
    }
  }

  const positions = geometry.attributes.position
  const colors: number[] = []
  const elevRange = maxElev - minElev || 1

  for (let i = 0; i < positions.count; i++) {
    const elev = elevationData[i] || 0
    const normalizedHeight = ((elev - minElev) / elevRange) * 30
    positions.setZ(i, elev === -32767 ? 0 : normalizedHeight)

    const t = (elev - minElev) / elevRange
    const color = getElevationColor(t)
    colors.push(color.r, color.g, color.b)
  }

  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geometry.computeVertexNormals()

  const material = new THREE.MeshLambertMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
  })

  terrainMesh = new THREE.Mesh(geometry, material)
  terrainMesh.rotation.x = -Math.PI / 2
  scene.add(terrainMesh)

  // 计算海平面高度（0米对应的归一化高度）
  const seaLevelNormalized = ((0 - minElev) / elevRange) * 30
  createWater(Math.max(seaLevelNormalized, 0))

  if (camera) {
    camera.position.set(0, 80, 120)
    camera.lookAt(0, 0, 0)
  }
}

const getElevationColor = (t: number): THREE.Color => {
  if (t < 0.3) return new THREE.Color().setHSL(0.6, 0.8, 0.2 + t * 0.5)
  if (t < 0.5) return new THREE.Color().setHSL(0.5, 0.7, 0.4 + (t - 0.3) * 0.5)
  if (t < 0.6) return new THREE.Color().setHSL(0.3, 0.8, 0.4)
  if (t < 0.75) return new THREE.Color().setHSL(0.15, 0.8, 0.5)
  if (t < 0.9) return new THREE.Color().setHSL(0.08, 0.6, 0.4)
  return new THREE.Color().setHSL(0, 0, 0.8 + (t - 0.9) * 2)
}

const handleResize = () => {
  if (!containerRef.value || !camera || !renderer) return

  const width = containerRef.value.clientWidth
  const height = containerRef.value.clientHeight

  camera.aspect = width / height
  camera.updateProjectionMatrix()
  renderer.setSize(width, height)
}

watch(() => props.extent, (newExtent) => {
  if (newExtent) loadTerrainData(newExtent)
}, { immediate: true })

onMounted(() => {
  initScene()
  window.addEventListener('resize', handleResize)
  if (props.extent) loadTerrainData(props.extent)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  if (animationId) cancelAnimationFrame(animationId)
  if (renderer) {
    renderer.dispose()
    renderer.domElement.remove()
  }
})
</script>

<template>
  <div ref="containerRef" class="w-full h-full min-h-[150px] relative bg-[#1a1a2e] rounded overflow-hidden">
    <div v-if="loading" class="absolute inset-0 flex flex-col items-center justify-center gap-2 text-gray-400 text-xs">
      <Loader2 class="w-6 h-6 text-primary animate-spin" />
      <span>加载地形数据...</span>
    </div>

    <div v-if="!hasData && !loading" class="absolute inset-0 flex items-center justify-center text-gray-400 text-xs">
      <span>框选区域后显示 3D 地形</span>
    </div>
  </div>
</template>
