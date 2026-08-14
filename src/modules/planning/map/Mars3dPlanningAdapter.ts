import type { MonitorDevice } from '@/stores/monitor'
import type { Route } from '@/types/route'
import type { LonLatExtent } from '@/utils/routePlanningViewport'
import { normalizeLonLatCoordinate } from '@/utils/mapProjection'

type Mars3dModule = typeof import('mars3d')
type MarsMap = import('mars3d').Map
type GraphicLayer = import('mars3d').layer.GraphicLayer
type BaseGraphic = import('mars3d').graphic.BaseGraphic
type BaseLayer = import('mars3d').layer.BaseLayer

export interface MarsProjectStation {
  id: string
  name: string
  lon: number
  lat: number
}

export interface MarsRouteSegmentSelection {
  id: string
  routeId: string
  coordinates: [number, number][]
  length?: number
  depth?: number
  cableType?: string
  riskLevel?: string
}

export interface MarsRouteRenderState {
  routes: Route[]
  selectedRouteId: string | null
  selectedSegmentId: string | null
  devices: MonitorDevice[]
  selectedDeviceId: string | null
  projectStations: MarsProjectStation[]
  showProjectStations: boolean
  fit?: boolean
}

export interface MarsThematicStyle {
  color: string
  opacity?: number
  outlineColor?: string
  pixelSize?: number
  width?: number
}

export interface MarsPlanningAdapterCallbacks {
  onCoordinates: (longitude: number, latitude: number) => void
  onRouteClick: (routeId: string) => void
  onRouteSegmentClick: (selection: MarsRouteSegmentSelection) => void
  onDeviceClick: (deviceId: string) => void
  onBlankClick: () => void
  onRoutePointEdited: (routeId: string, pointId: string, coordinate: [number, number]) => void
  onCameraMoveEnd: (extent: LonLatExtent) => void
}

const ROUTE_COLORS = ['#2563eb', '#0891b2', '#7c3aed']
const RISK_COLORS = {
  high: '#dc2626',
  medium: '#d97706',
  low: '#16a34a',
} as const

const DEVICE_COLORS: Record<string, string> = {
  landing: '#22c55e',
  LandingStation: '#22c55e',
  repeater: '#3b82f6',
  Repeater: '#3b82f6',
  amplifier_e: '#3b82f6',
  amplifier_w: '#3b82f6',
  bu: '#a855f7',
  BU: '#a855f7',
  branching: '#a855f7',
  joint: '#f97316',
  Joint: '#f97316',
  underwater: '#06b6d4',
  PFE: '#06b6d4',
  waypoint: '#6b7280',
}

const DEVICE_SIZES: Record<string, number> = {
  landing: 12,
  LandingStation: 12,
  repeater: 8,
  Repeater: 8,
  amplifier_e: 8,
  amplifier_w: 8,
  bu: 10,
  BU: 10,
  branching: 10,
  joint: 6,
  Joint: 6,
  underwater: 8,
  PFE: 8,
  waypoint: 5,
}

const isFiniteCoordinate = (coordinate: [number, number]) =>
  Number.isFinite(coordinate[0]) && Number.isFinite(coordinate[1])

const toPosition = (coordinate: [number, number], height = 0) => [coordinate[0], coordinate[1], height]

const toExtentObject = (extent: LonLatExtent) => ({
  xmin: extent[0],
  ymin: extent[1],
  xmax: extent[2],
  ymax: extent[3],
})

export class Mars3dPlanningAdapter {
  private readonly routeLayer: GraphicLayer
  private readonly editLayer: GraphicLayer
  private readonly selectionLayer: GraphicLayer
  private readonly resultLayer: GraphicLayer
  private readonly thematicGraphicLayers = new globalThis.Map<string, GraphicLayer>()
  private readonly thematicTileLayers = new globalThis.Map<string, BaseLayer>()
  private readonly resultGraphics = new globalThis.Map<string, BaseGraphic>()
  private readonly routeSegmentGraphics = new globalThis.Map<string, import('mars3d').graphic.PolylineEntity>()
  private routeAdjustmentEnabled = false
  private destroyed = false

