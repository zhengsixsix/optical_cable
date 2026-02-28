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

// ==================== 常量 ====================
const TERRAIN_SIZE = 100          // 地形平面尺寸
const GRID_MAX = 128              // 网格最大分辨率
const ELEV_MAP_RANGE = 60         // 高程映射高度范围
const EXAGGERATION = 3            // 垂直夸张系数
const BASE_HEIGHT = -30           // 底面高度
const CABLE_RADIUS = 0.4          // 缆线管径
const CABLE_GLOW_RADIUS = 0.7     // 缆线发光外管径
const CABLE_OFFSET = 2.5          // 缆线离地偏移（加大防穿入）
const SEA_LEVEL_OPACITY = 0.25    // 海平面透明度
const CONTOUR_DEPTHS = [-500, -1000, -2000, -3000, -4000] // 等深线水深值

// ==================== 响应式状态 ====================
const containerRef = ref<HTMLElement | null>(null)
const loading = ref(false)
const hasData = ref(false)
const isInitialized = ref(false)

const hoverInfo = ref({
  visible: false,
  x: 0,
  y: 0,
  lon: 0,
  lat: 0,
  depth: 0,
  onCable: false,
})

// 获取当前选中的路线
const currentRoute = computed(() => {
  if (routeStore.currentRouteId) {
    const found = routeStore.paretoRoutes.find(r => r.id === routeStore.currentRouteId)
    if (found) return found
  }
  return routeStore.paretoRoutes[0] || null
})

// ==================== Three.js 对象 ====================
let scene: THREE.Scene | null = null
let camera: THREE.PerspectiveCamera | null = null
let renderer: THREE.WebGLRenderer | null = null
let controls: OrbitControls | null = null
let terrainGroup: THREE.Group | null = null
let routeGroup: THREE.Group | null = null
let annotationGroup: THREE.Group | null = null
let contourGroup: THREE.Group | null = null
let animationId: number | null = null
let raycaster: THREE.Raycaster | null = null
let mouse: THREE.Vector2 | null = null
let terrainMesh: THREE.Mesh | null = null

// 存储当前地形的坐标范围和高程信息
let currentExtentLonLat: [number, number, number, number] | null = null
let currentElevData: { minElev: number; maxElev: number; elevRange: number } | null = null
let currentElevArray: Int16Array | null = null
let currentTerrainSize: { width: number; height: number } | null = null

// ==================== 场景初始化 ====================
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
  scene.background = new THREE.Color(0x070d1a)
  scene.fog = new THREE.FogExp2(0x070d1a, 0.0015)

  camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 10000)
  camera.position.set(0, 120, 180)

  renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance',
    alpha: false,
  })
  renderer.setSize(width, height)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.shadowMap.enabled = false
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.2
  containerRef.value.appendChild(renderer.domElement)

  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.maxPolarAngle = Math.PI / 2.05
  controls.minDistance = 30
  controls.maxDistance = 400

  // 光照
  const ambientLight = new THREE.AmbientLight(0xccddff, 0.5)
  scene.add(ambientLight)

  const dirLight = new THREE.DirectionalLight(0xfff5e6, 0.9)
  dirLight.position.set(80, 150, 60)
  scene.add(dirLight)

  const fillLight = new THREE.DirectionalLight(0x4488cc, 0.3)
  fillLight.position.set(-60, 80, -40)
  scene.add(fillLight)

  // Raycaster 初始化
  raycaster = new THREE.Raycaster()
  mouse = new THREE.Vector2()

  animate()

  // 场景初始化后，检查是否有缓存数据需要渲染
  if (cachedData.value && props.extent) {
    currentExtentLonLat = cachedData.value.extentLonLat
    createTerrain(cachedData.value)
    hasData.value = true
  }
}

// ==================== 动画循环 ====================
const animate = () => {
  animationId = requestAnimationFrame(animate)
  controls?.update()
  if (renderer && scene && camera) {
    renderer.render(scene, camera)
  }
}

// ==================== 加载数据 ====================
const loadTerrainData = async (extent: [number, number, number, number]) => {
  loading.value = true
  hasData.value = false

  try {
    const data = await getTerrainData(extent)
    if (data) {
      currentExtentLonLat = data.extentLonLat
      createTerrain(data)
      hasData.value = true
    }
  } catch {
    // 加载失败
  } finally {
    loading.value = false
  }
}

// ==================== 高程颜色映射 (改进版) ====================
const getElevationColor = (elev: number): THREE.Color => {
  // 深渊带 >4000m
  if (elev < -4000) return new THREE.Color(0x0a0e2a)
  // 深海带 2000-4000m
  if (elev < -3000) return new THREE.Color(0x0c1845)
  if (elev < -2000) return new THREE.Color(0x102060)
  // 半深海 500-2000m
  if (elev < -1000) return new THREE.Color(0x1a3a78)
  if (elev < -500)  return new THREE.Color(0x2a5590)
  // 浅海 0-500m
  if (elev < -200)  return new THREE.Color(0x3a78b0)
  if (elev < -50)   return new THREE.Color(0x55a0c8)
  if (elev < 0)     return new THREE.Color(0x70c0d8)

  // 海平面附近：沙滩
  if (elev < 20)    return new THREE.Color(0xd4c49a)
  if (elev < 100)   return new THREE.Color(0xc4b47a)
  // 低地：绿色
  if (elev < 300)   return new THREE.Color(0x6a9a4a)
  if (elev < 800)   return new THREE.Color(0x4a7a32)
  // 山地：棕色
  if (elev < 1500)  return new THREE.Color(0x7a6040)
  if (elev < 3000)  return new THREE.Color(0x8a7050)
  // 雪线以上
  return new THREE.Color(0xe8e8f0)
}

