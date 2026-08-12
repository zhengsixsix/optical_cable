<script setup lang="ts">
import { useConnectorStore } from '@/stores/connector'
import { useMonitorStore } from '@/stores/monitor'
import { ref, onMounted, onUnmounted, watch, computed } from 'vue'
import { useRouteStore } from '@/stores/route'
import { useRPLStore } from '@/stores/rpl'
import Map from 'ol/Map'
import View from 'ol/View'
import TileLayer from 'ol/layer/Tile'
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import { createBaseTileSource } from '@/utils/mapTileSource'
import Feature from 'ol/Feature'
import Point from 'ol/geom/Point'
import LineString from 'ol/geom/LineString'
import { Style, Stroke, Icon, Text, Fill } from 'ol/style'
import { Translate } from 'ol/interaction'
import 'ol/ol.css'
import { getSystemDeviceIcon, systemDeviceLegendItems } from '@/utils/systemDesignIcons'
import { nearestPointOnRoute, type LonLatCoordinate } from '@/utils/routeGeometry'

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
  /** 启用放大器坐标手工调整 */
  draggableAmplifiers?: boolean
  /** 放大器落位时使用的路由点（用于光纤线跟随路由几何渲染） */
  placementRoutePoints?: any[]
  coordinatePicking?: boolean
}>(), {
  draggableAmplifiers: false,
  placementRoutePoints: () => [],
  coordinatePicking: false
})

const routeStore = useRouteStore()
useRPLStore()
const monitorStore = useMonitorStore()
const connectorStore = useConnectorStore()

const emit = defineEmits<{
  (e: 'point-click', pointId: string): void
  (e: 'bu-dblclick', buId: string): void  // 双击 BU 节点打开配置对话框
  (e: 'edit', type: 'point' | 'line' | 'segment', id: string | null): void
  (e: 'delete', type: 'point' | 'line' | 'segment', id: string | null): void
  /** 放大器坐标拖拽完成 */
  (e: 'amplifier-moved', data: { id: string; longitude: number; latitude: number }): void
  (e: 'coordinate-picked', coordinate: { longitude: number; latitude: number }): void
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

const simplifiedPointZoom = 5

// ========== 放大器坐标手工调整 ==========
let translateInteraction: Translate | null = null
const dragTooltip = ref<{ visible: boolean; x: number; y: number; text: string }>({
  visible: false, x: 0, y: 0, text: ''
})

/** 判断 feature 是否是放大器类型 */
const isAmplifierFeature = (feature: Feature) => {
  const ptype = feature.get('pointType')
  return ptype === 'ola' || ptype === 'amplifier_e' || ptype === 'amplifier_w'
}

const selectedRouteCoordinates = (): LonLatCoordinate[] => {
  const selectedRoute = routeStore.selectedRoute
  const source = selectedRoute?.rawTrunkCoordinates?.length
    ? selectedRoute.rawTrunkCoordinates
    : selectedRoute?.points.map(point => point.coordinates) ?? []
  return source.filter((coordinate): coordinate is LonLatCoordinate =>
    Array.isArray(coordinate)
    && Number.isFinite(Number(coordinate[0]))
    && Number.isFinite(Number(coordinate[1])),
  )
}

const snapCoordinateToSelectedRoute = (coordinate: [number, number]) =>
  nearestPointOnRoute(coordinate, selectedRouteCoordinates())

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

  let dragPointId: string | null = null
  translateInteraction.on('translatestart', (evt) => {
    const feature = evt.features.item(0)
    if (!feature) return
    dragPointId = feature.get('pointId')
    dragTooltip.value.visible = true
  })

  translateInteraction.on('translating', (evt) => {
    const feature = evt.features.item(0)
    if (!feature) return
    const geom = feature.getGeometry() as Point
    const rawCoord = geom.getCoordinates() as [number, number]
    const snappedCoord = snapCoordinateToSelectedRoute(rawCoord)
    if (snappedCoord) geom.setCoordinates(snappedCoord)
    const displayCoord = snappedCoord ?? rawCoord

    if (map) {
      const pixel = map.getPixelFromCoordinate(displayCoord)
      dragTooltip.value = {
        visible: true,
        x: pixel[0] + 20,
        y: pixel[1] - 30,
        text: `${displayCoord[0].toFixed(5)}, ${displayCoord[1].toFixed(5)}`,
      }
    }
  })

  translateInteraction.on('translateend', (evt) => {
    const feature = evt.features.item(0)
    dragTooltip.value.visible = false
    if (!feature || !dragPointId) return

    const geom = feature.getGeometry() as Point
    const rawCoord = geom.getCoordinates() as [number, number]
    const finalCoord = snapCoordinateToSelectedRoute(rawCoord)
    if (!finalCoord) {
      scheduleRedraw(false, true)
      dragPointId = null
      return
    }
    geom.setCoordinates(finalCoord)

    emit('amplifier-moved', {
      id: dragPointId,
      longitude: finalCoord[0],
      latitude: finalCoord[1],
    })

    dragPointId = null

    // 拖拽结束后主动重绘线路（使用路由拓扑 + 光纤段的正确绘制方式）
    scheduleRedraw(false, true)
  })

  map.addInteraction(translateInteraction)
}

