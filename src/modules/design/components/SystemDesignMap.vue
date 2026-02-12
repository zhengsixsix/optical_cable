<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed } from 'vue'
import { useRouteStore, useRPLStore, useMonitorStore, useConnectorStore } from '@/stores'
import { fetchDemPoint, checkDemService } from '@/services/DemApiService'
import { calculateDistance } from '@/utils/geo'
import Map from 'ol/Map'
import View from 'ol/View'
import TileLayer from 'ol/layer/Tile'
import WebGLTileLayer from 'ol/layer/WebGLTile'
import GeoTIFF from 'ol/source/GeoTIFF'
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import OSM from 'ol/source/OSM'
import Feature from 'ol/Feature'
import Point from 'ol/geom/Point'
import LineString from 'ol/geom/LineString'
import { Style, Stroke, Icon, Text, Fill, Circle as CircleStyle } from 'ol/style'
import { DragPan, Translate } from 'ol/interaction'
import 'ol/ol.css'

// 站点高程缓存（用于判断岸上/水下）
const elevationCache = ref<Record<string, number>>({})

interface RoutePoint {
  id: string
  name: string
  type: string
  longitude: number
  latitude: number
  kp?: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any
}

const props = withDefaults(defineProps<{
  routePoints: RoutePoint[]
  selectedPointId?: string | null
  editable?: boolean
  /** Step 6.2: 启用放大器沿路由拖拽 */
  draggableAmplifiers?: boolean
}>(), {
  draggableAmplifiers: false
})

const routeStore = useRouteStore()
const rplStore = useRPLStore()
const monitorStore = useMonitorStore()
const connectorStore = useConnectorStore()

const emit = defineEmits<{
  (e: 'point-click', pointId: string): void
  (e: 'bu-dblclick', buId: string): void  // 双击 BU 节点打开配置对话框
  (e: 'line-click'): void
  (e: 'segment-click', segmentIndex: number): void
  (e: 'context-menu', type: 'point' | 'line' | 'segment', id: string | null, x: number, y: number): void
  (e: 'edit', type: 'point' | 'line' | 'segment', id: string | null): void
  (e: 'delete', type: 'point' | 'line' | 'segment', id: string | null): void
  /** Step 6.2: 放大器拖拽完成 */
  (e: 'amplifier-moved', data: { id: string; newKp: number; longitude: number; latitude: number }): void
}>()

// 右键菜单状态
const contextMenu = ref<{ visible: boolean; x: number; y: number; type: 'point' | 'line' | 'segment'; id: string | null }>({
  visible: false, x: 0, y: 0, type: 'point', id: null
})

// 选中的线段索引（-1表示未选中）
const selectedSegmentIndex = ref<number>(-1)

const mapContainer = ref<HTMLElement | null>(null)
const coordinates = ref({ lon: 0, lat: 0 })

let map: Map | null = null
let routeSource: VectorSource | null = null
let routeLayer: VectorLayer<VectorSource> | null = null
let pointSource: VectorSource | null = null
let pointLayer: VectorLayer<VectorSource> | null = null

// ========== Step 6.2: 放大器沿路由拖拽 ==========
let translateInteraction: Translate | null = null
const dragTooltip = ref<{ visible: boolean; x: number; y: number; text: string }>({
  visible: false, x: 0, y: 0, text: ''
})

/** 判断 feature 是否是放大器类型 */
const isAmplifierFeature = (feature: Feature) => {
  const ptype = feature.get('pointType')
  return ptype === 'ola' || ptype === 'amplifier_e' || ptype === 'amplifier_w'
}

/** 获取路由线段坐标序列（主干线） */
const getRouteLineCoords = (): [number, number][] => {
  const selectedRoute = routeStore.selectedRoute
  if (selectedRoute?.points?.length) {
    return selectedRoute.points.map(p => p.coordinates as [number, number])
  }
  // 回退：使用 sortedPoints
  return sortedPoints.value
    .filter((p) => !p.isBranchStation)
    .map((p) => [p.longitude, p.latitude] as [number, number])
}

/** 将点投影到最近的路由线段上（snap to route） */
const snapToRoute = (coord: [number, number]): { coord: [number, number]; kp: number } | null => {
  const routeCoords = getRouteLineCoords()
  if (routeCoords.length < 2) return null

  let bestDist = Infinity
  let bestPoint: [number, number] = coord
  let bestKp = 0

  let cumulativeKp = 0
  for (let i = 0; i < routeCoords.length - 1; i++) {
    const [ax, ay] = routeCoords[i]
    const [bx, by] = routeCoords[i + 1]
    // 线段长度
    const segLen = Math.sqrt((bx - ax) ** 2 + (by - ay) ** 2) * 111 // 粗略 km
    // 点到线段投影
    const dx = bx - ax, dy = by - ay
    const lenSq = dx * dx + dy * dy
    if (lenSq === 0) { cumulativeKp += segLen; continue }
    let t = ((coord[0] - ax) * dx + (coord[1] - ay) * dy) / lenSq
    t = Math.max(0, Math.min(1, t))
    const px = ax + t * dx, py = ay + t * dy
    const dist = Math.sqrt((coord[0] - px) ** 2 + (coord[1] - py) ** 2)
    if (dist < bestDist) {
      bestDist = dist
      bestPoint = [px, py]
      bestKp = cumulativeKp + t * segLen
    }
    cumulativeKp += segLen
  }
  return { coord: bestPoint, kp: bestKp }
}