// ==================== 创建地形 ====================
const createTerrain = (data: TerrainData) => {
  if (!scene) return

  const { elevationData, width, height, minElev, maxElev, elevRange } = data

  // 清除旧对象
  clearGroup(terrainGroup)
  clearGroup(annotationGroup)
  clearGroup(contourGroup)

  terrainGroup = new THREE.Group()
  currentElevData = { minElev, maxElev, elevRange }
  currentElevArray = elevationData
  currentTerrainSize = { width, height }

  const gridSize = Math.min(width, height, GRID_MAX)
  const stepX = width / gridSize
  const stepY = height / gridSize

  // 计算海平面在归一化坐标中的高度
  const seaLevelY = elevToY(0, minElev, elevRange)

  // ---------- 顶面地形 ----------
  const topGeometry = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, gridSize - 1, gridSize - 1)
  const positions = topGeometry.attributes.position
  const colors: number[] = []

  for (let i = 0; i < positions.count; i++) {
    const geoRow = Math.floor(i / gridSize)
    const geoCol = i % gridSize

    const srcRow = Math.min(Math.floor(geoRow * stepY), height - 1)
    const srcCol = Math.min(Math.floor(geoCol * stepX), width - 1)
    const dataIdx = srcRow * width + srcCol

    const elev = elevationData[dataIdx] || 0
    const y = elevToY(elev, minElev, elevRange)
    positions.setZ(i, elev === -32767 ? 0 : y)

    const color = getElevationColor(elev)
    colors.push(color.r, color.g, color.b)
  }

  topGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  topGeometry.computeVertexNormals()

  const topMaterial = new THREE.MeshPhongMaterial({
    vertexColors: true,
    flatShading: true,
    shininess: 15,
  })

  terrainMesh = new THREE.Mesh(topGeometry, topMaterial)
  terrainMesh.rotation.x = -Math.PI / 2
  terrainGroup.add(terrainMesh)

  // ---------- 真实侧面剖面 ----------
  createSideProfiles(elevationData, width, height, gridSize, stepX, stepY, minElev, elevRange)

  // ---------- 底面 ----------
  const bottomGeometry = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE)
  const bottomMaterial = new THREE.MeshBasicMaterial({ color: 0x050a14, side: THREE.BackSide })
  const bottomMesh = new THREE.Mesh(bottomGeometry, bottomMaterial)
  bottomMesh.rotation.x = -Math.PI / 2
  bottomMesh.position.y = BASE_HEIGHT
  terrainGroup.add(bottomMesh)

  // ---------- 半透明海平面 ----------
  if (minElev < 0) {
    const seaGeometry = new THREE.PlaneGeometry(TERRAIN_SIZE + 4, TERRAIN_SIZE + 4)
    const seaMaterial = new THREE.MeshPhongMaterial({
      color: 0x3388cc,
      transparent: true,
      opacity: SEA_LEVEL_OPACITY,
      side: THREE.DoubleSide,
      depthWrite: false,
      shininess: 90,
    })
    const seaMesh = new THREE.Mesh(seaGeometry, seaMaterial)
    seaMesh.rotation.x = -Math.PI / 2
    seaMesh.position.y = seaLevelY
    terrainGroup.add(seaMesh)
  }

  scene.add(terrainGroup)

  // ---------- 标注 ----------
  createAnnotations(minElev, maxElev, elevRange)

  // ---------- 等深线 ----------
  createContourLines(elevationData, width, height, gridSize, stepX, stepY, minElev, elevRange)

  // ---------- 路线 ----------
  updateRouteLine()

  // 调整相机
  if (camera) {
    camera.position.set(0, 100, 150)
    camera.lookAt(0, 0, 0)
  }
}

// 高程转 Y 坐标 (带夸张)
const elevToY = (elev: number, minElev: number, elevRange: number): number => {
  return ((elev - minElev) / elevRange) * ELEV_MAP_RANGE * EXAGGERATION / 3
}