  private readonly handleMouseMove = (event: any) => {
    if (!event?.cartesian) return
    const point = this.mars3d.LngLatPoint.fromCartesian(event.cartesian)
    if (!Number.isFinite(point.lng) || !Number.isFinite(point.lat)) return
    const [longitude, latitude] = normalizeLonLatCoordinate([point.lng, point.lat])
    this.callbacks.onCoordinates(longitude, latitude)
  }

  private readonly handleMapClick = (event: any) => {
    const graphic = event?.graphic as BaseGraphic | undefined
    const attr = graphic?.attr as Record<string, any> | undefined
    const kind = attr?.kind

    if (kind === 'route-segment' && attr) {
      this.callbacks.onRouteSegmentClick({
        id: String(attr.segmentId),
        routeId: String(attr.routeId),
        coordinates: attr.coordinates as [number, number][],
        length: attr.length,
        depth: attr.depth,
        cableType: attr.cableType,
        riskLevel: attr.riskLevel,
      })
      return
    }

    if (kind === 'route' && attr) {
      this.callbacks.onRouteClick(String(attr.routeId))
      return
    }

    if (kind === 'device' && attr) {
      this.callbacks.onDeviceClick(String(attr.deviceId))
      return
    }

    if (kind === 'route-edit-point') {
      if (this.routeAdjustmentEnabled && graphic) this.editLayer.startEditing(graphic)
      return
    }

    if (!graphic) this.callbacks.onBlankClick()
  }

  private readonly handleEditMove = (event: any) => {
    const graphic = event?.graphic as import('mars3d').graphic.PointEntity | undefined
    const attr = graphic?.attr as Record<string, any> | undefined
    if (!graphic || attr?.kind !== 'route-edit-point') return
    const point = graphic.point ?? this.mars3d.LngLatPoint.fromCartesian(graphic.positionShow)
    if (!Number.isFinite(point.lng) || !Number.isFinite(point.lat)) return
    this.updateRoutePointPreview(String(attr.routeId), String(attr.pointId), [point.lng, point.lat])
  }

  private readonly handleEditCommit = (event: any) => {
    const graphic = event?.graphic as import('mars3d').graphic.PointEntity | undefined
    const attr = graphic?.attr as Record<string, any> | undefined
    if (!graphic || attr?.kind !== 'route-edit-point') return
    const point = graphic.point ?? this.mars3d.LngLatPoint.fromCartesian(graphic.positionShow)
    if (!Number.isFinite(point.lng) || !Number.isFinite(point.lat)) return
    this.callbacks.onRoutePointEdited(
      String(attr.routeId),
      String(attr.pointId),
      normalizeLonLatCoordinate([point.lng, point.lat]),
    )
  }

  private readonly handleCameraMoveEnd = () => {
    const extent = this.getExtent()
    if (extent) this.callbacks.onCameraMoveEnd(extent)
  }

  constructor(
    private readonly mars3d: Mars3dModule,
    private readonly map: MarsMap,
    private readonly callbacks: MarsPlanningAdapterCallbacks,
  ) {
    this.routeLayer = new mars3d.layer.GraphicLayer({ id: 'planning-routes-3d', zIndex: 200 })
    this.editLayer = new mars3d.layer.GraphicLayer({ id: 'planning-route-edit-3d', zIndex: 230 })
    this.selectionLayer = new mars3d.layer.GraphicLayer({ id: 'planning-selection-3d', zIndex: 220 })
    this.resultLayer = new mars3d.layer.GraphicLayer({ id: 'planning-results-3d', zIndex: 40 })
    void this.map.addLayer(this.resultLayer)
    void this.map.addLayer(this.routeLayer)
    void this.map.addLayer(this.selectionLayer)
    void this.map.addLayer(this.editLayer)

    this.map.on(this.mars3d.EventType.mouseMove, this.handleMouseMove)
    this.map.on(this.mars3d.EventType.click, this.handleMapClick)
    this.map.on(this.mars3d.EventType.cameraMoveEnd, this.handleCameraMoveEnd)
    this.editLayer.on(this.mars3d.EventType.editMouseMove, this.handleEditMove)
    this.editLayer.on(this.mars3d.EventType.editMovePoint, this.handleEditCommit)
  }