/** 初始化/更新 Translate 交互 */
const setupTranslateInteraction = () => {
  // 清除旧的
  if (translateInteraction && map) {
    map.removeInteraction(translateInteraction)
    translateInteraction = null
  }
  if (!props.draggableAmplifiers || !map || !pointSource) return

  // 使用 filter 函数：只允许拖拽放大器类型的 feature，每次只拖动被点击的那一个
  translateInteraction = new Translate({
    layers: [pointLayer!],
    filter: (feature) => isAmplifierFeature(feature as Feature),
  })

  let dragStartCoord: [number, number] | null = null
  let dragPointId: string | null = null
  let dragStartKp: number = 0

  translateInteraction.on('translatestart', (evt) => {
    const feature = evt.features.item(0)
    if (!feature) return
    dragPointId = feature.get('pointId')
    const geom = feature.getGeometry() as Point
    dragStartCoord = geom.getCoordinates() as [number, number]
    // 找到当前 KP
    const device = sortedPoints.value.find((p) => p.id === dragPointId)
    dragStartKp = device?.kp || 0
    dragTooltip.value.visible = true
  })

  translateInteraction.on('translating', (evt) => {
    const feature = evt.features.item(0)
    if (!feature) return
    const geom = feature.getGeometry() as Point
    const rawCoord = geom.getCoordinates() as [number, number]

    // Snap 到路由
    const snapped = snapToRoute(rawCoord)
    if (snapped) {
      geom.setCoordinates(snapped.coord)
      // 更新 tooltip
      if (map) {
        const pixel = map.getPixelFromCoordinate(snapped.coord)
        dragTooltip.value = {
          visible: true,
          x: pixel[0] + 20,
          y: pixel[1] - 30,
          text: `KP: ${snapped.kp.toFixed(1)} km (原 ${dragStartKp.toFixed(1)})`
        }
      }
    }
    // 注意：拖拽过程中不重绘线路，路由底线是固定的海缆路径不会变
    // 拖拽结束后由 amplifier-moved 事件触发正常的数据更新流程重绘光纤段
  })

  translateInteraction.on('translateend', (evt) => {
    const feature = evt.features.item(0)
    dragTooltip.value.visible = false
    if (!feature || !dragPointId) return

    const geom = feature.getGeometry() as Point
    const finalCoord = geom.getCoordinates() as [number, number]
    const snapped = snapToRoute(finalCoord)
    const newLon = snapped ? snapped.coord[0] : finalCoord[0]
    const newLat = snapped ? snapped.coord[1] : finalCoord[1]
    const newKp = snapped ? snapped.kp : dragStartKp

    emit('amplifier-moved', {
      id: dragPointId,
      newKp,
      longitude: newLon,
      latitude: newLat
    })

    dragPointId = null
    dragStartCoord = null

    // 拖拽结束后主动重绘线路（使用路由拓扑 + 光纤段的正确绘制方式）
    scheduleRedraw(false, true)
  })

  map.addInteraction(translateInteraction)
}

// 监听 draggableAmplifiers 属性变化
watch(() => props.draggableAmplifiers, () => {
  setupTranslateInteraction()
})

// 当点位重绘后重新挂载 translate
watch(() => monitorStore.devices.length, () => {
  if (props.draggableAmplifiers) {
    setTimeout(() => setupTranslateInteraction(), 300)
  }
})

// 根据点类型、选中状态和高程获取图标路径
// elevation < 0 表示在海平面以下（水下）
const getPointIcon = (type: string, isSelected: boolean, elevation?: number) => {
  const suffix = isSelected ? '-select' : ''
  
  // 如果是 landing 类型，根据高程判断是岸上还是水下
  // elevation < 0 表示在海平面以下（水下站点）
  if (type === 'landing') {
    if (elevation !== undefined && elevation < 0) {
      return `/image/underwater${suffix}.png`
    }
    return `/image/landing${suffix}.png`
  }
  
  switch (type) {
    case 'ola':
    case 'amplifier_e':
      return `/image/amplifier-e${suffix}.png`
    case 'amplifier_w':
      return `/image/amplifier-w${suffix}.png`
    case 'bu':
      return `/image/bu${suffix}.png`
    case 'underwater':
      return `/image/underwater${suffix}.png`
    default:
      return `/image/underwater${suffix}.png`
  }
}