// ==================== 真实侧面剖面 ====================
const createSideProfiles = (
  elevationData: Int16Array,
  dataW: number, dataH: number,
  gridSize: number, stepX: number, stepY: number,
  minElev: number, elevRange: number
) => {
  if (!terrainGroup) return

  const half = TERRAIN_SIZE / 2
  const sideDarkColor = new THREE.Color(0x0a1628)

  // 四条边：前(south z=+50), 后(north z=-50), 左(west x=-50), 右(east x=+50)
  const edges = [
    { name: 'south', getElev: (i: number) => { const r = dataH - 1; const c = Math.min(Math.floor(i * stepX), dataW - 1); return elevationData[r * dataW + c] || 0 }, axis: 'x', z: half },
    { name: 'north', getElev: (i: number) => { const c = Math.min(Math.floor(i * stepX), dataW - 1); return elevationData[c] || 0 }, axis: 'x', z: -half },
    { name: 'west',  getElev: (i: number) => { const r = Math.min(Math.floor(i * stepY), dataH - 1); return elevationData[r * dataW] || 0 }, axis: 'z', x: -half },
    { name: 'east',  getElev: (i: number) => { const r = Math.min(Math.floor(i * stepY), dataH - 1); return elevationData[r * dataW + dataW - 1] || 0 }, axis: 'z', x: half },
  ]

  for (const edge of edges) {
    const vertices: number[] = []
    const faceColors: number[] = []
    const indices: number[] = []

    for (let i = 0; i < gridSize; i++) {
      const elev = edge.getElev(i)
      const topY = elev === -32767 ? 0 : elevToY(elev, minElev, elevRange)
      const posAlong = -half + (i / (gridSize - 1)) * TERRAIN_SIZE
      const topColor = getElevationColor(elev)

      if (edge.axis === 'x') {
        vertices.push(posAlong, topY, edge.z as number)
        vertices.push(posAlong, BASE_HEIGHT, edge.z as number)
      } else {
        const zPos = -half + (i / (gridSize - 1)) * TERRAIN_SIZE
        vertices.push(edge.x as number, topY, zPos)
        vertices.push(edge.x as number, BASE_HEIGHT, zPos)
      }

      faceColors.push(topColor.r, topColor.g, topColor.b)
      faceColors.push(sideDarkColor.r, sideDarkColor.g, sideDarkColor.b)
    }

    for (let i = 0; i < gridSize - 1; i++) {
      const a = i * 2
      const b = i * 2 + 1
      const c = i * 2 + 2
      const d = i * 2 + 3

      if (edge.name === 'south' || edge.name === 'east') {
        indices.push(a, c, b, b, c, d)
      } else {
        indices.push(a, b, c, b, d, c)
      }
    }

    const geom = new THREE.BufferGeometry()
    geom.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
    geom.setAttribute('color', new THREE.Float32BufferAttribute(faceColors, 3))
    geom.setIndex(indices)
    geom.computeVertexNormals()

    const mat = new THREE.MeshPhongMaterial({
      vertexColors: true,
      flatShading: true,
      shininess: 5,
    })
    terrainGroup.add(new THREE.Mesh(geom, mat))
  }
}