// 监听 draggableAmplifiers 属性变化
watch(() => props.draggableAmplifiers, () => {
  setupTranslateInteraction()
})

const getPointIconScale = (type: string) => {
  if (type === 'equalizer' || type === 'joint') return 0.24
  return 0.18
}

const pointTypeIdentity = (type: string): string => {
  const normalized = String(type || '').trim().toLowerCase()
  if (normalized === 'branching') return 'bu'
  if (['repeater', 'ola', 'amplifier_e', 'amplifier_w'].includes(normalized)) return 'amplifier'
  return normalized
}

const pointSpatialIdentity = (point: RoutePoint): string | null => {
  const longitude = Number(point.longitude)
  const latitude = Number(point.latitude)
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null
  return `${pointTypeIdentity(point.type)}:${longitude.toFixed(5)}:${latitude.toFixed(5)}`
}

const mergePointSource = (
  target: RoutePoint[],
  incoming: RoutePoint[],
  preserveExistingIdentity = false,
) => {
  for (const point of incoming) {
    const idIndex = point.id ? target.findIndex(candidate => candidate.id === point.id) : -1
    const spatialIdentity = pointSpatialIdentity(point)
    const spatialIndex = idIndex < 0 && spatialIdentity
      ? target.findIndex(candidate => pointSpatialIdentity(candidate) === spatialIdentity)
      : -1
    const existingIndex = idIndex >= 0 ? idIndex : spatialIndex
    if (existingIndex < 0) {
      target.push({ ...point })
      continue
    }
    const existing = target[existingIndex]
    target[existingIndex] = {
      ...existing,
      ...point,
      ...(preserveExistingIdentity && idIndex < 0 ? { id: existing.id } : {}),
    }
  }
}

// 规划设备是地图基底；监控数据只叠加同一设备的运行字段，不能替换整套规划结果。
const sortedPoints = computed<RoutePoint[]>(() => {
  const merged: RoutePoint[] = []
  const selectedRoute = routeStore.selectedRoute
  if (selectedRoute && selectedRoute.points.length > 0) {
    const mainPoints: RoutePoint[] = selectedRoute.points.map((point) => {
      let mappedType = 'waypoint'
      if (point.type === 'landing') mappedType = 'landing'
      else if (point.type === 'repeater') mappedType = 'amplifier_e'
      else if (point.type === 'branching') mappedType = 'bu'
      
      return {
        id: point.id,
        name: point.name || (point.type === 'landing' ? '登陆站' : point.type === 'branching' ? '分支器' : '节点'),
        type: mappedType,
        longitude: point.coordinates[0],
        latitude: point.coordinates[1],
        kp: (point as typeof point & { kp?: number }).kp,
        depth: (point as any).depth || 0,
        branchTo: point.branchTo,
        isBranchStation: (point as any).isBranchStation || false,
        branchFrom: (point as any).branchFrom || null,
      }
    })
    mergePointSource(merged, mainPoints)
  }

  // props.routePoints 来自当前接线元表，包含后端布局生成和人工维护的设备。
  if (props.routePoints.length > 0) {
    mergePointSource(merged, props.routePoints)
  }

  const monitoredPoints: RoutePoint[] = monitorStore.devices.map(device => ({
    ...device,
    id: device.id,
    name: device.name,
    type: device.type,
    longitude: device.longitude,
    latitude: device.latitude,
    kp: device.kp,
    depth: device.depth || 0,
  }))
  mergePointSource(merged, monitoredPoints, true)

  return merged
    .filter(point => Number.isFinite(Number(point.longitude)) && Number.isFinite(Number(point.latitude)))
    .sort((left, right) => (Number(left.kp) || 0) - (Number(right.kp) || 0))
})