// 按 KP 排序的点列表 - 优先使用 monitorStore 数据，然后是 Pareto 选中路线
const sortedPoints = computed(() => {
  // 优先使用 monitorStore 的设备数据（与实时监控页面一致）
  if (monitorStore.devices.length > 0) {
    return [...monitorStore.devices]
      .sort((a, b) => (a.kp || 0) - (b.kp || 0))
      .map(d => ({
        id: d.id,
        name: d.name,
        type: d.type,
        longitude: d.longitude,
        latitude: d.latitude,
        kp: d.kp,
        depth: d.depth || 0, // 保留水深信息，用于区分岸上/水下站点
        // 保留分支站点信息
        isBranchStation: (d as any).isBranchStation || false,
        isBranchRepeater: (d as any).isBranchRepeater || false,
        branchFrom: (d as any).branchFrom || null,
        branchTo: (d as any).branchTo || null,
        branchInfo: (d as any).branchInfo || null,
      }))
  }
  
  // 其次使用 Pareto 选中的路线
  const selectedRoute = routeStore.selectedRoute
  if (selectedRoute && selectedRoute.points.length > 0) {
    let cumulativeKp = 0
    const mainPoints = selectedRoute.points.map((point, index) => {
      // 计算 KP（使用 Haversine 公式）
      if (index > 0) {
        const prevPoint = selectedRoute.points[index - 1]
        const dist = calculateDistance(prevPoint.coordinates, point.coordinates)
        cumulativeKp += dist
      }
      
      // 映射点类型
      let mappedType = 'waypoint'
      if (point.type === 'landing') {
        mappedType = 'landing'
      } else if (point.type === 'repeater') {
        mappedType = 'amplifier_e'
      } else if (point.type === 'branching') {
        mappedType = 'bu'
      }
      
      return {
        id: point.id,
        name: point.name || (point.type === 'landing' ? '登陆站' : point.type === 'branching' ? '分支器' : '节点'),
        type: mappedType,
        longitude: point.coordinates[0],
        latitude: point.coordinates[1],
        kp: cumulativeKp,
        depth: (point as any).depth || 0, // 保留水深信息
        branchTo: point.branchTo // 保留分支目标信息
      }
    })
    
    // 添加分支登陆站
    selectedRoute.points.forEach((point) => {
      if (point.branchTo) {
        cumulativeKp += calculateDistance(
          point.coordinates,
          point.branchTo.coord as [number, number]
        )
        mainPoints.push({
          id: `branch-${point.id}`,
          name: point.branchTo.name,
          type: 'landing',
          longitude: point.branchTo.coord[0],
          latitude: point.branchTo.coord[1],
          kp: cumulativeKp,
          isBranchStation: true,
          branchFrom: point.name // 使用分支器名称
        } as any)
      }
    })
    
    // 合并 connectorStore 中的放大器（系统规划应用配置后生成）
    const ampTypes = ['ola', 'amplifier_e', 'amplifier_w']
    const existingIds = new Set(mainPoints.map(p => p.id))
    const amplifiers = connectorStore.elements.filter(
      e => ampTypes.includes(e.type) && !existingIds.has(e.id)
    )
    amplifiers.forEach(amp => {
      mainPoints.push({
        id: amp.id,
        name: amp.name,
        type: amp.type,
        longitude: amp.longitude,
        latitude: amp.latitude,
        kp: amp.kp,
        depth: amp.depth || 0,
      } as any)
    })
    
    return mainPoints
  }
  
  // 最后使用 props
  if (props.routePoints.length > 0) {
    return [...props.routePoints].sort((a, b) => (a.kp || 0) - (b.kp || 0))
  }
  return []
})

// 更新线路样式（根据选中的线段索引更新样式）
const updateLineStyle = () => {
  if (!routeSource) return
  
  routeSource.getFeatures().forEach(feature => {
    const segmentIndex = feature.get('segmentIndex')
    const isSelected = segmentIndex === selectedSegmentIndex.value
    feature.setStyle(new Style({
      stroke: new Stroke({
        color: isSelected ? '#f59e0b' : '#3b82f6',
        width: isSelected ? 5 : 3,
        lineDash: isSelected ? undefined : [8, 4]
      })
    }))
  })
}

// 获取路线所有点（包括 waypoint）用于绘制弯曲路径
const getAllRoutePoints = computed(() => {
  const selectedRoute = routeStore.selectedRoute
  if (selectedRoute && selectedRoute.points.length > 0) {
    return selectedRoute.points.map((point) => ({
      id: point.id,
      longitude: point.coordinates[0],
      latitude: point.coordinates[1],
      type: point.type,
      name: point.name,
      branchTo: point.branchTo
    }))
  }
  return []
})

