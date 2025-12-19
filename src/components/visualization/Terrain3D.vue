<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { Loader2 } from 'lucide-vue-next'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { loadTifMeta, findTifForExtent, mercatorToLatLon } from '@/composables/useDemData'
import { useRouteStore } from '@/stores'
import { storeToRefs } from 'pinia'

interface Props {
  extent?: [number, number, number, number]
}

const props = defineProps<Props>()

const routeStore = useRouteStore()
const { currentRoute } = storeToRefs(routeStore)

const containerRef = ref<HTMLElement | null>(null)
const loading = ref(false)
const hasData = ref(false)
let isInitialized = false

let scene: THREE.Scene | null = null
let camera: THREE.PerspectiveCamera | null = null
let renderer: THREE.WebGLRenderer | null = null
let controls: OrbitControls | null = null
let terrainGroup: THREE.Group | null = null
let routeGroup: THREE.Group | null = null
let animationId: number | null = null

// 存储当前地形的坐标范围和高程信息
let currentExtentLonLat: [number, number, number, number] | null = null
let currentElevData: { minElev: number; maxElev: number; elevRange: number } | null = null
let currentElevArray: Int16Array | null = null
let currentTerrainSize: { width: number; height: number } | null = null

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
  scene.background = new THREE.Color(0x0a1628)

  camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 10000)
  camera.position.set(0, 120, 180)

  renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setSize(width, height)
  renderer.setPixelRatio(window.devicePixelRatio)
  containerRef.value.appendChild(renderer.domElement)

  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.05
  controls.maxPolarAngle = Math.PI / 2.1

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6)
  scene.add(ambientLight)

  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8)
  directionalLight.position.set(100, 150, 80)
  directionalLight.castShadow = true
  scene.add(directionalLight)

  const backLight = new THREE.DirectionalLight(0x4488ff, 0.3)
  backLight.position.set(-50, 50, -50)
  scene.add(backLight)

  animate()
}

const animate = () => {
  animationId = requestAnimationFrame(animate)
  controls?.update()

  if (renderer && scene && camera) {
    renderer.render(scene, camera)
  }
}

