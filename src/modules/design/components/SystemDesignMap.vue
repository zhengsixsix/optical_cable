<script setup lang="ts">
import { useConnectorStore } from '@/stores/connector'
import { useMonitorStore } from '@/stores/monitor'
import { ref, onMounted, onUnmounted, watch, computed } from 'vue'
import { useRouteStore } from '@/stores/route'
import { useRPLStore } from '@/stores/rpl'
import { fetchDemPoint, checkDemService } from '@/services/DemApiService'
import { calculateDistance } from '@/utils/geo'
import { DEFAULT_GEO_TIFF_URL, getCachedGeoTiffSource } from '@/utils/geoTiffCache'
import Map from 'ol/Map'
import View from 'ol/View'
import TileLayer from 'ol/layer/Tile'
import WebGLTileLayer from 'ol/layer/WebGLTile'
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
  /** 放大器落位时使用的路由点（用于光纤线跟随路由几何渲染） */
  placementRoutePoints?: any[]
}>(), {
  draggableAmplifiers: false,
  placementRoutePoints: () => []
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

const geoTiffUrl = DEFAULT_GEO_TIFF_URL
const simplifiedPointZoom = 5

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

/** 获取路由线段坐标序列（主干线，排除分支登陆站） */
const getRouteLineCoords = (): [number, number][] => {
  const selectedRoute = routeStore.selectedRoute
  if (selectedRoute?.points?.length) {
    return selectedRoute.points
      .filter((p: any) => !(p as any).isBranchStation)
      .map(p => p.coordinates as [number, number])
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
    case 'equalizer':
      return `/image/equalizer${suffix}.svg`
    case 'joint':
      return `/image/joint${suffix}.svg`
    case 'underwater':
      return `/image/underwater${suffix}.png`
    default:
      return `/image/underwater${suffix}.png`
  }
}

const getPointIconScale = (type: string) => {
  if (type === 'equalizer' || type === 'joint') return 0.24
  return 0.18
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
    // ★ 使用 segment 邻接图 BFS 计算正确的 KP（支持分支拓扑）
    const hasBranching = selectedRoute.points.some(p => p.type === 'branching')
    const pointKpMap: Record<string, number> = {}
    
    if (hasBranching && selectedRoute.segments && selectedRoute.segments.length > 0) {
      const adj = new globalThis.Map<string, Array<{ neighbor: string; length: number }>>()
      for (const seg of selectedRoute.segments) {
        if (!adj.has(seg.startPointId)) adj.set(seg.startPointId, [])
        if (!adj.has(seg.endPointId)) adj.set(seg.endPointId, [])
        adj.get(seg.startPointId)!.push({ neighbor: seg.endPointId, length: seg.length || 0 })
        adj.get(seg.endPointId)!.push({ neighbor: seg.startPointId, length: seg.length || 0 })
      }
      const startPoint = selectedRoute.points.find(p => p.type === 'landing' && !(p as any).isBranchStation)
      if (startPoint) {
        const queue: Array<{ id: string; kp: number }> = [{ id: startPoint.id, kp: 0 }]
        const visited = new Set([startPoint.id])
        pointKpMap[startPoint.id] = 0
        while (queue.length > 0) {
          const { id, kp } = queue.shift()!
          for (const edge of (adj.get(id) || [])) {
            if (!visited.has(edge.neighbor)) {
              visited.add(edge.neighbor)
              pointKpMap[edge.neighbor] = kp + edge.length
              queue.push({ id: edge.neighbor, kp: kp + edge.length })
            }
          }
        }
      }
    } else {
      let cumulativeKp = 0
      selectedRoute.points.forEach((point, index) => {
        if (index > 0) {
          const prevPoint = selectedRoute.points[index - 1]
          cumulativeKp += calculateDistance(prevPoint.coordinates, point.coordinates)
        }
        pointKpMap[point.id] = cumulativeKp
      })
    }
    
    const mainPoints = selectedRoute.points.map((point) => {
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
        kp: pointKpMap[point.id] ?? 0,
        depth: (point as any).depth || 0,
        branchTo: point.branchTo,
        isBranchStation: (point as any).isBranchStation || false,
        branchFrom: (point as any).branchFrom || null,
      }
    })
    
    // ★ 不再通过 branchTo 重复添加分支登陆站（它们已在 selectedRoute.points 中）
    
    // 合并 connectorStore 中的放大器/均衡器（系统规划应用配置后生成，接头盒不在地图显示）
    const overlayTypes = ['ola', 'amplifier_e', 'amplifier_w', 'equalizer', 'joint']
    const existingIds = new Set(mainPoints.map(p => p.id))
    const overlayDevices = connectorStore.elements.filter(
      e => overlayTypes.includes(e.type) && !existingIds.has(e.id)
    )
    overlayDevices.forEach(dev => {
      mainPoints.push({
        id: dev.id,
        name: dev.name,
        type: dev.type,
        longitude: dev.longitude,
        latitude: dev.latitude,
        kp: dev.kp,
        depth: dev.depth || 0,
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
      const branchSegGroups = _groupConsecutiveBranchSegs(selectedRoute.segments, ptMap)
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
    const branchGroups = _groupConsecutiveBranchSegs(selectedRoute!.segments, ptMap2)
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
const _groupConsecutiveBranchSegs = (segments: any[], ptMap: Record<string, [number, number]>) => {
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
    const groups = _groupConsecutiveBranchSegs(selectedRoute.segments, ptMap)
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

  // ★ 登陆站按 KP 排序，用于首尾光纤的端点回退
  const stationDevices = allDevices
    .filter(d => d.type === 'landing' || d.type === 'underwater')
    .sort((a, b) => a.kp - b.kp)
  const startStation = stationDevices[0] || null
  const endStation = stationDevices[stationDevices.length - 1] || null

  fibers.forEach((fiber, idx) => {
    // ★ 查找光纤两端设备（优先 ID 匹配，回退 KP 匹配）
    let fromDev = allDevices.find(d => d.id === fiber.fromDeviceId) || null
    let toDev = allDevices.find(d => d.id === fiber.toDeviceId) || null
    if (!fromDev && fiber.kp !== undefined) {
      fromDev = allDevices.reduce<typeof allDevices[0] | null>((best, d) => {
        const dist = Math.abs(d.kp - fiber.kp)
        return dist < (best ? Math.abs(best.kp - fiber.kp) : Infinity) && dist < 10 ? d : best
      }, null)
    }
    if (!toDev && fiber.endKp !== undefined) {
      toDev = allDevices.reduce<typeof allDevices[0] | null>((best, d) => {
        const dist = Math.abs(d.kp - fiber.endKp!)
        return dist < (best ? Math.abs(best.kp - fiber.endKp!) : Infinity) && dist < 10 ? d : best
      }, null)
    }
    // ★ 首尾光纤回退到登陆站
    if (!fromDev && idx === 0 && startStation) fromDev = startStation
    if (!toDev && idx === fibers.length - 1 && endStation) toDev = endStation
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

    if (useCompactPoints) {
      feature.setStyle(new Style({
        image: new CircleStyle({
          radius: 4,
          fill: new Fill({ color: '#dc2626' }),
          stroke: new Stroke({ color: '#fff', width: 1.5 }),
        }),
      }))
    } else {
      // 使用缓存的高程数据来判断岸上/水下站点
      const elevation = elevationCache.value[point.id]
      const iconUrl = getPointIcon(point.type, false, elevation)
      
      feature.setStyle(new Style({
        image: new Icon({
          src: iconUrl,
          scale: getPointIconScale(point.type),
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
    }
    
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
        color: isSelected ? '#f59e0b' : '#ef4444',
        width: isSelected ? 5 : 3,
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
        stroke: new Stroke({ color: '#ef4444', width: 3 })
      }))
      
      routeSource!.addFeature(branchFeature)
    }
  })
}

// 初始化地图
const initMap = () => {
  if (!mapContainer.value) return
  
  // 加载 GeoTIFF 影像
  const rgbStyle = { color: ['array', ['band', 1], ['band', 2], ['band', 3], 1] }
  const geoTiffEntry = getCachedGeoTiffSource(geoTiffUrl)
  const geoTiffLayers = [
    new WebGLTileLayer({ source: geoTiffEntry.source, style: rgbStyle, visible: true, opacity: 1 })
  ]
  
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

// 监听 placementRoutePoints 变化 - 重绘光纤线跟随新路由几何
watch(
  () => props.placementRoutePoints?.length,
  () => {
    if (map && props.placementRoutePoints && props.placementRoutePoints.length > 0) {
      scheduleRedraw(false, true)
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
          <img src="/image/equalizer.svg" class="w-4 h-4 object-contain" />
          <span class="text-gray-600">均衡器</span>
        </div>
        <div class="flex items-center gap-2">
          <img src="/image/joint.svg" class="w-4 h-4 object-contain" />
          <span class="text-gray-600">接头盒</span>
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