// 绘制路径线（使用 segments 拓扑数据绘制，与路由规划地图一致）
const drawRouteLine = () => {
  if (!routeSource) return
  routeSource.clear()
  
  const selectedRoute = routeStore.selectedRoute
  
  // 优先使用路由的 segments 数据绘制（基于实际拓扑连接）
  if (selectedRoute && selectedRoute.segments && selectedRoute.segments.length > 0) {
    // 构建点 ID 到坐标的映射
    const pointMap: Record<string, [number, number]> = {}
    for (const p of selectedRoute.points) {
      pointMap[p.id] = p.coordinates
    }
    
    // 根据 segments 绘制线段
    selectedRoute.segments.forEach((segment, i) => {
      const startCoords = pointMap[segment.startPointId]
      const endCoords = pointMap[segment.endPointId]
      
      if (!startCoords || !endCoords) return
      
      const segmentFeature = new Feature({
        geometry: new LineString([startCoords, endCoords]),
        featureType: 'segment',
        segmentIndex: i,
        fromId: segment.startPointId,
        toId: segment.endPointId
      })
      
      // 使用灰色底线（光纤段存在时作为背景）
      const hasFibers = connectorStore.elements.some(e => e.type === 'fiber')
      segmentFeature.setStyle(new Style({
        stroke: new Stroke({
          color: hasFibers ? '#d1d5db' : '#ef4444',
          width: hasFibers ? 2 : 4
        })
      }))
      
      routeSource!.addFeature(segmentFeature)
    })
    
    // 绘制光纤段覆盖线
    drawFiberLines()
    return
  }
  
  // 回退：如果没有 segments，使用原始路由点绘制（不包括放大器）
  if (!selectedRoute || selectedRoute.points.length < 2) return
  
  // 使用原始路由点绘制线路，不使用 sortedPoints（避免放大器参与绘制）
  const routePoints = selectedRoute.points
  
  for (let i = 0; i < routePoints.length - 1; i++) {
    const startPoint = routePoints[i]
    const endPoint = routePoints[i + 1]
    const isSelected = selectedSegmentIndex.value === i
    
    const segmentFeature = new Feature({
      geometry: new LineString([
        startPoint.coordinates,
        endPoint.coordinates
      ]),
      featureType: 'segment',
      segmentIndex: i,
      fromId: startPoint.id,
      toId: endPoint.id
    })
    
    segmentFeature.setStyle(new Style({
      stroke: new Stroke({
        color: isSelected ? '#f59e0b' : '#ef4444',
        width: isSelected ? 5 : 4
      })
    }))
    
    routeSource.addFeature(segmentFeature)
  }
  
  // 绘制分支线路
  routePoints.forEach((point) => {
    if (point.branchTo && routeSource) {
      const branchFeature = new Feature({
        geometry: new LineString([
          point.coordinates,
          point.branchTo.coord as [number, number]
        ]),
        featureType: 'branch',
        fromId: point.id
      })
      
      branchFeature.setStyle(new Style({
        stroke: new Stroke({
          color: '#8b5cf6',  // 紫色表示分支
          width: 3,
          lineDash: [6, 4]
        })
      }))
      
      routeSource.addFeature(branchFeature)
    }
  })
}