// ==================== 标注系统 ====================
const createAnnotations = (minElev: number, maxElev: number, elevRange: number) => {
  if (!scene || !currentExtentLonLat) return

  clearGroup(annotationGroup)
  annotationGroup = new THREE.Group()

  const half = TERRAIN_SIZE / 2
  const [lonMin, latMin, lonMax, latMax] = currentExtentLonLat

  // ---------- 方向标签 ----------
  const directions = [
    { text: 'N', pos: new THREE.Vector3(0, 5, -(half + 8)) },
    { text: 'S', pos: new THREE.Vector3(0, 5, half + 8) },
    { text: 'E', pos: new THREE.Vector3(half + 8, 5, 0) },
    { text: 'W', pos: new THREE.Vector3(-(half + 8), 5, 0) },
  ]

  for (const dir of directions) {
    const sprite = createTextSprite(dir.text, {
      fontSize: 28,
      fontWeight: 'bold',
      color: dir.text === 'N' ? '#ff6b6b' : '#aabbcc',
      bgColor: 'rgba(10,20,40,0.7)',
      padding: 6,
    })
    sprite.position.copy(dir.pos)
    sprite.scale.set(8, 8, 1)
    annotationGroup.add(sprite)
  }

  // ---------- 经纬度网格线 (底面) ----------
  const gridLineMat = new THREE.LineBasicMaterial({ color: 0x1a2a45, transparent: true, opacity: 0.5 })
  const lonStep = (lonMax - lonMin) / 4
  const latStep = (latMax - latMin) / 4

  for (let i = 0; i <= 4; i++) {
    const t = i / 4
    const pos = -half + t * TERRAIN_SIZE

    const lonLineGeom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(pos, BASE_HEIGHT + 0.1, -half),
      new THREE.Vector3(pos, BASE_HEIGHT + 0.1, half),
    ])
    annotationGroup.add(new THREE.Line(lonLineGeom, gridLineMat))

    const latLineGeom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-half, BASE_HEIGHT + 0.1, pos),
      new THREE.Vector3(half, BASE_HEIGHT + 0.1, pos),
    ])
    annotationGroup.add(new THREE.Line(latLineGeom, gridLineMat))

    // 经度标签
    const lonVal = lonMin + i * lonStep
    const lonSprite = createTextSprite(lonVal.toFixed(2) + '°', {
      fontSize: 14,
      color: '#6688aa',
      bgColor: 'transparent',
    })
    lonSprite.position.set(pos, BASE_HEIGHT + 1, half + 5)
    lonSprite.scale.set(6, 3, 1)
    annotationGroup.add(lonSprite)

    // 纬度标签
    const latVal = latMax - i * latStep
    const latSprite = createTextSprite(latVal.toFixed(2) + '°', {
      fontSize: 14,
      color: '#6688aa',
      bgColor: 'transparent',
    })
    latSprite.position.set(-(half + 8), BASE_HEIGHT + 1, pos)
    latSprite.scale.set(6, 3, 1)
    annotationGroup.add(latSprite)
  }

  // ---------- 比例尺 ----------
  const lonDistKm = haversineDistance(lonMin, (latMin + latMax) / 2, lonMax, (latMin + latMax) / 2)
  const scaleBarKm = getNiceScaleValue(lonDistKm / 3)
  const scaleBarWidth = (scaleBarKm / lonDistKm) * TERRAIN_SIZE

  const scaleY = BASE_HEIGHT + 0.5
  const scaleZ = half + 3
  const scaleStartX = half - scaleBarWidth - 2

  const scaleBarPoints = [
    new THREE.Vector3(scaleStartX, scaleY, scaleZ),
    new THREE.Vector3(scaleStartX + scaleBarWidth, scaleY, scaleZ),
  ]
  const scaleBarGeom = new THREE.BufferGeometry().setFromPoints(scaleBarPoints)
  const scaleBarMat = new THREE.LineBasicMaterial({ color: 0xccddee, linewidth: 2 })
  annotationGroup.add(new THREE.Line(scaleBarGeom, scaleBarMat))

  for (const x of [scaleStartX, scaleStartX + scaleBarWidth]) {
    const tickGeom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(x, scaleY - 1.5, scaleZ),
      new THREE.Vector3(x, scaleY + 1.5, scaleZ),
    ])
    annotationGroup.add(new THREE.Line(tickGeom, scaleBarMat))
  }

  const scaleText = scaleBarKm >= 1 ? `${scaleBarKm.toFixed(0)} km` : `${(scaleBarKm * 1000).toFixed(0)} m`
  const scaleSprite = createTextSprite(scaleText, {
    fontSize: 14,
    color: '#ccddee',
    bgColor: 'rgba(10,20,40,0.6)',
    padding: 3,
  })
  scaleSprite.position.set(scaleStartX + scaleBarWidth / 2, scaleY + 4, scaleZ)
  scaleSprite.scale.set(6, 3, 1)
  annotationGroup.add(scaleSprite)

  // ---------- 水深刻度 ----------
  const depthTicks = [0, -500, -1000, -2000, -3000, -4000, -5000].filter(d => d >= minElev && d <= maxElev)
  for (const depthVal of depthTicks) {
    const y = elevToY(depthVal, minElev, elevRange)
    const label = depthVal === 0 ? '海平面' : `${depthVal}m`
    const tickSprite = createTextSprite(label, {
      fontSize: 12,
      color: depthVal === 0 ? '#55cc88' : '#7799bb',
      bgColor: 'rgba(10,20,40,0.5)',
      padding: 2,
    })
    tickSprite.position.set(-(half + 6), y, -(half + 2))
    tickSprite.scale.set(7, 3, 1)
    annotationGroup.add(tickSprite)

    const tickLineGeom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-(half + 1), y, -half),
      new THREE.Vector3(-half, y, -half),
    ])
    const tickLineMat = new THREE.LineBasicMaterial({
      color: depthVal === 0 ? 0x55cc88 : 0x445566,
    })
    annotationGroup.add(new THREE.Line(tickLineGeom, tickLineMat))
  }

  scene.add(annotationGroup)
}

// ==================== 等深线 ====================
const createContourLines = (
  elevationData: Int16Array,
  dataW: number, dataH: number,
  gridSize: number, stepX: number, stepY: number,
  minElev: number, elevRange: number
) => {
  if (!scene) return

  clearGroup(contourGroup)
  contourGroup = new THREE.Group()

  const half = TERRAIN_SIZE / 2

  for (const depth of CONTOUR_DEPTHS) {
    if (depth < minElev || depth > 0) continue

    const contourPoints: THREE.Vector3[] = []

    // Marching squares 简化版
    for (let row = 0; row < gridSize - 1; row++) {
      for (let col = 0; col < gridSize - 1; col++) {
        const srcR0 = Math.min(Math.floor(row * stepY), dataH - 1)
        const srcC0 = Math.min(Math.floor(col * stepX), dataW - 1)
        const srcR1 = Math.min(Math.floor((row + 1) * stepY), dataH - 1)
        const srcC1 = Math.min(Math.floor((col + 1) * stepX), dataW - 1)

        const e00 = elevationData[srcR0 * dataW + srcC0] || 0
        const e10 = elevationData[srcR0 * dataW + srcC1] || 0
        const e01 = elevationData[srcR1 * dataW + srcC0] || 0
        const e11 = elevationData[srcR1 * dataW + srcC1] || 0

        const cellEdges = [
          { a: e00, b: e10, r0: row, c0: col, r1: row, c1: col + 1 },
          { a: e01, b: e11, r0: row + 1, c0: col, r1: row + 1, c1: col + 1 },
          { a: e00, b: e01, r0: row, c0: col, r1: row + 1, c1: col },
          { a: e10, b: e11, r0: row, c0: col + 1, r1: row + 1, c1: col + 1 },
        ]

        for (const edge of cellEdges) {
          if ((edge.a - depth) * (edge.b - depth) < 0) {
            const t = (depth - edge.a) / (edge.b - edge.a)
            const iRow = edge.r0 + t * (edge.r1 - edge.r0)
            const iCol = edge.c0 + t * (edge.c1 - edge.c0)

            const x = -half + (iCol / (gridSize - 1)) * TERRAIN_SIZE
            const z = -half + (iRow / (gridSize - 1)) * TERRAIN_SIZE
            const y = elevToY(depth, minElev, elevRange) + 0.3

            contourPoints.push(new THREE.Vector3(x, y, z))
          }
        }
      }
    }

    if (contourPoints.length > 0) {
      const pointsGeom = new THREE.BufferGeometry().setFromPoints(contourPoints)
      const pointsMat = new THREE.PointsMaterial({
        color: getContourColor(depth),
        size: 0.6,
        transparent: true,
        opacity: 0.6,
      })
      contourGroup.add(new THREE.Points(pointsGeom, pointsMat))
    }
  }

  scene.add(contourGroup)
}

