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

let scene: THREE.Scene | null = null
let camera: THREE.PerspectiveCamera | null = null
let renderer: THREE.WebGLRenderer | null = null
let controls: OrbitControls | null = null
let terrainMesh: THREE.Mesh | null = null
let animationId: number | null = null

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
  if (renderer && scene && camera) {
    renderer.render(scene, camera)
  }
}

const loadTerrainData = async (extent: [number, number, number, number]) => {
  loading.value = true
  hasData.value = false

  try {
    const response = await fetch('/dem.tif')
    const arrayBuffer = await response.arrayBuffer()
    const tiff = await GeoTIFF.fromArrayBuffer(arrayBuffer)
    const image = await tiff.getImage()

    const bbox = image.getBoundingBox()
    const width = image.getWidth()
    const height = image.getHeight()

    const [imgMinX, imgMinY, imgMaxX, imgMaxY] = bbox
    const pixelWidth = (imgMaxX - imgMinX) / width
    const pixelHeight = (imgMaxY - imgMinY) / height

    const [extMinX, extMinY, extMaxX, extMaxY] = extent
    
    const clampedMinX = Math.max(extMinX, imgMinX)
    const clampedMinY = Math.max(extMinY, imgMinY)
    const clampedMaxX = Math.min(extMaxX, imgMaxX)
    const clampedMaxY = Math.min(extMaxY, imgMaxY)

    const windowMinX = Math.floor((clampedMinX - imgMinX) / pixelWidth)
    const windowMaxX = Math.ceil((clampedMaxX - imgMinX) / pixelWidth)
    const windowMinY = Math.floor((imgMaxY - clampedMaxY) / pixelHeight)
    const windowMaxY = Math.ceil((imgMaxY - clampedMinY) / pixelHeight)

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