const loadTerrainData = async (extent: [number, number, number, number]) => {
  loading.value = true
  hasData.value = false

  try {
    // 使用共享的 tif 元数据缓存
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
    currentExtentLonLat = extentLonLat
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

  // 清除旧的地形组
  if (terrainGroup) {
    scene.remove(terrainGroup)
    terrainGroup.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose()
        if (child.material instanceof THREE.Material) {
          child.material.dispose()
        }
      }
    })
  }

  terrainGroup = new THREE.Group()

  let minElev = Infinity
  let maxElev = -Infinity
  for (let i = 0; i < elevationData.length; i++) {
    if (elevationData[i] !== -32767) {
      minElev = Math.min(minElev, elevationData[i])
      maxElev = Math.max(maxElev, elevationData[i])
    }
  }

  const elevRange = maxElev - minElev || 1
  currentElevData = { minElev, maxElev, elevRange }
  currentElevArray = elevationData
  currentTerrainSize = { width, height }

  // 创建顶面地形
  const topGeometry = new THREE.PlaneGeometry(100, 100, width - 1, height - 1)
  const positions = topGeometry.attributes.position
  const colors: number[] = []

  // PlaneGeometry 顶点从 y=-50 开始按行扫描，旋转后 z=50 在前
  // tif 数据第一行是北边（高纬度），需要翻转行索引
  for (let i = 0; i < positions.count; i++) {
    const row = Math.floor(i / width)
    const col = i % width
    // 翻转行索引：让 tif 的第一行（北边）对应场景的 z=-50
    const flippedRow = height - 1 - row
    const dataIdx = flippedRow * width + col
    
    const elev = elevationData[dataIdx] || 0
    const normalizedHeight = ((elev - minElev) / elevRange) * 40
    positions.setZ(i, elev === -32767 ? 0 : normalizedHeight)

    const color = getElevationColor(elev)
    colors.push(color.r, color.g, color.b)
  }

  topGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  topGeometry.computeVertexNormals()

  // 网格线框材质（保留顶点颜色）
  const topMaterial = new THREE.MeshBasicMaterial({
    vertexColors: true,
    wireframe: true,
    wireframeLinewidth: 1,
  })

  const topMesh = new THREE.Mesh(topGeometry, topMaterial)
  topMesh.rotation.x = -Math.PI / 2
  terrainGroup.add(topMesh)

  // 创建四个侧面（立体效果）
  const baseHeight = -25
  const sideColor = new THREE.Color(0x0a2040)

  // 前侧面 (z = 50) - 对应 tif 的南边（翻转后的最后一行）
  const frontVertices: number[] = []
  const frontColors: number[] = []
  for (let i = 0; i < width; i++) {
    const idx = 0 * width + i  // tif 第一行翻转后在 z=50
    const elev = elevationData[idx] || 0
    const h = ((elev - minElev) / elevRange) * 40
    const x = (i / (width - 1) - 0.5) * 100
    frontVertices.push(x, h, 50, x, baseHeight, 50)
    frontColors.push(sideColor.r, sideColor.g, sideColor.b)
    frontColors.push(sideColor.r * 0.5, sideColor.g * 0.5, sideColor.b * 0.5)
  }
  createSideMesh(frontVertices, frontColors, width)

  // 后侧面 (z = -50) - 对应 tif 的北边（翻转后的第一行）
  const backVertices: number[] = []
  const backColors: number[] = []
  for (let i = 0; i < width; i++) {
    const idx = (height - 1) * width + i  // tif 最后一行翻转后在 z=-50
    const elev = elevationData[idx] || 0
    const h = ((elev - minElev) / elevRange) * 40
    const x = (i / (width - 1) - 0.5) * 100
    backVertices.push(x, h, -50, x, baseHeight, -50)
    backColors.push(sideColor.r, sideColor.g, sideColor.b)
    backColors.push(sideColor.r * 0.5, sideColor.g * 0.5, sideColor.b * 0.5)
  }
  createSideMesh(backVertices, backColors, width)

  // 左侧面 (x = -50)
  const leftVertices: number[] = []
  const leftColors: number[] = []
  for (let j = 0; j < height; j++) {
    const flippedJ = height - 1 - j
    const idx = flippedJ * width
    const elev = elevationData[idx] || 0
    const h = ((elev - minElev) / elevRange) * 40
    const z = (j / (height - 1) - 0.5) * 100
    leftVertices.push(-50, h, z, -50, baseHeight, z)
    leftColors.push(sideColor.r, sideColor.g, sideColor.b)
    leftColors.push(sideColor.r * 0.5, sideColor.g * 0.5, sideColor.b * 0.5)
  }
  createSideMesh(leftVertices, leftColors, height)

  // 右侧面 (x = 50)
  const rightVertices: number[] = []
  const rightColors: number[] = []
  for (let j = 0; j < height; j++) {
    const flippedJ = height - 1 - j
    const idx = flippedJ * width + (width - 1)
    const elev = elevationData[idx] || 0
    const h = ((elev - minElev) / elevRange) * 40
    const z = (j / (height - 1) - 0.5) * 100
    rightVertices.push(50, h, z, 50, baseHeight, z)
    rightColors.push(sideColor.r, sideColor.g, sideColor.b)
    rightColors.push(sideColor.r * 0.5, sideColor.g * 0.5, sideColor.b * 0.5)
  }
  createSideMesh(rightVertices, rightColors, height)

  // 创建底面
  const bottomGeometry = new THREE.PlaneGeometry(100, 100)
  const bottomMaterial = new THREE.MeshLambertMaterial({ color: 0x0a1a2a, side: THREE.BackSide })
  const bottomMesh = new THREE.Mesh(bottomGeometry, bottomMaterial)
  bottomMesh.rotation.x = -Math.PI / 2
  bottomMesh.position.y = baseHeight
  terrainGroup.add(bottomMesh)

  scene.add(terrainGroup)

  // 更新路径显示
  updateRouteLine()

  if (camera) {
    camera.position.set(0, 100, 150)
    camera.lookAt(0, 0, 0)
  }
}