const getContourColor = (depth: number): number => {
  if (depth >= -500) return 0x88ccee
  if (depth >= -1000) return 0x66aacc
  if (depth >= -2000) return 0x4488aa
  if (depth >= -3000) return 0x336688
  return 0x224466
}

// ==================== 路线绘制 ====================
const updateRouteLine = () => {
  if (!scene || !currentExtentLonLat || !currentElevData) return

  clearGroup(routeGroup)
  routeGroup = new THREE.Group()

  const route = currentRoute.value
  if (!route || !route.points || route.points.length < 2) {
    scene.add(routeGroup)
    return
  }

  const [extMinX, extMinY, extMaxX, extMaxY] = currentExtentLonLat

  const lonLatTo3D = (lon: number, lat: number) => {
    const x = ((lon - extMinX) / (extMaxX - extMinX) - 0.5) * TERRAIN_SIZE
    const z = (0.5 - (lat - extMinY) / (extMaxY - extMinY)) * TERRAIN_SIZE
    const terrainY = getTerrainHeight(x, z)
    return { x, z, y: terrainY + CABLE_OFFSET }
  }

  const isInExtent = (lon: number, lat: number) => {
    const margin = (extMaxX - extMinX) * 0.1
    return lon >= extMinX - margin && lon <= extMaxX + margin &&
           lat >= extMinY - margin && lat <= extMaxY + margin
  }

  const segmentIntersectsExtent = (lon1: number, lat1: number, lon2: number, lat2: number) => {
    if (isInExtent(lon1, lat1) || isInExtent(lon2, lat2)) return true
    const sMinX = Math.min(lon1, lon2), sMaxX = Math.max(lon1, lon2)
    const sMinY = Math.min(lat1, lat2), sMaxY = Math.max(lat1, lat2)
    return sMinX <= extMaxX && sMaxX >= extMinX && sMinY <= extMaxY && sMaxY >= extMinY
  }

  // 收集可见点
  const pointIndicesToShow = new Set<number>()
  const points = route.points

  for (let i = 0; i < points.length; i++) {
    const [lon, lat] = points[i].coordinates
    if (isInExtent(lon, lat)) {
      pointIndicesToShow.add(i)
      if (i > 0) pointIndicesToShow.add(i - 1)
      if (i < points.length - 1) pointIndicesToShow.add(i + 1)
    }
  }

  for (let i = 0; i < points.length - 1; i++) {
    const [lon1, lat1] = points[i].coordinates
    const [lon2, lat2] = points[i + 1].coordinates
    if (segmentIntersectsExtent(lon1, lat1, lon2, lat2)) {
      pointIndicesToShow.add(i)
      pointIndicesToShow.add(i + 1)
    }
  }

  const mainTrunkPoints: Array<{ x: number; z: number; y: number }> = []
  const branchInfos: Array<{ fromPos: { x: number; z: number; y: number }; toPos: { x: number; z: number; y: number } }> = []

  const sortedIndices = Array.from(pointIndicesToShow).sort((a, b) => a - b)
  for (const idx of sortedIndices) {
    const point = points[idx]
    const [lon, lat] = point.coordinates
    const pos3D = lonLatTo3D(lon, lat)
    mainTrunkPoints.push(pos3D)

    if (point.branchTo && isInExtent(lon, lat)) {
      const [branchLon, branchLat] = point.branchTo.coord
      if (isInExtent(branchLon, branchLat)) {
        branchInfos.push({ fromPos: pos3D, toPos: lonLatTo3D(branchLon, branchLat) })
      }
    }
  }

  // ---------- 主干线 (细管 + 发光外管) ----------
  if (mainTrunkPoints.length >= 2) {
    const pts3D = mainTrunkPoints.map(p => new THREE.Vector3(p.x, p.y, p.z))
    const curve = new THREE.CatmullRomCurve3(pts3D)

    // 第一遍：沿曲线密集采样并贴地
    const numSamples = 600
    const snappedPoints: THREE.Vector3[] = []
    for (let i = 0; i <= numSamples; i++) {
      const t = i / numSamples
      const pt = curve.getPoint(t)
      const tY = getTerrainHeight(pt.x, pt.z)
      snappedPoints.push(new THREE.Vector3(pt.x, tY + CABLE_OFFSET, pt.z))
    }

    // 第二遍：再次检查确保不穿入地形（用中点细分）
    const finalPoints: THREE.Vector3[] = [snappedPoints[0]]
    for (let i = 1; i < snappedPoints.length; i++) {
      const prev = finalPoints[finalPoints.length - 1]
      const curr = snappedPoints[i]
      // 在两点之间插入中点检查
      const midX = (prev.x + curr.x) / 2
      const midZ = (prev.z + curr.z) / 2
      const midTerrainY = getTerrainHeight(midX, midZ) + CABLE_OFFSET
      const midCableY = (prev.y + curr.y) / 2
      if (midCableY < midTerrainY) {
        // 中点会穿入地形，插入一个修正点
        finalPoints.push(new THREE.Vector3(midX, midTerrainY, midZ))
      }
      finalPoints.push(curr)
    }

    // 使用折线路径（不再用 CatmullRomCurve3 二次插值，避免超调穿入）
    const pathClass = class extends THREE.Curve<THREE.Vector3> {
      pts: THREE.Vector3[]
      constructor(pts: THREE.Vector3[]) { super(); this.pts = pts }
      getPoint(t: number): THREE.Vector3 {
        const idx = t * (this.pts.length - 1)
        const i = Math.min(Math.floor(idx), this.pts.length - 2)
        const f = idx - i
        return new THREE.Vector3().lerpVectors(this.pts[i], this.pts[i + 1], f)
      }
    }
    const linePath = new pathClass(finalPoints)

    // 内管 (实心)
    const tubeSegments = Math.min(finalPoints.length, 800)
    const tubeGeom = new THREE.TubeGeometry(linePath, tubeSegments, CABLE_RADIUS, 6, false)
    const tubeMat = new THREE.MeshPhongMaterial({
      color: 0xff4444,
      shininess: 80,
      emissive: 0x661111,
    })
    routeGroup.add(new THREE.Mesh(tubeGeom, tubeMat))

    // 外管 (发光)
    const glowGeom = new THREE.TubeGeometry(linePath, tubeSegments, CABLE_GLOW_RADIUS, 6, false)
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0xff6644,
      transparent: true,
      opacity: 0.15,
      depthWrite: false,
    })
    routeGroup.add(new THREE.Mesh(glowGeom, glowMat))
  }

  // ---------- 分支线 ----------
  for (const branch of branchInfos) {
    const branchSampled: THREE.Vector3[] = []
    const bSeg = 50
    for (let i = 0; i <= bSeg; i++) {
      const t = i / bSeg
      const x = branch.fromPos.x + (branch.toPos.x - branch.fromPos.x) * t
      const z = branch.fromPos.z + (branch.toPos.z - branch.fromPos.z) * t
      const tY = getTerrainHeight(x, z)
      branchSampled.push(new THREE.Vector3(x, tY + CABLE_OFFSET, z))
    }
    const branchCurve = new THREE.CatmullRomCurve3(branchSampled)
    const branchTubeGeom = new THREE.TubeGeometry(branchCurve, 50, CABLE_RADIUS * 0.8, 6, false)
    const branchTubeMat = new THREE.MeshPhongMaterial({
      color: 0xaa55ff,
      shininess: 80,
      emissive: 0x330066,
    })
    routeGroup.add(new THREE.Mesh(branchTubeGeom, branchTubeMat))
  }

  // ---------- 关键点标记 ----------
  for (const idx of sortedIndices) {
    const point = points[idx]
    const [lon, lat] = point.coordinates
    if (!isInExtent(lon, lat)) continue

    const pos = lonLatTo3D(lon, lat)

    // 起点/终点 - 锥体
    if (idx === 0 || idx === points.length - 1) {
      const coneGeom = new THREE.ConeGeometry(1.5, 4, 8)
      const coneMat = new THREE.MeshPhongMaterial({
        color: idx === 0 ? 0x44ee66 : 0xee4444,
        emissive: idx === 0 ? 0x115522 : 0x551111,
      })
      const cone = new THREE.Mesh(coneGeom, coneMat)
      cone.position.set(pos.x, pos.y + 3, pos.z)
      routeGroup.add(cone)

      const label = idx === 0 ? '起点' : '终点'
      const labelSprite = createTextSprite(point.name || label, {
        fontSize: 14,
        color: idx === 0 ? '#44ee66' : '#ee4444',
        bgColor: 'rgba(10,20,40,0.8)',
        padding: 4,
      })
      labelSprite.position.set(pos.x, pos.y + 8, pos.z)
      labelSprite.scale.set(8, 4, 1)
      routeGroup.add(labelSprite)
    }

    // 分支器 - 蓝色球
    if (point.type === 'branching') {
      const sphereGeom = new THREE.SphereGeometry(1.2, 12, 12)
      const sphereMat = new THREE.MeshPhongMaterial({
        color: 0x4488ff,
        emissive: 0x112244,
      })
      const sphere = new THREE.Mesh(sphereGeom, sphereMat)
      sphere.position.set(pos.x, pos.y + 1.5, pos.z)
      routeGroup.add(sphere)
    }

    // 中继器 - 黄色球
    if (point.type === 'repeater') {
      const sphereGeom = new THREE.SphereGeometry(1.0, 12, 12)
      const sphereMat = new THREE.MeshPhongMaterial({
        color: 0xffcc33,
        emissive: 0x332200,
      })
      const sphere = new THREE.Mesh(sphereGeom, sphereMat)
      sphere.position.set(pos.x, pos.y + 1.5, pos.z)
      routeGroup.add(sphere)
    }
  }

  scene.add(routeGroup)
}

