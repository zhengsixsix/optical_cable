<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { Loader2 } from 'lucide-vue-next'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { getTerrainData, useTerrainCache, type TerrainData } from '@/composables/useTerrainCache'
import { useRouteStore } from '@/stores'

interface Props {
  extent?: [number, number, number, number]
}

const props = defineProps<Props>()

const routeStore = useRouteStore()
const { cachedData } = useTerrainCache()

// 获取当前选中的路线
const currentRoute = computed(() => {
  if (routeStore.currentRouteId) {
    const found = routeStore.paretoRoutes.find(r => r.id === routeStore.currentRouteId)
    if (found) return found
  }
  return routeStore.paretoRoutes[0] || null
})

const containerRef = ref<HTMLElement | null>(null)
const loading = ref(false)
const hasData = ref(false)
const isInitialized = ref(false)  // 使用 ref 让每个组件实例有自己的状态

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
  if (!containerRef.value || isInitialized.value) return

  const width = containerRef.value.clientWidth
  const height = containerRef.value.clientHeight

  if (width === 0 || height === 0) {
    setTimeout(initScene, 100)
    return
  }

  isInitialized.value = true

  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x0a1628)

  camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 10000)
  camera.position.set(0, 120, 180)

  // 性能优化：降低像素比、禁用不必要的特性
  renderer = new THREE.WebGLRenderer({ 
    antialias: false,  // 禁用抗锯齿提升性能
    powerPreference: 'high-performance'
  })
  renderer.setSize(width, height)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))  // 限制像素比
  containerRef.value.appendChild(renderer.domElement)

  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.05
  controls.maxPolarAngle = Math.PI / 2.1

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6)
  scene.add(ambientLight)

  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8)
  directionalLight.position.set(100, 150, 80)
  scene.add(directionalLight)

  animate()
  
  // 场景初始化后，检查是否有缓存数据需要渲染
  if (cachedData.value && props.extent) {
    currentExtentLonLat = cachedData.value.extentLonLat
    createTerrain(cachedData.value)
    hasData.value = true
  }
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
    // 使用缓存获取数据
    const data = await getTerrainData(extent)
    
    if (data) {
      currentExtentLonLat = data.extentLonLat
      createTerrain(data)
      hasData.value = true
    }
  } catch (error) {
    console.error('加载地形数据失败:', error)
  } finally {
    loading.value = false
  }
}