const pointRenderSignature = computed(() => sortedPoints.value.map(point => [
  point.id,
  point.type,
  point.name,
  Number(point.longitude),
  Number(point.latitude),
  Number(point.kp ?? 0),
  Number(point.depth ?? 0),
  Boolean(point.isBranchStation),
].join(':')).join('|'))

// 更新线路样式（根据选中的线段索引更新样式）
const updateLineStyle = () => {
  if (!routeSource) return
  
  routeSource.getFeatures().forEach(feature => {
    const segmentIndex = feature.get('segmentIndex')
    if (segmentIndex === undefined) return // skip non-segment features
    const isSelected = segmentIndex === selectedSegmentIndex.value
    feature.setStyle(new Style({
      stroke: new Stroke({
        color: isSelected ? '#f59e0b' : '#ef4444',
        width: isSelected ? 5 : 3,
      })
    }))
  })
}

// 绘制路径线
const drawRouteLine = () => {
  if (!routeSource) return
  routeSource.clear()
  
  const selectedRoute = routeStore.selectedRoute
  
  // ★ 关键：确定绘制哪条路由的底线
  //   如果有 placementRoutePoints（放大器落位用的路由），优先用它绘制底线
  //   确保底线、放大器、光纤线都在同一条路由上
  const placementPts = props.placementRoutePoints
  const hasFibers = connectorStore.elements.some(e => e.type === 'fiber')
  
  if (placementPts && placementPts.length > 2 && hasFibers) {
    // ★ 统一红线：主干 + 分支都用红色实线，不再绘制光纤段连线
    if (selectedRoute && selectedRoute.segments && selectedRoute.segments.length > 0) {
      const ptMap: Record<string, [number, number]> = {}
      for (const p of selectedRoute.points) {
        ptMap[p.id] = p.coordinates
      }
      placementPts.forEach((p: any) => {
        if (p.id && p.coordinates) ptMap[p.id] = p.coordinates
      })
      // 主干段
      const trunkSegs = selectedRoute.segments.filter((s: any) => !s.id?.startsWith('branch-'))
      for (const seg of trunkSegs) {
        const c1 = ptMap[seg.startPointId], c2 = ptMap[seg.endPointId]
        if (!c1 || !c2) continue
        const f = new Feature({ geometry: new LineString([c1, c2]), featureType: 'segment' })
        f.setStyle(new Style({ stroke: new Stroke({ color: '#ef4444', width: 4 }) }))
        routeSource!.addFeature(f)
      }
      // 分支段（也用红色实线）
      const branchSegGroups = _groupConsecutiveBranchSegs(selectedRoute.segments)
      branchSegGroups.forEach((group) => {
        const coords = group.map((s: any) => ptMap[s.startPointId]).filter(Boolean)
        const lastSeg = group[group.length - 1]
        if (ptMap[lastSeg.endPointId]) coords.push(ptMap[lastSeg.endPointId])
        if (coords.length < 2) return
        const f = new Feature({ geometry: new LineString(coords), featureType: 'segment' })
        f.setStyle(new Style({ stroke: new Stroke({ color: '#ef4444', width: 4 }) }))
        routeSource!.addFeature(f)
      })
    }
    // ★ 光纤段：用交替色沿路由绘制（纯路由坐标，不用设备坐标）
    drawFiberLines()
    return
  }
  
  // 使用 routeStore.selectedRoute 的 segments 数据绘制
  if (selectedRoute && selectedRoute.segments && selectedRoute.segments.length > 0) {
    const pointMap: Record<string, [number, number]> = {}
    for (const p of selectedRoute.points) {
      pointMap[p.id] = p.coordinates
    }
    
    // ★ 统一红线：所有 segment 都用红色实线
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
      segmentFeature.setStyle(new Style({
        stroke: new Stroke({ color: '#ef4444', width: 4 })
      }))
      routeSource!.addFeature(segmentFeature)
    })
    // ★ 绘制光纤段
    drawFiberLines()
    return
  }
  
  // 回退：使用原始路由点绘制
  if (!selectedRoute || selectedRoute.points.length < 2) return
  const routePoints = selectedRoute.points
  
  for (let i = 0; i < routePoints.length - 1; i++) {
    const startPoint = routePoints[i]
    const endPoint = routePoints[i + 1]
    const isSelected = selectedSegmentIndex.value === i
    
    const segmentFeature = new Feature({
      geometry: new LineString([startPoint.coordinates, endPoint.coordinates]),
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
  
  // ★ 分支线路也用统一红色实线
  const branchSegs = selectedRoute?.segments?.filter(s => s.id?.startsWith('branch-')) || []
  if (branchSegs.length > 0) {
    const ptMap2: Record<string, [number, number]> = {}
    selectedRoute!.points.forEach(p => { ptMap2[p.id] = p.coordinates })
    const branchGroups = _groupConsecutiveBranchSegs(selectedRoute!.segments)
    branchGroups.forEach((group) => {
      const coords = group.map((s: any) => ptMap2[s.startPointId]).filter(Boolean)
      const lastSeg = group[group.length - 1]
      if (ptMap2[lastSeg.endPointId]) coords.push(ptMap2[lastSeg.endPointId])
      if (coords.length < 2) return
      const branchFeature = new Feature({
        geometry: new LineString(coords),
        featureType: 'branch'
      })
      branchFeature.setStyle(new Style({
        stroke: new Stroke({ color: '#ef4444', width: 3 })
      }))
      routeSource!.addFeature(branchFeature)
    })
  } else {
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
          stroke: new Stroke({ color: '#ef4444', width: 3 })
        }))
        routeSource.addFeature(branchFeature)
      }
    })
  }
}