// 绘制光纤段（放大器之间的连线，参考路由规划的海缆段显示）
const drawFiberLines = () => {
  if (!routeSource) return

  // 从 connectorStore 获取光纤段元素
  const fibers = connectorStore.elements.filter(e => e.type === 'fiber')
  if (fibers.length === 0) return

  const selectedRoute = routeStore.selectedRoute
  if (!selectedRoute || !selectedRoute.segments || selectedRoute.segments.length === 0) return

  // 构建点 ID → 坐标映射 & 无向图（遵循实际拓扑）
  // 注意：不能使用 new Map()，因为 ol/Map 导入覆盖了全局 Map 构造函数
  const pointMap: Record<string, [number, number]> = {}
  for (const p of selectedRoute.points) pointMap[p.id] = p.coordinates
  const adj: Record<string, string[]> = {}
  selectedRoute.segments.forEach(seg => {
    if (!adj[seg.startPointId]) adj[seg.startPointId] = []
    if (!adj[seg.endPointId]) adj[seg.endPointId] = []
    adj[seg.startPointId].push(seg.endPointId)
    adj[seg.endPointId].push(seg.startPointId)
  })

  // 计算点到线段的投影（返回最近线段与投影坐标）
  const projectToNearestSegment = (coord: [number, number]) => {
    let best: { seg: any; t: number; snapped: [number, number] } | null = null
    for (const seg of selectedRoute.segments) {
      const a = pointMap[seg.startPointId]
      const b = pointMap[seg.endPointId]
      if (!a || !b) continue
      const ax = a[0], ay = a[1], bx = b[0], by = b[1]
      const dx = bx - ax, dy = by - ay
      const len2 = dx * dx + dy * dy
      if (len2 === 0) continue
      let t = ((coord[0] - ax) * dx + (coord[1] - ay) * dy) / len2
      t = Math.max(0, Math.min(1, t))
      const sx = ax + t * dx, sy = ay + t * dy
      const dist2 = (coord[0] - sx) * (coord[0] - sx) + (coord[1] - sy) * (coord[1] - sy)
      if (!best || dist2 < ((best.snapped[0]-coord[0])**2 + (best.snapped[1]-coord[1])**2)) {
        best = { seg, t, snapped: [sx, sy] }
      }
    }
    return best
  }

  // BFS 寻找两点间的拓扑路径（以路由点为节点）
  const bfsPath = (startId: string, endId: string): string[] => {
    if (startId === endId) return [startId]
    const q: string[] = [startId]
    const prev: Record<string, string | null> = { [startId]: null }
    while (q.length) {
      const cur = q.shift()!
      for (const nb of (adj[cur] || [])) {
        if (!(nb in prev)) {
          prev[nb] = cur
          if (nb === endId) {
            const path: string[] = []
            let p: string | null = nb
            while (p) { path.push(p); p = prev[p] ?? null }
            path.reverse()
            return path
          }
          q.push(nb)
        }
      }
    }
    return []
  }

  // 光纤段交替配色
  const fiberColors = ['#f59e0b', '#fb923c']

  fibers.forEach((fiber, idx) => {
    // 获取起止设备坐标
    const fromDev = connectorStore.elements.find(e => e.id === fiber.fromDeviceId)
    const toDev = connectorStore.elements.find(e => e.id === fiber.toDeviceId)
    if (!fromDev || !toDev) return

    const startProj = projectToNearestSegment([fromDev.longitude, fromDev.latitude])
    const endProj = projectToNearestSegment([toDev.longitude, toDev.latitude])
    if (!startProj || !endProj) return

    // 选择起/终端靠近的端点作为 BFS 的起止节点
    const startA = startProj.seg.startPointId, startB = startProj.seg.endPointId
    const endA = endProj.seg.startPointId, endB = endProj.seg.endPointId

    const choosePath = (s: string, t: string) => bfsPath(s, t)
    const paths: Array<{ path: string[]; score: number; sId: string; tId: string }> = []
    const cands = [
      [startA, endA], [startA, endB], [startB, endA], [startB, endB]
    ] as Array<[string, string]>
    for (const [s, t] of cands) {
      const p = choosePath(s, t)
      if (p.length) {
        // 粗略评分：路径节点数 + 与投影端点的距离
        const sPt = pointMap[s]; const tPt = pointMap[t]
        const sDist = Math.hypot(startProj.snapped[0]-sPt[0], startProj.snapped[1]-sPt[1])
        const tDist = Math.hypot(endProj.snapped[0]-tPt[0], endProj.snapped[1]-tPt[1])
        paths.push({ path: p, score: p.length + sDist + tDist, sId: s, tId: t })
      }
    }
    if (paths.length === 0) return
    paths.sort((a, b) => a.score - b.score)
    const best = paths[0]

    // 组装坐标：起点投影 → 路由点序列 → 终点投影
    const coords: [number, number][] = []
    coords.push(startProj.snapped)
    for (const pid of best.path) coords.push(pointMap[pid])
    coords.push(endProj.snapped)

    // 去重相邻重复点
    const clean: [number, number][] = []
    for (const c of coords) {
      if (clean.length === 0) clean.push(c)
      else {
        const last = clean[clean.length-1]
        if (Math.hypot(c[0]-last[0], c[1]-last[1]) > 1e-8) clean.push(c)
      }
    }
    if (clean.length < 2) return

    const displayName = fiber.name || `F-${String(idx + 1).padStart(2, '0')}`
    const color = fiberColors[idx % 2]

    const fiberFeature = new Feature({
      geometry: new LineString(clean),
      featureType: 'fiber',
      fiberName: fiber.name,
      fiberIndex: idx,
      segmentIndex: idx
    })
    fiberFeature.setStyle(new Style({ stroke: new Stroke({ color, width: 5 }) }))
    routeSource!.addFeature(fiberFeature)

    // 文字标签：使用起止设备中点与方向
    const midLon = (fromDev.longitude + toDev.longitude) / 2
    const midLat = (fromDev.latitude + toDev.latitude) / 2
    const dx = toDev.longitude - fromDev.longitude
    const dy = toDev.latitude - fromDev.latitude
    let rotation = -Math.atan2(dy, dx)
    if (rotation > Math.PI / 2) rotation -= Math.PI
    if (rotation < -Math.PI / 2) rotation += Math.PI

    const labelFeature = new Feature({ geometry: new Point([midLon, midLat]), featureType: 'fiber-label' })
    labelFeature.setStyle(new Style({
      text: new Text({ text: displayName, font: 'bold 10px sans-serif', fill: new Fill({ color: '#fff' }), stroke: new Stroke({ color, width: 3 }), rotation })
    }))
    routeSource!.addFeature(labelFeature)
  })
}

// 绘制设备节点 - 只显示系统设备（登陆站、放大器、分支器），不显示 waypoint
const drawPoints = () => {
  if (!pointSource) return
  pointSource.clear()
  
  const source = pointSource
  
  // 系统设备类型（需要显示的）
  const systemDeviceTypes = ['landing', 'amplifier_e', 'amplifier_w', 'ola', 'bu', 'branching', 'underwater']
  
  // 过滤只显示系统设备，排除 waypoint
  const systemDevices = sortedPoints.value.filter(point => 
    systemDeviceTypes.includes(point.type) || point.isBranchStation
  )
  
  systemDevices.forEach(point => {
    const feature = new Feature({
      geometry: new Point([point.longitude, point.latitude]),
      pointId: point.id,
      pointName: point.name,
      pointType: point.type
    })
    
    // 使用缓存的高程数据来判断岸上/水下站点
    const elevation = elevationCache.value[point.id]
    const iconUrl = getPointIcon(point.type, false, elevation)
    
    feature.setStyle(new Style({
      image: new Icon({
        src: iconUrl,
        scale: 0.18,
        anchor: [0.5, 0.5]
      }),
      text: new Text({
        text: point.name,
        offsetY: 16,
        font: '9px sans-serif',
        fill: new Fill({ color: '#374151' }),
        stroke: new Stroke({ color: '#fff', width: 3 })
      })
    }))
    
    source.addFeature(feature)
  })
}