const createTerrain = (data: TerrainData) => {
  if (!scene) return

  const { elevationData, width, height, minElev, maxElev, elevRange } = data

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
  currentElevData = { minElev, maxElev, elevRange }
  currentElevArray = elevationData
  currentTerrainSize = { width, height }

  // 性能优化：降低网格分辨率
  const gridSize = Math.min(width, height, 64)  // 限制最大网格大小
  const stepX = width / gridSize
  const stepY = height / gridSize

  // 创建顶面地形
  const topGeometry = new THREE.PlaneGeometry(100, 100, gridSize - 1, gridSize - 1)
  const positions = topGeometry.attributes.position
  const colors: number[] = []

  for (let i = 0; i < positions.count; i++) {
    const geoRow = Math.floor(i / gridSize)
    const geoCol = i % gridSize
    
    // 采样原始数据
    const srcRow = Math.min(Math.floor(geoRow * stepY), height - 1)
    const srcCol = Math.min(Math.floor(geoCol * stepX), width - 1)
    const dataIdx = srcRow * width + srcCol
    
    const elev = elevationData[dataIdx] || 0
    const normalizedHeight = ((elev - minElev) / elevRange) * 40
    positions.setZ(i, elev === -32767 ? 0 : normalizedHeight)

    const color = getElevationColor(elev)
    colors.push(color.r, color.g, color.b)
  }

  topGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  topGeometry.computeVertexNormals()

  // 使用 Phong 材质替代 wireframe，效果更好
  const topMaterial = new THREE.MeshPhongMaterial({
    vertexColors: true,
    flatShading: true,
    shininess: 10,
  })

  const topMesh = new THREE.Mesh(topGeometry, topMaterial)
  topMesh.rotation.x = -Math.PI / 2
  terrainGroup.add(topMesh)

  // 简化侧面：只创建简单的包围盒
  const baseHeight = -25
  const sideColor = 0x0a2040
  
  // 创建四个侧面（简化版）
  const sideMaterial = new THREE.MeshBasicMaterial({ color: sideColor })
  
  // 前后侧面
  const frontBackGeom = new THREE.PlaneGeometry(100, 40 + 25)
  const frontMesh = new THREE.Mesh(frontBackGeom, sideMaterial)
  frontMesh.position.set(0, (40 - 25) / 2, 50)
  frontMesh.rotation.y = Math.PI
  terrainGroup.add(frontMesh)
  
  const backMesh = new THREE.Mesh(frontBackGeom.clone(), sideMaterial)
  backMesh.position.set(0, (40 - 25) / 2, -50)
  terrainGroup.add(backMesh)
  
  // 左右侧面
  const leftRightGeom = new THREE.PlaneGeometry(100, 40 + 25)
  const leftMesh = new THREE.Mesh(leftRightGeom, sideMaterial)
  leftMesh.position.set(-50, (40 - 25) / 2, 0)
  leftMesh.rotation.y = Math.PI / 2
  terrainGroup.add(leftMesh)
  
  const rightMesh = new THREE.Mesh(leftRightGeom.clone(), sideMaterial)
  rightMesh.position.set(50, (40 - 25) / 2, 0)
  rightMesh.rotation.y = -Math.PI / 2
  terrainGroup.add(rightMesh)

  // 创建底面
  const bottomGeometry = new THREE.PlaneGeometry(100, 100)
  const bottomMaterial = new THREE.MeshBasicMaterial({ color: 0x0a1a2a, side: THREE.BackSide })
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
  // z: -50 到 50 对应 row: 0 到 height-1（北到南）
  const normX = (x / 100 + 0.5)
  const normZ = (z / 100 + 0.5)
  
  const col = Math.floor(normX * (width - 1))
  const row = Math.floor(normZ * (height - 1))
  
  // 边界检查
  const clampedCol = Math.max(0, Math.min(width - 1, col))
  const clampedRow = Math.max(0, Math.min(height - 1, row))
  
  // z=-50 对应北边（tif 第一行，row=0）
  // z=+50 对应南边（tif 最后一行，row=height-1）
  const idx = clampedRow * width + clampedCol
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

  // 辅助函数：经纬度转3D坐标
  // x: 经度从西到东，对应 x 从 -50 到 50
  // z: 纬度从南到北，但场景中 z=-50 是北边，所以需要反向
  const lonLatTo3D = (lon: number, lat: number) => {
    const x = ((lon - extMinX) / (extMaxX - extMinX) - 0.5) * 100
    // 纬度：extMinY(南) -> z=50, extMaxY(北) -> z=-50
    const z = (0.5 - (lat - extMinY) / (extMaxY - extMinY)) * 100
    const terrainY = getTerrainHeight(x, z)
    return { x, z, y: terrainY + 1.5 }
  }
  
  // 检查点是否在范围内
  const isInExtent = (lon: number, lat: number) => {
    const margin = (extMaxX - extMinX) * 0.1
    return lon >= extMinX - margin && lon <= extMaxX + margin &&
           lat >= extMinY - margin && lat <= extMaxY + margin
  }

  // 检查线段是否与范围相交
  const segmentIntersectsExtent = (lon1: number, lat1: number, lon2: number, lat2: number) => {
    // 如果任一端点在范围内，则相交
    if (isInExtent(lon1, lat1) || isInExtent(lon2, lat2)) return true
    
    // 检查线段是否穿过范围（简化检测：检查线段的 bbox 是否与范围相交）
    const segMinX = Math.min(lon1, lon2)
    const segMaxX = Math.max(lon1, lon2)
    const segMinY = Math.min(lat1, lat2)
    const segMaxY = Math.max(lat1, lat2)
    
    return segMinX <= extMaxX && segMaxX >= extMinX && 
           segMinY <= extMaxY && segMaxY >= extMinY
  }

  // 收集需要显示的点索引（包括相交线段的端点）
  const pointIndicesToShow = new Set<number>()
  const points = route.points
  
  for (let i = 0; i < points.length; i++) {
    const [lon, lat] = points[i].coordinates
    // 如果点本身在范围内
    if (isInExtent(lon, lat)) {
      pointIndicesToShow.add(i)
      // 同时添加相邻点以确保能绘制线段
      if (i > 0) pointIndicesToShow.add(i - 1)
      if (i < points.length - 1) pointIndicesToShow.add(i + 1)
    }
  }
  
  // 检查每条线段是否与范围相交
  for (let i = 0; i < points.length - 1; i++) {
    const [lon1, lat1] = points[i].coordinates
    const [lon2, lat2] = points[i + 1].coordinates
    if (segmentIntersectsExtent(lon1, lat1, lon2, lat2)) {
      pointIndicesToShow.add(i)
      pointIndicesToShow.add(i + 1)
    }
  }

  // 收集主干点和分支信息
  const mainTrunkPoints: Array<{ x: number; z: number; y: number }> = []
  const branchInfos: Array<{ fromPos: { x: number; z: number; y: number }; toPos: { x: number; z: number; y: number } }> = []

  // 按顺序添加需要显示的点
  const sortedIndices = Array.from(pointIndicesToShow).sort((a, b) => a - b)
  for (const idx of sortedIndices) {
    const point = points[idx]
    const [lon, lat] = point.coordinates
    const pos3D = lonLatTo3D(lon, lat)
    mainTrunkPoints.push(pos3D)
    
    // 检查是否有分支
    if (point.branchTo && isInExtent(lon, lat)) {
      const [branchLon, branchLat] = point.branchTo.coord
      if (isInExtent(branchLon, branchLat)) {
        const branchPos = lonLatTo3D(branchLon, branchLat)
        branchInfos.push({ fromPos: pos3D, toPos: branchPos })
      }
    }
  }

  // 绘制主干线
  if (mainTrunkPoints.length >= 2) {
    const pointsIn3D = mainTrunkPoints.map(p => new THREE.Vector3(p.x, p.y, p.z))
    const curve = new THREE.CatmullRomCurve3(pointsIn3D)
    
    const sampledPoints: THREE.Vector3[] = []
    const segments = 200
    for (let i = 0; i <= segments; i++) {
      const t = i / segments
      const point = curve.getPoint(t)
      const terrainY = getTerrainHeight(point.x, point.z)
      point.y = terrainY + 1.5
      sampledPoints.push(point)
    }
    
    const groundCurve = new THREE.CatmullRomCurve3(sampledPoints)
    const tubeGeometry = new THREE.TubeGeometry(groundCurve, 200, 1.2, 8, false)
    const tubeMaterial = new THREE.MeshPhongMaterial({
      color: 0xff3333,
      shininess: 80,
      emissive: 0x330000,
    })
    const tubeMesh = new THREE.Mesh(tubeGeometry, tubeMaterial)
    routeGroup.add(tubeMesh)
  }

  // 绘制分支线（紫色，贴地）
  for (const branch of branchInfos) {
    // 沿分支线采样，让分支线贴地
    const branchSampledPoints: THREE.Vector3[] = []
    const branchSegments = 50
    for (let i = 0; i <= branchSegments; i++) {
      const t = i / branchSegments
      const x = branch.fromPos.x + (branch.toPos.x - branch.fromPos.x) * t
      const z = branch.fromPos.z + (branch.toPos.z - branch.fromPos.z) * t
      const terrainY = getTerrainHeight(x, z)
      branchSampledPoints.push(new THREE.Vector3(x, terrainY + 1.5, z))
    }
    
    const branchCurve = new THREE.CatmullRomCurve3(branchSampledPoints)
    const branchTubeGeometry = new THREE.TubeGeometry(branchCurve, 50, 1.0, 8, false)
    const branchTubeMaterial = new THREE.MeshPhongMaterial({
      color: 0xaa55ff, // 紫色
      shininess: 80,
      emissive: 0x220033,
    })
    const branchTubeMesh = new THREE.Mesh(branchTubeGeometry, branchTubeMaterial)
    routeGroup.add(branchTubeMesh)
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

// 监听路径变化（监听 paretoRoutes 数组变化和当前选中路线变化）
watch([() => routeStore.paretoRoutes, () => routeStore.currentRouteId], () => {
  if (hasData.value) {
    updateRouteLine()
  }
}, { deep: true })

onMounted(() => {
  initScene()
  window.addEventListener('resize', handleResize)
  if (props.extent) loadTerrainData(props.extent)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  if (animationId) cancelAnimationFrame(animationId)
  
  // 清理 Three.js 资源
  if (terrainGroup) {
    terrainGroup.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose()
        if (child.material instanceof THREE.Material) {
          child.material.dispose()
        }
      }
    })
  }
  if (routeGroup) {
    routeGroup.traverse((child) => {
      if (child instanceof THREE.Mesh || child instanceof THREE.Line) {
        child.geometry.dispose()
        if (child.material instanceof THREE.Material) {
          child.material.dispose()
        }
      }
    })
  }
  
  if (renderer) {
    renderer.dispose()
    renderer.domElement.remove()
  }
  
  // 重置状态
  scene = null
  camera = null
  renderer = null
  controls = null
  terrainGroup = null
  routeGroup = null
  isInitialized.value = false
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