  getExtent(): LonLatExtent | null {
    const extent = this.map.getExtent({ formatNum: false })
    const values = [extent?.xmin, extent?.ymin, extent?.xmax, extent?.ymax].map(Number)
    if (!values.every(Number.isFinite)) return null
    return values as LonLatExtent
  }

  flyToExtent(extent: LonLatExtent, duration = 0.6) {
    if (this.destroyed) return
    void this.map.flyToExtent(toExtentObject(extent), {
      duration,
      scale: 1.08,
      pitch: -90,
    })
  }

  renderRoutes(state: MarsRouteRenderState) {
    if (this.destroyed) return
    this.routeLayer.clear()
    this.editLayer.stopEditing()
    this.editLayer.clear()
    this.routeSegmentGraphics.clear()

    if (state.routes.length > 0) {
      this.renderParetoRoutes(state)
    } else if (state.devices.length > 0) {
      this.renderMonitorDevices(state.devices, state.selectedDeviceId)
    } else if (state.showProjectStations) {
      this.renderProjectStations(state.projectStations)
    }

    if (state.fit && this.routeLayer.length > 0) {
      const extent = this.routeLayer.getRectangle(true)
      const values = [extent?.xmin, extent?.ymin, extent?.xmax, extent?.ymax]
      if (values.every(Number.isFinite)) {
        void this.map.flyToExtent(extent, { duration: 0.65, scale: 1.12, pitch: -90 })
      }
    }
  }

  clearRoutes() {
    this.routeLayer.clear()
    this.editLayer.stopEditing()
    this.editLayer.clear()
    this.routeSegmentGraphics.clear()
  }

  setRouteAdjustment(enabled: boolean) {
    this.routeAdjustmentEnabled = enabled
    if (!enabled) this.editLayer.stopEditing()
    this.editLayer.eachGraphic((graphic: BaseGraphic) => {
      graphic.setStyle({
        ...graphic.style,
        pixelSize: enabled ? 14 : 10,
        color: enabled ? '#f59e0b' : '#ffffff',
      })
    })
  }

  async startBoxSelection(): Promise<LonLatExtent | null> {
    if (this.destroyed) return null
    this.selectionLayer.stopDraw()
    this.selectionLayer.clear()
    try {
      const graphic = await this.selectionLayer.startDraw({
        type: 'rectangle',
        style: {
          color: '#165DFF',
          opacity: 0.12,
          height: 0,
          outline: true,
          outlineColor: '#165DFF',
          outlineWidth: 2,
          clampToGround: true,
        },
        attr: { kind: 'area-selection' },
      }) as BaseGraphic
      const rectangle = graphic.getRectangle({ isFormat: true })
      const extent = [rectangle.xmin, rectangle.ymin, rectangle.xmax, rectangle.ymax].map(Number)
      return extent.every(Number.isFinite) ? extent as LonLatExtent : null
    } catch {
      return null
    }
  }

  stopBoxSelection() {
    this.selectionLayer.stopDraw()
  }

  setSelectionExtent(extent: LonLatExtent | null) {
    this.selectionLayer.stopDraw()
    this.selectionLayer.clear()
    if (!extent) return
    this.selectionLayer.addGraphic(new this.mars3d.graphic.RectangleEntity({
      positions: [toPosition([extent[0], extent[1]]), toPosition([extent[2], extent[3]])],
      style: {
        color: '#165DFF',
        opacity: 0.12,
        height: 0,
        outline: true,
        outlineColor: '#165DFF',
        outlineWidth: 2,
        clampToGround: true,
      },
      attr: { kind: 'area-selection' },
    }))
  }