// 绘制光纤段（放大器之间的连线）
// 使用最近点索引法沿路由几何绘制，不依赖 KP 值匹配

/**
 * 将分支 segments 按连续链接分组（同一分支路径的连续段归为一组）
 */
const _groupConsecutiveBranchSegs = (segments: any[]) => {
  const branchSegs = segments.filter((s: any) => s.id?.startsWith('branch-'))
  if (branchSegs.length === 0) return []

  // 构建邻接表
  const adj = new globalThis.Map<string, any[]>()
  for (const seg of branchSegs) {
    if (!adj.has(seg.startPointId)) adj.set(seg.startPointId, [])
    adj.get(seg.startPointId)!.push(seg)
  }
  
  // 找分支起点（type=branching 的点）
  const selectedRoute = routeStore.selectedRoute
  const buPoints = selectedRoute?.points?.filter((p: any) => p.type === 'branching') || []
  const branchEndpoints = selectedRoute?.points?.filter((p: any) => 
    (p as any).isBranchStation || 
    (p.type === 'landing' && branchSegs.some((s: any) => s.endPointId === p.id))
  ) || []
  
  const groups: any[][] = []
  const usedSegs = new Set<string>()
  
  // 从每个 BU 出发，沿分支段走到登陆站
  for (const bu of buPoints) {
    for (const endpoint of branchEndpoints) {
      // BFS 从 BU 到 endpoint
      const queue = [bu.id]
      const visited = new Set([bu.id])
      const prev = new globalThis.Map<string, { from: string; seg: any } | null>([[bu.id, null]])
      let found = false
      while (queue.length > 0 && !found) {
        const cur = queue.shift()!
        for (const seg of (adj.get(cur) || [])) {
          const next = seg.endPointId
          if (!visited.has(next)) {
            visited.add(next)
            prev.set(next, { from: cur, seg })
            if (next === endpoint.id) { found = true; break }
            queue.push(next)
          }
        }
      }
      if (!found) continue
      // 回溯收集 segments
      const pathSegs: any[] = []
      let cur = endpoint.id
      while (prev.get(cur)) {
        const entry = prev.get(cur)!
        if (usedSegs.has(entry.seg.id)) break
        pathSegs.push(entry.seg)
        cur = entry.from
      }
      if (pathSegs.length === 0) continue
      pathSegs.reverse()
      pathSegs.forEach(s => usedSegs.add(s.id))
      groups.push(pathSegs)
    }
  }
  
  // 处理未分组的剩余分支段
  const remaining = branchSegs.filter(s => !usedSegs.has(s.id))
  remaining.forEach(s => groups.push([s]))
  
  return groups
}