// 跳转到指定点
const flyToPoint = (pointId: string) => {
  if (!map) return
  
  const point = props.routePoints.find(p => p.id === pointId)
  if (!point) return
  
  map.getView().animate({
    center: [point.longitude, point.latitude],
    zoom: 6,
    duration: 800
  })
}

  // 处理指针移动 - 显示鼠标样式
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const handlePointerMove = (evt: Record<string, any>) => {
  const features = map?.getFeaturesAtPixel(evt.pixel, {
    layerFilter: layer => layer === pointLayer
  })
  
  if (features && features.length > 0) {
    const pointType = features[0].get('pointType')
    // BU 节点显示可点击样式
    if (pointType === 'bu' || pointType === 'branching') {
      mapContainer.value!.style.cursor = 'pointer'
    } else if (props.draggableAmplifiers && isAmplifierFeature(features[0] as Feature)) {
      mapContainer.value!.style.cursor = 'grab'
    } else {
      mapContainer.value!.style.cursor = 'default'
    }
  } else {
    mapContainer.value!.style.cursor = 'default'
  }
}

// 更新路径线（分离主幹和分支）
const updateRouteLineFromPoints = () => {
  if (!routeSource || !pointSource) return
  
  routeSource.clear()
  
  const pointFeatures = pointSource.getFeatures()
  if (pointFeatures.length < 2) return
  
  // 分离主干点和分支登陆站
  const mainTrunkPoints = sortedPoints.value.filter((p) => !p.isBranchStation)
  const branchStations = sortedPoints.value.filter((p) => p.isBranchStation)
  
  // 绘制主幹线（分段）
  for (let i = 0; i < mainTrunkPoints.length - 1; i++) {
    const startPoint = mainTrunkPoints[i]
    const endPoint = mainTrunkPoints[i + 1]
    
    // 从 pointFeatures 中获取当前坐标（如果正在拖拽）
    const startFeature = pointFeatures.find(f => f.get('pointId') === startPoint.id)
    const endFeature = pointFeatures.find(f => f.get('pointId') === endPoint.id)
    
    const startCoords = startFeature 
      ? (startFeature.getGeometry() as Point).getCoordinates() 
      : [startPoint.longitude, startPoint.latitude]
    const endCoords = endFeature 
      ? (endFeature.getGeometry() as Point).getCoordinates() 
      : [endPoint.longitude, endPoint.latitude]
    
    const segmentFeature = new Feature({
      geometry: new LineString([startCoords, endCoords]),
      segmentIndex: i,
    })
    
    const isSelected = selectedSegmentIndex.value === i
    segmentFeature.setStyle(new Style({
      stroke: new Stroke({
        color: isSelected ? '#f59e0b' : '#3b82f6',
        width: isSelected ? 5 : 3,
        lineDash: isSelected ? undefined : [8, 4]
      })
    }))
    
    routeSource.addFeature(segmentFeature)
  }
  
  // 绘制分支线（从分支器到分支登陆站）
  branchStations.forEach((branchStation) => {
    const branchFromName = branchStation.branchFrom
    const branchingUnit = mainTrunkPoints.find((p) => p.name === branchFromName)
    
    if (branchingUnit) {
      // 从 pointFeatures 中获取当前坐标
      const branchingFeature = pointFeatures.find(f => f.get('pointId') === branchingUnit.id)
      const branchStationFeature = pointFeatures.find(f => f.get('pointId') === branchStation.id)
      
      const branchingCoords = branchingFeature 
        ? (branchingFeature.getGeometry() as Point).getCoordinates() 
        : [branchingUnit.longitude, branchingUnit.latitude]
      const branchStationCoords = branchStationFeature 
        ? (branchStationFeature.getGeometry() as Point).getCoordinates() 
        : [branchStation.longitude, branchStation.latitude]
      
      const branchFeature = new Feature({
        geometry: new LineString([branchingCoords, branchStationCoords]),
        featureType: 'branch',
      })
      
      branchFeature.setStyle(new Style({
        stroke: new Stroke({
          color: '#a855f7', // 紫色
          width: 3,
          lineDash: [6, 4]
        })
      }))
      
      routeSource!.addFeature(branchFeature)
    }
  })
}