// ==================== 获取地形高度（双线性插值）====================
const getTerrainHeight = (x: number, z: number): number => {
  if (!currentElevArray || !currentTerrainSize || !currentElevData) return 0

  const { width, height } = currentTerrainSize
  const { minElev, elevRange } = currentElevData

  // 地形网格分辨率（与 createTerrain 中一致）
  const gridSize = Math.min(width, height, GRID_MAX)
  const stepX = width / gridSize
  const stepY = height / gridSize

  // 3D 坐标 → 网格坐标（与 PlaneGeometry 顶点对齐）
  const normX = (x / TERRAIN_SIZE + 0.5)
  const normZ = (z / TERRAIN_SIZE + 0.5)
  const gCol = normX * (gridSize - 1)
  const gRow = normZ * (gridSize - 1)

  const col0 = Math.max(0, Math.min(gridSize - 2, Math.floor(gCol)))
  const row0 = Math.max(0, Math.min(gridSize - 2, Math.floor(gRow)))
  const col1 = col0 + 1
  const row1 = row0 + 1
  const fx = gCol - col0
  const fz = gRow - row0

  // 采样原始数据（与 createTerrain 中相同的采样方式）
  const sampleElev = (gr: number, gc: number): number => {
    const sr = Math.min(Math.floor(gr * stepY), height - 1)
    const sc = Math.min(Math.floor(gc * stepX), width - 1)
    const e = currentElevArray![sr * width + sc] || 0
    return e === -32767 ? 0 : elevToY(e, minElev, elevRange)
  }

  // 双线性插值（精确匹配 PlaneGeometry 渲染的表面高度）
  const e00 = sampleElev(row0, col0)
  const e10 = sampleElev(row0, col1)
  const e01 = sampleElev(row1, col0)
  const e11 = sampleElev(row1, col1)

  const top = e00 + (e10 - e00) * fx
  const bot = e01 + (e11 - e01) * fx
  return top + (bot - top) * fz
}