/** 找到距离给定坐标最近的路由点索引（纯几何距离） */
const findNearestRoutePointIndex = (routeCoords: [number, number][], lon: number, lat: number): number => {
  let bestIdx = 0
  let bestDist = Infinity
  for (let i = 0; i < routeCoords.length; i++) {
    const dx = routeCoords[i][0] - lon
    const dy = routeCoords[i][1] - lat
    const dist = dx * dx + dy * dy
    if (dist < bestDist) { bestDist = dist; bestIdx = i }
  }
  return bestIdx
}

const drawFiberLines = () => {
  if (!routeSource) return

  const fibers = connectorStore.elements.filter(e => e.type === 'fiber')
  if (fibers.length === 0) return

  const selectedRoute = routeStore.selectedRoute
  const allDevices = connectorStore.elements.filter(e => e.type !== 'fiber')

  // ★ 构建路由坐标路径（主干 + 各分支），用于沿路径绘制光纤线
  const ptMap: Record<string, [number, number]> = {}
  if (selectedRoute?.points) {
    selectedRoute.points.forEach(p => { ptMap[p.id] = p.coordinates })
  }

  // 主干路径坐标（有序）
  let trunkPath: [number, number][] = []
  if (selectedRoute?.segments) {
    const trunkSegs = selectedRoute.segments.filter((s: any) => !s.id?.startsWith('branch-'))
    if (trunkSegs.length > 0) {
      // BFS 构建主干有序坐标
      const adj = new globalThis.Map<string, string[]>()
      for (const seg of trunkSegs) {
        if (!adj.has(seg.startPointId)) adj.set(seg.startPointId, [])
        if (!adj.has(seg.endPointId)) adj.set(seg.endPointId, [])
        adj.get(seg.startPointId)!.push(seg.endPointId)
        adj.get(seg.endPointId)!.push(seg.startPointId)
      }
      // 找度=1 的端点作为起点
      let startId = trunkSegs[0].startPointId
      for (const [id, neighbors] of adj) {
        if (neighbors.length === 1) { startId = id; break }
      }
      const visited = new Set<string>([startId])
      const ordered = [startId]
      let cur = startId
      while (true) {
        const next = (adj.get(cur) || []).find(n => !visited.has(n))
        if (!next) break
        visited.add(next)
        ordered.push(next)
        cur = next
      }
      trunkPath = ordered.map(id => ptMap[id]).filter(Boolean)
    }
  }
  if (trunkPath.length < 2 && selectedRoute?.points) {
    trunkPath = selectedRoute.points
      .filter((p: any) => !(p as any).isBranchStation)
      .map(p => p.coordinates as [number, number])
  }

  // 分支路径坐标
  const branchPaths: [number, number][][] = []
  if (selectedRoute?.segments) {
    const groups = _groupConsecutiveBranchSegs(selectedRoute.segments)
    groups.forEach(group => {
      const coords = group.map((s: any) => ptMap[s.startPointId]).filter(Boolean)
      const lastSeg = group[group.length - 1]
      if (ptMap[lastSeg.endPointId]) coords.push(ptMap[lastSeg.endPointId])
      if (coords.length >= 2) branchPaths.push(coords)
    })
  }

  // ★ 在路径上提取子路径（纯路由坐标，不混入设备坐标，避免平行线）
  const getSubPathByCoords = (
    path: [number, number][],
    fromLon: number, fromLat: number,
    toLon: number, toLat: number
  ): [number, number][] => {
    if (path.length < 2) return [[fromLon, fromLat], [toLon, toLat]]
    const fromIdx = findNearestRoutePointIndex(path, fromLon, fromLat)
    const toIdx = findNearestRoutePointIndex(path, toLon, toLat)
    const startIdx = Math.min(fromIdx, toIdx)
    const endIdx = Math.max(fromIdx, toIdx)
    // ★ 关键：只用路由线上的坐标，不用设备坐标，确保光纤线与路由线完全重合
    const sub: [number, number][] = []
    for (let i = startIdx; i <= endIdx; i++) {
      sub.push(path[i])
    }
    return sub.length >= 2 ? sub : [[fromLon, fromLat], [toLon, toLat]]
  }

  // ★ 判断坐标更接近哪条路径
  const findBestPath = (lon: number, lat: number): [number, number][] => {
    let bestPath = trunkPath
    let bestDist = Infinity
    const distToPath = (path: [number, number][]) => {
      let min = Infinity
      for (const c of path) {
        const d = (c[0] - lon) ** 2 + (c[1] - lat) ** 2
        if (d < min) min = d
      }
      return min
    }
    if (trunkPath.length >= 2) bestDist = distToPath(trunkPath)
    for (const bp of branchPaths) {
      const d = distToPath(bp)
      if (d < bestDist) { bestDist = d; bestPath = bp }
    }
    return bestPath
  }

  // ★ 交替色：偶数光纤段用琥珀色，奇数用橙色
  const fiberColors = ['#f59e0b', '#fb923c']

  fibers.forEach((fiber, idx) => {
    const fromDev = allDevices.find(d => d.id === fiber.fromDeviceId) || null
    const toDev = allDevices.find(d => d.id === fiber.toDeviceId) || null
    if (!fromDev || !toDev) return
    if (fromDev.id === toDev.id) return

    // ★ 用设备坐标找最近路径，但绘制时只用路由线坐标（避免平行线）
    const bestPath = findBestPath(fromDev.longitude, fromDev.latitude)
    const lineCoords = getSubPathByCoords(
      bestPath,
      fromDev.longitude, fromDev.latitude,
      toDev.longitude, toDev.latitude
    )
    if (lineCoords.length < 2) return

    const fiberFeature = new Feature({
      geometry: new LineString(lineCoords),
      featureType: 'fiber',
      fiberName: fiber.name,
      fiberIndex: idx,
    })
    // ★ 实线 2px 交替色，叠加在 4px 红色路由底线上
    const color = fiberColors[idx % 2]
    fiberFeature.setStyle(new Style({
      stroke: new Stroke({ color, width: 2 })
    }))
    routeSource!.addFeature(fiberFeature)

    // ★ 光纤段名称标签（放在线段中点，旋转角度跟随线段方向）
    const displayName = fiber.name || `F-${String(idx + 1).padStart(2, '0')}`
    const midIdx = Math.floor(lineCoords.length / 2)
    // 计算中点处线段方向角度
    const p1 = lineCoords[Math.max(0, midIdx - 1)]
    const p2 = lineCoords[Math.min(lineCoords.length - 1, midIdx + 1)]
    const dx = p2[0] - p1[0]
    const dy = p2[1] - p1[1]
    let rotation = -Math.atan2(dy, dx)
    // 保证文字不会倒过来（始终可读）
    if (rotation > Math.PI / 2) rotation -= Math.PI
    if (rotation < -Math.PI / 2) rotation += Math.PI
    const labelFeature = new Feature({
      geometry: new Point(lineCoords[midIdx]),
      featureType: 'fiber-label'
    })
    labelFeature.setStyle(new Style({
      text: new Text({
        text: displayName,
        font: 'bold 9px sans-serif',
        rotation,
        fill: new Fill({ color: '#fff' }),
        stroke: new Stroke({ color, width: 3 }),
      })
    }))
    routeSource!.addFeature(labelFeature)
  })
}