// 初始化地图
const initMap = () => {
  if (!mapContainer.value) return
  
  // 加载 GeoTIFF 影像
  const tifFiles = ['/output2.tif']
  const rgbStyle = { color: ['array', ['band', 1], ['band', 2], ['band', 3], 1] }
  
  const geoTiffLayers = tifFiles.map((url) => {
    const source = new GeoTIFF({
      sources: [{ url }],
      normalize: true,
      wrapX: true,
    })
    return new WebGLTileLayer({ source, style: rgbStyle, visible: true, opacity: 1 })
  })
  
  routeSource = new VectorSource()
  routeLayer = new VectorLayer({
    source: routeSource,
    zIndex: 10
  })
  
  pointSource = new VectorSource()
  pointLayer = new VectorLayer({
    source: pointSource,
    zIndex: 20
  })
  
  map = new Map({
    target: mapContainer.value,
    layers: [
      new TileLayer({ 
        source: new OSM(),
        opacity: 0.5
      }),
      ...geoTiffLayers,
      routeLayer,
      pointLayer
    ],
    view: new View({
      projection: 'EPSG:4326',
      center: [127, 26],
      zoom: 4,
      minZoom: 2,
      maxZoom: 12
    })
  })
  
  // 鼠标移动显示坐标
  map.on('pointermove', (evt) => {
    coordinates.value = { lon: evt.coordinate[0], lat: evt.coordinate[1] }
    handlePointerMove(evt)
  })

  // Step 6.2: 初始化拖拽交互
  if (props.draggableAmplifiers) {
    setTimeout(() => setupTranslateInteraction(), 200)
  }
  
  // 双击事件 - BU 节点打开配置对话框
  map.on('dblclick', (evt) => {
    const pointFeatures = map!.getFeaturesAtPixel(evt.pixel, {
      layerFilter: layer => layer === pointLayer
    })
    
    if (pointFeatures && pointFeatures.length > 0) {
      const pointId = pointFeatures[0].get('pointId')
      const pointType = pointFeatures[0].get('pointType')
      
      // 只有 BU/branching 类型才弹出配置对话框
      if (pointType === 'bu' || pointType === 'branching') {
        emit('bu-dblclick', pointId)
        evt.preventDefault()
        evt.stopPropagation()
      }
    }
  })
  
  // 点击事件
  map.on('click', (evt) => {
    contextMenu.value.visible = false
    
    // 检查是否点击了设备点
    const pointFeatures = map!.getFeaturesAtPixel(evt.pixel, {
      layerFilter: layer => layer === pointLayer
    })
    
    if (pointFeatures && pointFeatures.length > 0) {
      const pointId = pointFeatures[0].get('pointId')
      if (pointId) {
        selectedSegmentIndex.value = -1
        updateLineStyle()
        emit('point-click', pointId)
        return
      }
    }
    
    // 检查是否点击了线段
    const lineFeatures = map!.getFeaturesAtPixel(evt.pixel, {
      layerFilter: layer => layer === routeLayer
    })
    
    if (lineFeatures && lineFeatures.length > 0) {
      const segmentIndex = lineFeatures[0].get('segmentIndex')
      if (segmentIndex !== undefined) {
        selectedSegmentIndex.value = segmentIndex
        updateLineStyle()
        emit('segment-click', segmentIndex)
      }
    } else {
      selectedSegmentIndex.value = -1
      updateLineStyle()
    }
  })
  
  // 右键事件
  mapContainer.value.addEventListener('contextmenu', (evt) => {
    evt.preventDefault()
    
    const pixel = map!.getEventPixel(evt)
    
    // 检查是否右键了设备点
    const pointFeatures = map!.getFeaturesAtPixel(pixel, {
      layerFilter: layer => layer === pointLayer
    })
    
    if (pointFeatures && pointFeatures.length > 0) {
      const pointId = pointFeatures[0].get('pointId')
      contextMenu.value = {
        visible: true,
        x: evt.clientX,
        y: evt.clientY,
        type: 'point',
        id: pointId
      }
      return
    }
    
    // 检查是否右键了线路
    const lineFeatures = map!.getFeaturesAtPixel(pixel, {
      layerFilter: layer => layer === routeLayer
    })
    
    if (lineFeatures && lineFeatures.length > 0) {
      const segmentIndex = lineFeatures[0].get('segmentIndex')
      contextMenu.value = {
        visible: true,
        x: evt.clientX,
        y: evt.clientY,
        type: 'segment',
        id: segmentIndex !== undefined ? String(segmentIndex) : null
      }
    }
  })
  
  // 绘制初始数据
  drawRouteLine()
  drawPoints()
  
  // 自适应显示 - 优先使用路线 extent，其次使用点位
  if (sortedPoints.value.length > 0) {
    let extent: number[] | undefined
    
    if (routeSource && routeSource.getFeatures().length > 0) {
      extent = routeSource.getExtent()
    } else if (pointSource && pointSource.getFeatures().length > 0) {
      extent = pointSource.getExtent()
    }
    
    if (extent && extent[0] !== Infinity) {
      map.getView().fit(extent, { 
        padding: [80, 80, 80, 80],
        duration: 500
      })
    }
  }
}


// 防抖重绘，避免 apply 时频繁刷新导致卡死
let redrawTimer: ReturnType<typeof setTimeout> | null = null
let lastDeviceCount = -1
let lastRouteId: string | null = null

const scheduleRedraw = (fitView = false, drawRoute = true) => {
  if (!map) return
  if (redrawTimer) {
    clearTimeout(redrawTimer)
  }
  redrawTimer = setTimeout(() => {
    if (drawRoute) {
      drawRouteLine()
    }
    drawPoints()
    if (fitView && routeSource && routeSource.getFeatures().length > 0) {
      const extent = routeSource.getExtent()
      if (extent && extent[0] !== Infinity) {
        map!.getView().fit(extent, { 
          padding: [80, 80, 80, 80],
          duration: 500
        })
      }
    }
    redrawTimer = null
  }, 200)
}