// 3D 坐标 → 经纬度
const posToLonLat = (x: number, z: number): { lon: number; lat: number } | null => {
  if (!currentExtentLonLat) return null
  const [lonMin, latMin, lonMax, latMax] = currentExtentLonLat
  const normX = x / TERRAIN_SIZE + 0.5
  const normZ = z / TERRAIN_SIZE + 0.5
  return {
    lon: lonMin + normX * (lonMax - lonMin),
    lat: latMax - normZ * (latMax - latMin),
  }
}

// 3D 坐标 → 原始高程值
const getRawElevation = (x: number, z: number): number => {
  if (!currentElevArray || !currentTerrainSize) return 0
  const { width, height } = currentTerrainSize
  const normX = (x / TERRAIN_SIZE + 0.5)
  const normZ = (z / TERRAIN_SIZE + 0.5)
  const col = Math.max(0, Math.min(width - 1, Math.floor(normX * (width - 1))))
  const row = Math.max(0, Math.min(height - 1, Math.floor(normZ * (height - 1))))
  const elev = currentElevArray[row * width + col]
  return elev === -32767 ? 0 : elev
}

// ==================== 鼠标交互 ====================
const handleMouseMove = (e: MouseEvent) => {
  if (!containerRef.value || !raycaster || !mouse || !camera || !terrainMesh) return

  const rect = containerRef.value.getBoundingClientRect()
  mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
  mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1

  raycaster.setFromCamera(mouse, camera)

  const intersects = raycaster.intersectObject(terrainMesh)
  if (intersects.length > 0) {
    const hit = intersects[0].point
    const lonLat = posToLonLat(hit.x, hit.z)
    const rawElev = getRawElevation(hit.x, hit.z)

    if (lonLat) {
      hoverInfo.value = {
        visible: true,
        x: e.clientX - rect.left + 15,
        y: e.clientY - rect.top - 10,
        lon: lonLat.lon,
        lat: lonLat.lat,
        depth: rawElev,
        onCable: false,
      }
      return
    }
  }

  hoverInfo.value.visible = false
}

const handleMouseLeave = () => {
  hoverInfo.value.visible = false
}

// ==================== 工具函数 ====================
const clearGroup = (group: THREE.Group | null) => {
  if (!group || !scene) return
  scene.remove(group)
  group.traverse((child) => {
    if (child instanceof THREE.Mesh || child instanceof THREE.Line || child instanceof THREE.Points) {
      child.geometry.dispose()
      const mat = child.material
      if (Array.isArray(mat)) mat.forEach(m => m.dispose())
      else if (mat instanceof THREE.Material) mat.dispose()
    }
    if (child instanceof THREE.Sprite) {
      child.material.map?.dispose()
      child.material.dispose()
    }
  })
}