  clearSelection() {
    this.selectionLayer.stopDraw()
    this.selectionLayer.clear()
  }

  async setWmsLayer(
    id: string,
    options: {
      url: string
      layers: string
      name: string
      styles?: string
      sldBody?: string
      opacity?: number
      visible: boolean
    },
  ) {
    if (this.destroyed) return
    this.removeThematicGraphicLayer(id)
    const sourceKey = JSON.stringify([options.url, options.layers, options.styles, options.sldBody])
    const existing = this.thematicTileLayers.get(id) as (BaseLayer & { __sourceKey?: string }) | undefined
    if (existing?.__sourceKey === sourceKey) {
      existing.show = options.visible
      existing.opacity = options.opacity ?? 0.9
      return
    }
    if (existing) this.removeThematicTileLayer(id)

    const layer = new this.mars3d.layer.WmsLayer({
      id: `planning-theme-${id}`,
      name: options.name,
      url: options.url,
      layers: options.layers,
      parameters: {
        format: 'image/png',
        transparent: true,
        service: 'WMS',
        version: '1.1.1',
        request: 'GetMap',
        styles: options.styles ?? '',
        ...(options.sldBody ? { sld_body: options.sldBody } : {}),
      },
      opacity: options.opacity ?? 0.9,
      show: options.visible,
      enablePickFeatures: false,
    }) as BaseLayer & { __sourceKey?: string }
    layer.__sourceKey = sourceKey
    this.thematicTileLayers.set(id, layer)
    await this.map.addLayer(layer)
  }

  setGeoJsonLayer(
    id: string,
    geojson: GeoJSON.FeatureCollection,
    style: MarsThematicStyle,
    visible: boolean,
  ) {
    if (this.destroyed) return
    this.removeThematicTileLayer(id)
    let layer = this.thematicGraphicLayers.get(id)
    if (!layer) {
      layer = new this.mars3d.layer.GraphicLayer({ id: `planning-theme-${id}`, zIndex: 100 })
      this.thematicGraphicLayers.set(id, layer)
      void this.map.addLayer(layer)
    }
    layer.clear()
    layer.show = visible
    layer.loadGeoJSON(geojson, {
      clear: true,
      flyTo: false,
      style: {
        color: style.color,
        opacity: style.opacity ?? 0.55,
        outline: true,
        outlineColor: style.outlineColor ?? style.color,
        outlineWidth: style.width ?? 2,
        width: style.width ?? 3,
        pixelSize: style.pixelSize ?? 9,
        clampToGround: true,
        classificationType: 0,
      },
      onEachFeature: (graphic: BaseGraphic) => {
        graphic.attr = { ...(graphic.attr ?? {}), thematicLayerId: id }
      },
    })
  }

  setRasterLayer(
    id: string,
    image: string,
    extent: LonLatExtent,
    options: { opacity?: number; visible?: boolean; zIndex?: number } = {},
  ) {
    if (this.destroyed) return
    this.removeThematicTileLayer(id)
    let layer = this.thematicGraphicLayers.get(id)
    if (!layer) {
      layer = new this.mars3d.layer.GraphicLayer({
        id: `planning-theme-${id}`,
        zIndex: options.zIndex ?? 80,
      })
      this.thematicGraphicLayers.set(id, layer)
      void this.map.addLayer(layer)
    }
    layer.clear()
    layer.show = options.visible ?? true
    layer.addGraphic(new this.mars3d.graphic.RectangleEntity({
      positions: [toPosition([extent[0], extent[1]]), toPosition([extent[2], extent[3]])],
      style: {
        materialType: 'Image',
        image,
        opacity: options.opacity ?? 0.72,
        height: 0,
        outline: false,
        clampToGround: true,
        zIndex: options.zIndex ?? 80,
      },
      attr: { thematicLayerId: id },
    }))
  }