// 监听 monitorStore 设备数量变化 - 放大器添加后重绘
watch(
  () => monitorStore.devices.length,
  (newLen) => {
    if (newLen !== lastDeviceCount && map) {
      lastDeviceCount = newLen
      // 设备变化仅重绘，避免频繁 fit 造成卡顿
      // 设备变化只更新点位，不重绘线路
      scheduleRedraw(false, false)
    }
  }
)

// 监听 Pareto 选中路线变化
watch(
  () => routeStore.selectedRoute?.id,
  (newRouteId) => {
    if (newRouteId && newRouteId !== lastRouteId && map) {
      lastRouteId = newRouteId
      scheduleRedraw(true, true)
    }
  }
)

// 监听光纤段变化 - 重绘线路显示光纤
watch(
  () => connectorStore.elements.filter(e => e.type === 'fiber').length,
  () => {
    if (map) {
      scheduleRedraw(false, true)
    }
  }
)

// 监听放大器变化 - 应用配置后重绘设备点位
watch(
  () => connectorStore.elements.filter(e => e.type === 'ola' || e.type === 'amplifier_e' || e.type === 'amplifier_w').length,
  () => {
    if (map) {
      scheduleRedraw(false, false)
    }
  }
)

// editable 属性不再控制拖动，选中即可拖动

// 处理右键菜单操作
const handleEdit = () => {
  if (contextMenu.value.id) {
    emit('edit', contextMenu.value.type, contextMenu.value.id)
  }
  contextMenu.value.visible = false
}

const handleDelete = () => {
  if (contextMenu.value.id) {
    emit('delete', contextMenu.value.type, contextMenu.value.id)
  }
  contextMenu.value.visible = false
}

const closeContextMenu = () => {
  contextMenu.value.visible = false
}

defineExpose({ flyToPoint })

onMounted(() => initMap())

onUnmounted(() => {
  if (map) {
    map.setTarget(undefined)
    map = null
  }
})
</script>

<template>
  <div class="w-full h-full relative" @click="closeContextMenu">
    <div ref="mapContainer" class="w-full h-full" />
    
    <!-- 右键菜单 -->
    <div 
      v-if="contextMenu.visible"
      class="fixed bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50 min-w-[120px]"
      :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
      @click.stop
    >
      <div class="px-3 py-1.5 text-xs text-gray-500 border-b">
        {{ contextMenu.type === 'point' ? '设备操作' : contextMenu.type === 'segment' ? '光纤段操作' : '线路操作' }}
      </div>
      <button 
        class="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 flex items-center gap-2"
        @click="handleEdit"
      >
        <svg class="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
        编辑
      </button>
      <button 
        class="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 flex items-center gap-2 text-red-600"
        @click="handleDelete"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
        删除
      </button>
    </div>
    
    <!-- 拖拽放大器 tooltip -->
    <div
      v-if="dragTooltip.visible"
      class="absolute bg-purple-600 text-white px-3 py-1.5 rounded-lg text-xs shadow-lg z-20 pointer-events-none whitespace-nowrap"
      :style="{ left: dragTooltip.x + 'px', top: dragTooltip.y + 'px' }"
    >
      {{ dragTooltip.text }}
    </div>

    
    <!-- 坐标显示 -->
    <div class="absolute bottom-3 left-3 bg-white/90 px-3 py-1.5 rounded text-xs text-gray-600 shadow z-10">
      <span class="mr-4">经度: {{ coordinates.lon.toFixed(4) }}°</span>
      <span>纬度: {{ coordinates.lat.toFixed(4) }}°</span>
    </div>
    
    <!-- 设备图例 -->
    <div class="absolute bottom-3 right-3 bg-white/95 p-3 rounded-lg shadow z-10">
      <div class="text-xs font-semibold text-gray-700 mb-2">设备图例</div>
      <div class="space-y-1.5 text-xs">
        <div class="flex items-center gap-2">
          <img src="/image/landing.png" class="w-4 h-4 object-contain" />
          <span class="text-gray-600">岸上站点</span>
        </div>
        <div class="flex items-center gap-2">
          <img src="/image/amplifier-e.png" class="w-4 h-4 object-contain" />
          <span class="text-gray-600">放大器东</span>
        </div>
        <div class="flex items-center gap-2">
          <img src="/image/amplifier-w.png" class="w-4 h-4 object-contain" />
          <span class="text-gray-600">放大器西</span>
        </div>
        <div class="flex items-center gap-2">
          <img src="/image/bu.png" class="w-4 h-4 object-contain" />
          <span class="text-gray-600">分支器</span>
        </div>
        <div class="flex items-center gap-2">
          <img src="/image/underwater.png" class="w-4 h-4 object-contain" />
          <span class="text-gray-600">水下站点</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="w-4 h-0.5 bg-amber-400 rounded"></span>
          <span class="text-gray-600">光纤段</span>
        </div>
      </div>
    </div>
  </div>
</template>