const createTextSprite = (text: string, opts: {
  fontSize?: number
  fontWeight?: string
  color?: string
  bgColor?: string
  padding?: number
}): THREE.Sprite => {
  const fontSize = opts.fontSize || 16
  const fontWeight = opts.fontWeight || 'normal'
  const color = opts.color || '#ffffff'
  const bgColor = opts.bgColor || 'rgba(0,0,0,0.5)'
  const padding = opts.padding || 4

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  ctx.font = `${fontWeight} ${fontSize}px Arial, sans-serif`
  const metrics = ctx.measureText(text)
  const textWidth = metrics.width

  canvas.width = Math.ceil(textWidth + padding * 2)
  canvas.height = Math.ceil(fontSize * 1.4 + padding * 2)

  if (bgColor !== 'transparent') {
    ctx.fillStyle = bgColor
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }

  ctx.font = `${fontWeight} ${fontSize}px Arial, sans-serif`
  ctx.fillStyle = color
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, canvas.width / 2, canvas.height / 2)

  const texture = new THREE.CanvasTexture(canvas)
  texture.minFilter = THREE.LinearFilter
  const spriteMat = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
  })
  return new THREE.Sprite(spriteMat)
}

const haversineDistance = (lon1: number, lat1: number, lon2: number, lat2: number): number => {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

const getNiceScaleValue = (approxKm: number): number => {
  const nice = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000]
  for (const v of nice) {
    if (v >= approxKm * 0.5) return v
  }
  return nice[nice.length - 1]
}

// ==================== resize ====================
const handleResize = () => {
  if (!containerRef.value || !camera || !renderer) return
  const width = containerRef.value.clientWidth
  const height = containerRef.value.clientHeight
  camera.aspect = width / height
  camera.updateProjectionMatrix()
  renderer.setSize(width, height)
}

// ==================== 生命周期 ====================
watch(() => props.extent, (newExtent) => {
  if (newExtent) loadTerrainData(newExtent)
}, { immediate: true })

watch([() => routeStore.paretoRoutes, () => routeStore.currentRouteId], () => {
  if (hasData.value) updateRouteLine()
}, { deep: true })

onMounted(() => {
  initScene()
  window.addEventListener('resize', handleResize)
  containerRef.value?.addEventListener('mousemove', handleMouseMove)
  containerRef.value?.addEventListener('mouseleave', handleMouseLeave)
  if (props.extent) loadTerrainData(props.extent)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  containerRef.value?.removeEventListener('mousemove', handleMouseMove)
  containerRef.value?.removeEventListener('mouseleave', handleMouseLeave)
  if (animationId) cancelAnimationFrame(animationId)

  clearGroup(terrainGroup)
  clearGroup(routeGroup)
  clearGroup(annotationGroup)
  clearGroup(contourGroup)

  if (renderer) {
    renderer.dispose()
    renderer.domElement.remove()
  }

  scene = null
  camera = null
  renderer = null
  controls = null
  terrainGroup = null
  routeGroup = null
  annotationGroup = null
  contourGroup = null
  terrainMesh = null
  isInitialized.value = false
})
</script>

<template>
  <div ref="containerRef" class="w-full h-full min-h-[150px] relative bg-[#070d1a] rounded overflow-hidden">
    <!-- 加载中 -->
    <div v-if="loading" class="absolute inset-0 flex flex-col items-center justify-center gap-2 text-gray-400 text-xs z-10">
      <Loader2 class="w-6 h-6 text-primary animate-spin" />
      <span>加载地形数据...</span>
    </div>

    <!-- 无数据 -->
    <div v-if="!hasData && !loading" class="absolute inset-0 flex items-center justify-center text-gray-400 text-xs">
      <span>框选区域后显示 3D 地形</span>
    </div>

    <!-- 鼠标悬停 tooltip -->
    <div
      v-if="hoverInfo.visible"
      class="absolute pointer-events-none z-20 bg-black/85 text-white px-2.5 py-1.5 rounded-md text-xs shadow-lg border border-white/10"
      :style="{ left: hoverInfo.x + 'px', top: hoverInfo.y + 'px' }"
    >
      <div class="text-gray-300">
        {{ hoverInfo.lon.toFixed(4) }}°E, {{ hoverInfo.lat.toFixed(4) }}°N
      </div>
      <div class="font-medium" :class="hoverInfo.depth >= 0 ? 'text-green-400' : 'text-cyan-400'">
        {{ hoverInfo.depth >= 0 ? `海拔 ${hoverInfo.depth.toFixed(0)}m` : `水深 ${Math.abs(hoverInfo.depth).toFixed(0)}m` }}
      </div>
    </div>

    <!-- 图例 -->
    <div v-if="hasData" class="absolute bottom-2 right-2 bg-black/60 text-[10px] text-gray-300 px-2 py-1.5 rounded border border-white/10 z-10 leading-relaxed">
      <div class="flex items-center gap-1.5"><span class="inline-block w-2.5 h-2.5 rounded-full bg-red-500"></span> 主干缆线</div>
      <div class="flex items-center gap-1.5"><span class="inline-block w-2.5 h-2.5 rounded-full bg-purple-400"></span> 分支缆线</div>
      <div class="flex items-center gap-1.5"><span class="inline-block w-2.5 h-2.5 rounded-full bg-green-400"></span> 起点</div>
      <div class="flex items-center gap-1.5"><span class="inline-block w-2.5 h-2.5 rounded-full bg-red-400"></span> 终点</div>
      <div class="flex items-center gap-1.5"><span class="inline-block w-2.5 h-2.5 rounded-full bg-yellow-400"></span> 中继器</div>
      <div class="flex items-center gap-1.5"><span class="inline-block w-2.5 h-2.5 rounded-full bg-blue-400"></span> 分支器</div>
    </div>
  </div>
</template>