// 创建侧面网格
const createSideMesh = (vertices: number[], colors: number[], count: number) => {
  if (!terrainGroup) return

  const indices: number[] = []
  for (let i = 0; i < count - 1; i++) {
    const a = i * 2
    const b = i * 2 + 1
    const c = i * 2 + 2
    const d = i * 2 + 3
    indices.push(a, b, c, b, d, c)
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()

  const material = new THREE.MeshBasicMaterial({ vertexColors: true, wireframe: true })
  const mesh = new THREE.Mesh(geometry, material)
  terrainGroup.add(mesh)
}

// 根据 3D 坐标获取地形高度
const getTerrainHeight = (x: number, z: number): number => {
  if (!currentElevArray || !currentTerrainSize || !currentElevData) return 0
  
  const { width, height } = currentTerrainSize
  const { minElev, elevRange } = currentElevData
  
  // 将 3D 坐标 (-50 到 50) 转换为索引
  // x: -50 到 50 对应 col: 0 到 width-1
  // z: -50 到 50 对应 row: 0 到 height-1（已经在地形创建时翻转了）
  const normX = (x / 100 + 0.5)
  const normZ = (z / 100 + 0.5)
  
  const col = Math.floor(normX * (width - 1))
  const row = Math.floor(normZ * (height - 1))
  
  // 边界检查
  const clampedCol = Math.max(0, Math.min(width - 1, col))
  const clampedRow = Math.max(0, Math.min(height - 1, row))
  
  // 翻转行索引（与地形创建一致）
  const flippedRow = height - 1 - clampedRow
  const idx = flippedRow * width + clampedCol
  const elev = currentElevArray[idx] || 0
  
  // 转换为归一化高度
  const normalizedHeight = ((elev - minElev) / elevRange) * 40
  return elev === -32767 ? 0 : normalizedHeight
}

// 更新路径线
const updateRouteLine = () => {
  if (!scene || !currentExtentLonLat || !currentElevData) return

  // 清除旧路径组
  if (routeGroup) {
    scene.remove(routeGroup)
    routeGroup.traverse((child) => {
      if (child instanceof THREE.Mesh || child instanceof THREE.Line) {
        child.geometry.dispose()
        if (child.material instanceof THREE.Material) {
          child.material.dispose()
        }
      }
    })
    routeGroup = null
  }

  const route = currentRoute.value
  if (!route || !route.points || route.points.length < 2) return

  routeGroup = new THREE.Group()
  const [extMinX, extMinY, extMaxX, extMaxY] = currentExtentLonLat

  // 筛选在范围内的路径点，并计算贴地高度
  const pointsIn3D: THREE.Vector3[] = []
  const routePointsData: { x: number; z: number; type: string }[] = []

  for (const point of route.points) {
    const [lon, lat] = point.coordinates
    
    // 检查点是否在框选范围内
    const margin = (extMaxX - extMinX) * 0.1
    if (lon >= extMinX - margin && lon <= extMaxX + margin &&
        lat >= extMinY - margin && lat <= extMaxY + margin) {
      
      // 转换为 3D 坐标 (-50 到 50)
      // x: 经度从西到东
      const x = ((lon - extMinX) / (extMaxX - extMinX) - 0.5) * 100
      // z: 纬度从南到北（已在地形创建时统一处理）
      const z = ((lat - extMinY) / (extMaxY - extMinY) - 0.5) * 100
      
      // 获取地形高度，贴地偏移 1.5
      const terrainY = getTerrainHeight(x, z)
      const y = terrainY + 1.5
      
      pointsIn3D.push(new THREE.Vector3(x, y, z))
      routePointsData.push({ x, z, type: point.type || 'waypoint' })
    }
  }

  if (pointsIn3D.length < 2) return

  // 创建平滑曲线
  const curve = new THREE.CatmullRomCurve3(pointsIn3D)
  
  // 沿曲线重新采样，让路径贴地
  const sampledPoints: THREE.Vector3[] = []
  const segments = 200
  for (let i = 0; i <= segments; i++) {
    const t = i / segments
    const point = curve.getPoint(t)
    // 重新计算贴地高度
    const terrainY = getTerrainHeight(point.x, point.z)
    point.y = terrainY + 1.5
    sampledPoints.push(point)
  }
  
  // 创建贴地曲线
  const groundCurve = new THREE.CatmullRomCurve3(sampledPoints)
  
  // 创建圆柱形管道
  const tubeGeometry = new THREE.TubeGeometry(groundCurve, 200, 1.2, 8, false)
  const tubeMaterial = new THREE.MeshPhongMaterial({
    color: 0xff3333,
    shininess: 80,
    emissive: 0x330000,
  })
  const tubeMesh = new THREE.Mesh(tubeGeometry, tubeMaterial)
  routeGroup.add(tubeMesh)

  // 添加路径点标记（不同类型用不同颜色）
  for (const pd of routePointsData) {
    const terrainY = getTerrainHeight(pd.x, pd.z)
    const y = terrainY + 2.5
    
    // 根据节点类型设置颜色和大小
    let color = 0xcccccc
    let emissive = 0x222222
    let size = 2.5
    
    switch (pd.type) {
      case 'landing':
        // 登陆站 - 绿色
        color = 0x00ff88
        emissive = 0x004422
        size = 4
        break
      case 'repeater':
        // 中继器 - 红色
        color = 0xff4444
        emissive = 0x441111
        size = 3
        break
      case 'branching':
        // 分支器 - 青色
        color = 0x00ddff
        emissive = 0x003344
        size = 3.5
        break
      case 'joint':
        // 接头 - 黄色
        color = 0xffcc00
        emissive = 0x332200
        size = 2
        break
      default:
        // 航路点 - 白色
        color = 0xffffff
        emissive = 0x333333
        size = 2
    }
    
    const sphereGeom = new THREE.SphereGeometry(size, 16, 16)
    const sphereMat = new THREE.MeshPhongMaterial({
      color,
      emissive,
      shininess: 100,
    })
    const sphere = new THREE.Mesh(sphereGeom, sphereMat)
    sphere.position.set(pd.x, y, pd.z)
    routeGroup.add(sphere)
  }

  scene.add(routeGroup)
}

// 根据实际高程值着色
const getElevationColor = (elev: number): THREE.Color => {
  // 海底区域（负值）：深蓝到浅蓝
  if (elev < -4000) return new THREE.Color().setHSL(0.62, 0.9, 0.15)
  if (elev < -2000) return new THREE.Color().setHSL(0.60, 0.85, 0.25)
  if (elev < -500) return new THREE.Color().setHSL(0.58, 0.8, 0.35)
  if (elev < -100) return new THREE.Color().setHSL(0.55, 0.75, 0.45)
  if (elev < 0) return new THREE.Color().setHSL(0.52, 0.7, 0.55)
  
  // 海平面附近：沙滩/浅滩
  if (elev < 50) return new THREE.Color().setHSL(0.15, 0.5, 0.7)
  
  // 陆地区域（正值）
  if (elev < 200) return new THREE.Color().setHSL(0.25, 0.6, 0.45)
  if (elev < 500) return new THREE.Color().setHSL(0.20, 0.5, 0.40)
  if (elev < 1500) return new THREE.Color().setHSL(0.10, 0.4, 0.35)
  return new THREE.Color().setHSL(0, 0, 0.9)
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

// 监听路径变化
watch(currentRoute, () => {
  if (hasData.value) {
    updateRouteLine()
  }
})

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