  setThematicLayerVisible(id: string, visible: boolean) {
    const graphicLayer = this.thematicGraphicLayers.get(id)
    if (graphicLayer) graphicLayer.show = visible
    const tileLayer = this.thematicTileLayers.get(id)
    if (tileLayer) tileLayer.show = visible
  }

  hasThematicLayer(id: string) {
    return this.thematicGraphicLayers.has(id) || this.thematicTileLayers.has(id)
  }

  setThematicLayerOpacity(id: string, opacity: number) {
    const normalizedOpacity = Math.min(1, Math.max(0, opacity))
    const graphicLayer = this.thematicGraphicLayers.get(id)
    graphicLayer?.eachGraphic((graphic: BaseGraphic) => {
      graphic.setStyle({ ...graphic.style, opacity: normalizedOpacity })
    })
    const tileLayer = this.thematicTileLayers.get(id)
    if (tileLayer) tileLayer.opacity = normalizedOpacity
  }

  removeThematicLayer(id: string) {
    this.removeThematicGraphicLayer(id)
    this.removeThematicTileLayer(id)
  }

  setResultRaster(
    id: string,
    image: string,
    extent: LonLatExtent,
    visible: boolean,
  ) {
    const existing = this.resultGraphics.get(id)
    if (existing) this.resultLayer.removeGraphic(existing, true)
    const graphic = new this.mars3d.graphic.RectangleEntity({
      positions: [toPosition([extent[0], extent[1]]), toPosition([extent[2], extent[3]])],
      style: {
        materialType: 'Image',
        image,
        opacity: 0.72,
        height: 0,
        outline: false,
        clampToGround: true,
        zIndex: 40,
      },
      show: visible,
      attr: { resultLayerId: id },
    })
    this.resultLayer.addGraphic(graphic)
    this.resultGraphics.set(id, graphic)
  }

  setResultVisible(id: string, visible: boolean) {
    const graphic = this.resultGraphics.get(id)
    if (graphic) graphic.show = visible
  }

  removeResult(id: string) {
    const graphic = this.resultGraphics.get(id)
    if (graphic) this.resultLayer.removeGraphic(graphic, true)
    this.resultGraphics.delete(id)
  }

  clearResults() {
    this.resultLayer.clear()
    this.resultGraphics.clear()
  }

  destroy() {
    if (this.destroyed) return
    this.destroyed = true
    this.map.off(this.mars3d.EventType.mouseMove, this.handleMouseMove)
    this.map.off(this.mars3d.EventType.click, this.handleMapClick)
    this.map.off(this.mars3d.EventType.cameraMoveEnd, this.handleCameraMoveEnd)
    this.editLayer.off(this.mars3d.EventType.editMouseMove, this.handleEditMove)
    this.editLayer.off(this.mars3d.EventType.editMovePoint, this.handleEditCommit)
    this.editLayer.stopEditing()
    this.thematicGraphicLayers.forEach(layer => this.map.removeLayer(layer, true))
    this.thematicTileLayers.forEach(layer => this.map.removeLayer(layer, true))
    this.thematicGraphicLayers.clear()
    this.thematicTileLayers.clear()
    this.map.removeLayer(this.editLayer, true)
    this.map.removeLayer(this.selectionLayer, true)
    this.map.removeLayer(this.routeLayer, true)
    this.map.removeLayer(this.resultLayer, true)
  }