// 绘制设备节点 - 只显示系统设备（登陆站、放大器、分支器、均衡器），不显示 waypoint
const drawPoints = () => {
  if (!pointSource) return
  pointSource.clear()
  
  const source = pointSource
  const currentZoom = map?.getView().getZoom() ?? simplifiedPointZoom
  const useCompactPoints = currentZoom < simplifiedPointZoom
  
  // 系统设备类型（需要显示的，接头盒不在地图显示）
  const systemDeviceTypes = ['landing', 'amplifier_e', 'amplifier_w', 'ola', 'bu', 'branching', 'equalizer', 'joint', 'underwater']
  
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

    const elevation = elevationCache.value[point.id]
    const iconUrl = getSystemDeviceIcon(point.type, point.id === props.selectedPointId, elevation)
    feature.setStyle(new Style({
      image: new Icon({
        src: iconUrl,
        scale: getPointIconScale(point.type),
        anchor: [0.5, 0.5]
      }),
      text: useCompactPoints
        ? undefined
        : new Text({
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
  
  const point = sortedPoints.value.find(candidate => candidate.id === pointId)
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
  if (props.coordinatePicking) {
    mapContainer.value!.style.cursor = 'crosshair'
    return
  }

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

// 初始化地图
const initMap = () => {
  if (!mapContainer.value) return
  
  // 加载 GeoTIFF 影像
  
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
        source: createBaseTileSource(),
        opacity: 1
      }),
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

  map.getView().on('change:resolution', () => {
    drawPoints()
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

    if (props.coordinatePicking) {
      const snappedCoordinate = snapCoordinateToSelectedRoute(evt.coordinate as [number, number])
      if (!snappedCoordinate) return
      emit('coordinate-picked', {
        longitude: snappedCoordinate[0],
        latitude: snappedCoordinate[1],
      })
      return
    }
    
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
let lastRouteId: string | null = null
// 累积标志：多个 watcher 在防抖窗口内触发时，取最大值而非覆盖
let pendingFitView = false
let pendingDrawRoute = false

const scheduleRedraw = (fitView = false, drawRoute = true) => {
  if (!map) return
  pendingFitView = pendingFitView || fitView
  pendingDrawRoute = pendingDrawRoute || drawRoute
  if (redrawTimer) {
    clearTimeout(redrawTimer)
  }
  redrawTimer = setTimeout(() => {
    if (pendingDrawRoute) {
      drawRouteLine()
    }
    drawPoints()
    if (pendingFitView && routeSource && routeSource.getFeatures().length > 0) {
      const extent = routeSource.getExtent()
      if (extent && extent[0] !== Infinity) {
        map!.getView().fit(extent, { 
          padding: [80, 80, 80, 80],
          duration: 500
        })
      }
    }
    pendingFitView = false
    pendingDrawRoute = false
    redrawTimer = null
  }, 200)
}

// 监听完整点位签名；同数量设备被重新布放、改名或改型时也必须刷新。
watch(
  pointRenderSignature,
  () => {
    if (!map) return
    scheduleRedraw(false, true)
    if (props.draggableAmplifiers) {
      setTimeout(() => setupTranslateInteraction(), 250)
    }
  }
)

watch(
  () => props.selectedPointId,
  () => {
    if (map) scheduleRedraw(false, false)
  },
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

// 监听 placementRoutePoints 变化 - 重绘光纤线跟随新路由几何
watch(
  () => (props.placementRoutePoints ?? []).map(point => [
    point.id,
    ...(Array.isArray(point.coordinates) ? point.coordinates : []),
  ].join(':')).join('|'),
  () => {
    if (map && props.placementRoutePoints && props.placementRoutePoints.length > 0) {
      scheduleRedraw(false, true)
    }
  }
)

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

    <div
      v-if="coordinatePicking"
      class="absolute left-1/2 top-3 z-20 -translate-x-1/2 rounded-md border border-blue-200 bg-white/95 px-3 py-1.5 text-xs font-medium text-blue-700 shadow pointer-events-none"
    >
      点击地图选择经纬度
    </div>
    
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
        <div v-for="item in systemDeviceLegendItems" :key="item.type" class="flex items-center gap-2">
          <img :src="getSystemDeviceIcon(item.type)" :alt="item.label" class="w-4 h-4 object-contain" />
          <span class="text-gray-600">{{ item.label }}</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="w-4 h-0.5 bg-amber-400 rounded"></span>
          <span class="text-gray-600">光纤段</span>
        </div>
      </div>
    </div>
  </div>
</template>