  private renderParetoRoutes(state: MarsRouteRenderState) {
    const orderedRoutes = state.routes
      .map((route, routeIndex) => ({ route, routeIndex }))
      .sort((left, right) => Number(left.route.id === state.selectedRouteId) - Number(right.route.id === state.selectedRouteId))
    const renderedPointKeys = new Set<string>()

    orderedRoutes.forEach(({ route, routeIndex }) => {
      const isRouteSelected = route.id === state.selectedRouteId
      const routeColor = ROUTE_COLORS[routeIndex % ROUTE_COLORS.length]
      const rawCoordinates = (route.rawTrunkCoordinates ?? []).filter(isFiniteCoordinate)
      const pointsById = new globalThis.Map(route.points.map(point => [point.id, point]))

      if (route.segments.length > 0) {
        route.segments.forEach(segment => {
          const start = pointsById.get(segment.startPointId)?.coordinates
          const end = pointsById.get(segment.endPointId)?.coordinates
          if (!start || !end) return
          const coordinates = segment.geometryStartIndex !== undefined
            && segment.geometryEndIndex !== undefined
            && rawCoordinates.length > segment.geometryEndIndex
            ? rawCoordinates.slice(segment.geometryStartIndex, segment.geometryEndIndex + 1)
            : [start, end]
          if (coordinates.length < 2) return
          const selected = segment.id === state.selectedSegmentId
          const color = segment.riskLevel ? RISK_COLORS[segment.riskLevel] : routeColor
          const graphic = new this.mars3d.graphic.PolylineEntity({
            positions: coordinates.map(item => toPosition(item, 5)),
            style: {
              width: selected ? 7 : isRouteSelected ? 5 : 3,
              color,
              opacity: 1,
              outline: selected || isRouteSelected,
              outlineColor: selected ? '#111827' : '#ffffff',
              outlineWidth: selected ? 3 : 2,
              clampToGround: true,
              depthFail: true,
              depthFailColor: color,
              highlight: { type: 'click', width: selected ? 7 : 6, color },
            },
            attr: {
              kind: 'route-segment',
              routeId: route.id,
              segmentId: segment.id,
              startPointId: segment.startPointId,
              endPointId: segment.endPointId,
              coordinates,
              length: segment.length,
              depth: segment.depth,
              cableType: segment.cableType,
              riskLevel: segment.riskLevel,
            },
          })
          this.routeLayer.addGraphic(graphic)
          this.routeSegmentGraphics.set(`${route.id}:${segment.id}`, graphic)
        })
      } else {
        const coordinates = rawCoordinates.length >= 2
          ? rawCoordinates
          : route.points.map(point => point.coordinates).filter(isFiniteCoordinate)
        if (coordinates.length >= 2) {
          this.routeLayer.addGraphic(new this.mars3d.graphic.PolylineEntity({
            positions: coordinates.map(item => toPosition(item, 5)),
            style: {
              width: isRouteSelected ? 5 : 3,
              color: routeColor,
              outline: isRouteSelected,
              outlineColor: '#ffffff',
              outlineWidth: 2,
              clampToGround: true,
              depthFail: true,
              depthFailColor: routeColor,
            },
            attr: { kind: 'route', routeId: route.id, coordinates },
          }))
        }
      }

      if (isRouteSelected && route.segments.length > 0) {
        const boundaryIds = new Set(route.segments.flatMap(segment => [segment.startPointId, segment.endPointId]))
        route.points.forEach(point => {
          if (!boundaryIds.has(point.id) || point.type === 'landing') return
          this.editLayer.addGraphic(new this.mars3d.graphic.PointEntity({
            position: toPosition(point.coordinates, 12),
            style: {
              pixelSize: this.routeAdjustmentEnabled ? 14 : 10,
              color: this.routeAdjustmentEnabled ? '#f59e0b' : '#ffffff',
              outline: true,
              outlineColor: route.segments.some(segment =>
                segment.id === state.selectedSegmentId
                && (segment.startPointId === point.id || segment.endPointId === point.id))
                ? '#ef4444'
                : '#2563eb',
              outlineWidth: 2,
              clampToGround: true,
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
            hasEdit: true,
            hasEditContextMenu: false,
            attr: { kind: 'route-edit-point', routeId: route.id, pointId: point.id },
          }))
        })
      }

      route.points.forEach(point => {
        if (point.type !== 'landing' && point.type !== 'branching') return
        const pointKey = `${point.type}:${point.coordinates[0].toFixed(7)}:${point.coordinates[1].toFixed(7)}`
        if (renderedPointKeys.has(pointKey)) return
        renderedPointKeys.add(pointKey)
        const selected = isRouteSelected
        if (point.type === 'landing') {
          this.addLandingGraphic(point.coordinates, point.name ?? '', point.depth, selected, {
            routeId: route.id,
            pointId: point.id,
          })
        } else {
          this.routeLayer.addGraphic(new this.mars3d.graphic.PointEntity({
            position: toPosition(point.coordinates, 12),
            style: {
              pixelSize: selected ? 18 : 15,
              color: '#a855f7',
              outline: true,
              outlineColor: '#ffffff',
              outlineWidth: selected ? 3 : 2,
              clampToGround: true,
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
              label: point.name ? this.createLabelStyle(point.name, '#a855f7', selected, -24) : undefined,
            },
            attr: { kind: 'route', routeId: route.id, pointId: point.id },
          }))
        }

        if (point.type !== 'branching') return
        const branchTargets = point.branchTargets ?? (point.branchTo ? [point.branchTo] : [])
        branchTargets.forEach(target => {
          const targetKey = `landing:${target.coord[0].toFixed(7)}:${target.coord[1].toFixed(7)}`
          if (renderedPointKeys.has(targetKey)) return
          renderedPointKeys.add(targetKey)
          this.addLandingGraphic(target.coord, target.name, undefined, selected, {
            routeId: route.id,
            pointId: `branch-${point.id}-${target.name}`,
          })
        })
      })
    })
  }

  private renderProjectStations(stations: MarsProjectStation[]) {
    stations.forEach((station, index) => {
      const color = index === 0 ? '#10b981' : index === stations.length - 1 ? '#ef4444' : '#3b82f6'
      this.routeLayer.addGraphic(new this.mars3d.graphic.BillboardEntity({
        position: [station.lon, station.lat, 10],
        style: {
          image: '/image/landing.png',
          scale: 0.32,
          clampToGround: true,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          label: this.createLabelStyle(station.name, color, true, -30),
        },
        attr: { kind: 'project-station', pointId: station.id },
      }))
    })
  }

  private renderMonitorDevices(devices: MonitorDevice[], selectedDeviceId: string | null) {
    const ordered = [...devices].sort((left, right) => (left.kp || 0) - (right.kp || 0))
    const mainTrunk = ordered.filter(device => !(device as any).isBranchStation)
    const branches = ordered.filter(device => (device as any).isBranchStation)

    for (let index = 0; index < mainTrunk.length - 1; index += 1) {
      const start = mainTrunk[index]
      const end = mainTrunk[index + 1]
      this.routeLayer.addGraphic(new this.mars3d.graphic.PolylineEntity({
        positions: [[start.longitude, start.latitude, 5], [end.longitude, end.latitude, 5]],
        style: {
          width: 3,
          color: '#3b82f6',
          materialType: this.mars3d.MaterialType.PolylineDash,
          materialOptions: { color: '#3b82f6', dashLength: 16 },
          clampToGround: true,
        },
        attr: {
          kind: 'route',
          routeId: 'monitor-route',
          fromId: start.id,
          toId: end.id,
        },
      }))
    }

    branches.forEach(branch => {
      const branchingUnit = mainTrunk.find(device => device.name === (branch as any).branchFrom)
      if (!branchingUnit) return
      this.routeLayer.addGraphic(new this.mars3d.graphic.PolylineEntity({
        positions: [[branchingUnit.longitude, branchingUnit.latitude, 5], [branch.longitude, branch.latitude, 5]],
        style: {
          width: 2,
          color: '#a855f7',
          materialType: this.mars3d.MaterialType.PolylineDash,
          materialOptions: { color: '#a855f7', dashLength: 12 },
          clampToGround: true,
        },
        attr: { kind: 'route', routeId: 'monitor-route' },
      }))
    })

    ordered.forEach(device => {
      const selected = device.id === selectedDeviceId
      const landing = device.type === 'landing' || device.type === 'LandingStation'
      if (landing) {
        this.routeLayer.addGraphic(new this.mars3d.graphic.BillboardEntity({
          position: [device.longitude, device.latitude, 10],
          style: {
            image: '/image/landing.png',
            scale: selected ? 0.4 : 0.34,
            clampToGround: true,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            label: this.createLabelStyle(device.name, selected ? '#ef4444' : '#333333', selected, -28),
          },
          attr: { kind: 'device', deviceId: device.id },
        }))
        return
      }
      this.routeLayer.addGraphic(new this.mars3d.graphic.PointEntity({
        position: [device.longitude, device.latitude, 10],
        style: {
          pixelSize: (DEVICE_SIZES[device.type] ?? 6) * (selected ? 1.35 : 1),
          color: DEVICE_COLORS[device.type] ?? '#6b7280',
          outline: true,
          outlineColor: selected ? '#ef4444' : '#ffffff',
          outlineWidth: selected ? 3 : 2,
          clampToGround: true,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          label: this.createLabelStyle(device.name, '#333333', selected, -20),
        },
        attr: { kind: 'device', deviceId: device.id },
      }))
    })
  }

  private addLandingGraphic(
    coordinate: [number, number],
    name: string,
    depth: number | undefined,
    selected: boolean,
    attr: Record<string, any>,
  ) {
    this.routeLayer.addGraphic(new this.mars3d.graphic.BillboardEntity({
      position: toPosition(coordinate, 10),
      style: {
        image: depth && depth > 0 ? '/image/underwater.png' : '/image/landing.png',
        scale: selected ? 0.34 : 0.28,
        clampToGround: true,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        label: name ? this.createLabelStyle(name, selected ? '#ef4444' : '#333333', selected, 22) : undefined,
      },
      attr: { kind: 'route', ...attr },
    }))
  }

  private createLabelStyle(text: string, color: string, bold: boolean, offsetY: number) {
    return {
      text,
      font_size: 15,
      font_weight: bold ? 'bold' : 'normal',
      color,
      outline: true,
      outlineColor: '#ffffff',
      outlineWidth: 3,
      pixelOffsetY: offsetY,
      clampToGround: true,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      distanceDisplayCondition: true,
      distanceDisplayCondition_far: 4_000_000,
    }
  }

  private updateRoutePointPreview(routeId: string, pointId: string, coordinate: [number, number]) {
    this.routeSegmentGraphics.forEach(graphic => {
      const attr = graphic.attr as Record<string, any>
      if (String(attr.routeId) !== routeId) return
      const coordinates = (attr.coordinates as [number, number][]).map(item => [...item] as [number, number])
      if (String(attr.startPointId) === pointId) coordinates[0] = coordinate
      if (String(attr.endPointId) === pointId) coordinates[coordinates.length - 1] = coordinate
      attr.coordinates = coordinates
      graphic.positions = coordinates.map(item => this.mars3d.LngLatPoint.toCartesian(toPosition(item, 5)))
    })
  }

  private removeThematicGraphicLayer(id: string) {
    const layer = this.thematicGraphicLayers.get(id)
    if (!layer) return
    this.map.removeLayer(layer, true)
    this.thematicGraphicLayers.delete(id)
  }

  private removeThematicTileLayer(id: string) {
    const layer = this.thematicTileLayers.get(id)
    if (!layer) return
    this.map.removeLayer(layer, true)
    this.thematicTileLayers.delete(id)
  }
}
