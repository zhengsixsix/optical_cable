import type { PlanLayer } from '@/services/platform/types'

export type GisLayerKind = 'raster' | 'vector' | 'table' | 'unknown'

export type GisLayerFormat =
  | 'geotiff'
  | 'geojson'
  | 'topojson'
  | 'shapefile-zip'
  | 'shapefile'
  | 'kml'
  | 'kmz'
  | 'gpx'
  | 'gpkg'
  | 'csv'
  | 'xlsx'
  | 'unknown'

export type GisLoadStrategy =
  | 'geotiff-raster'
  | 'geojson-vector'
  | 'topojson-vector'
  | 'shapefile-zip-vector'
  | 'shapefile-component'
  | 'kml-vector'
  | 'kmz-vector'
  | 'gpx-vector'
  | 'gpkg-vector'
  | 'table-points'
  | 'unsupported'

export interface GisFormatInfo {
  extension: string
  format: GisLayerFormat
  kind: GisLayerKind
  loadStrategy: GisLoadStrategy
  label: string
  supported: boolean
}

const knownGisExtensions = [
  'geojson',
  'geotiff',
  'topojson',
  'tiff',
  'tif',
  'json',
  'zip',
  'shp',
  'dbf',
  'shx',
  'prj',
  'kml',
  'kmz',
  'gpx',
  'gpkg',
  'csv',
  'xlsx',
  'xls',
] as const

const fileNamePattern = new RegExp(`([^\\\\/\\s]+\\.(${knownGisExtensions.join('|')}))`, 'i')

const formatByExtension: Record<string, GisFormatInfo> = {
  tif: {
    extension: 'tif',
    format: 'geotiff',
    kind: 'raster',
    loadStrategy: 'geotiff-raster',
    label: 'GeoTIFF',
    supported: true,
  },
  tiff: {
    extension: 'tiff',
    format: 'geotiff',
    kind: 'raster',
    loadStrategy: 'geotiff-raster',
    label: 'GeoTIFF',
    supported: true,
  },
  geotiff: {
    extension: 'geotiff',
    format: 'geotiff',
    kind: 'raster',
    loadStrategy: 'geotiff-raster',
    label: 'GeoTIFF',
    supported: true,
  },
  geojson: {
    extension: 'geojson',
    format: 'geojson',
    kind: 'vector',
    loadStrategy: 'geojson-vector',
    label: 'GeoJSON',
    supported: true,
  },
  json: {
    extension: 'json',
    format: 'geojson',
    kind: 'vector',
    loadStrategy: 'geojson-vector',
    label: 'GeoJSON',
    supported: true,
  },
  topojson: {
    extension: 'topojson',
    format: 'topojson',
    kind: 'vector',
    loadStrategy: 'topojson-vector',
    label: 'TopoJSON',
    supported: false,
  },
  zip: {
    extension: 'zip',
    format: 'shapefile-zip',
    kind: 'vector',
    loadStrategy: 'shapefile-zip-vector',
    label: 'Shapefile ZIP',
    supported: true,
  },
  shp: {
    extension: 'shp',
    format: 'shapefile',
    kind: 'vector',
    loadStrategy: 'shapefile-component',
    label: 'Shapefile',
    supported: false,
  },
  dbf: {
    extension: 'dbf',
    format: 'shapefile',
    kind: 'vector',
    loadStrategy: 'shapefile-component',
    label: 'Shapefile 组件',
    supported: false,
  },
  shx: {
    extension: 'shx',
    format: 'shapefile',
    kind: 'vector',
    loadStrategy: 'shapefile-component',
    label: 'Shapefile 组件',
    supported: false,
  },
  prj: {
    extension: 'prj',
    format: 'shapefile',
    kind: 'vector',
    loadStrategy: 'shapefile-component',
    label: 'Shapefile 投影',
    supported: false,
  },
  kml: {
    extension: 'kml',
    format: 'kml',
    kind: 'vector',
    loadStrategy: 'kml-vector',
    label: 'KML',
    supported: false,
  },
  kmz: {
    extension: 'kmz',
    format: 'kmz',
    kind: 'vector',
    loadStrategy: 'kmz-vector',
    label: 'KMZ',
    supported: false,
  },
  gpx: {
    extension: 'gpx',
    format: 'gpx',
    kind: 'vector',
    loadStrategy: 'gpx-vector',
    label: 'GPX',
    supported: false,
  },
  gpkg: {
    extension: 'gpkg',
    format: 'gpkg',
    kind: 'vector',
    loadStrategy: 'gpkg-vector',
    label: 'GeoPackage',
    supported: false,
  },
  csv: {
    extension: 'csv',
    format: 'csv',
    kind: 'table',
    loadStrategy: 'table-points',
    label: 'CSV',
    supported: false,
  },
  xlsx: {
    extension: 'xlsx',
    format: 'xlsx',
    kind: 'table',
    loadStrategy: 'table-points',
    label: 'Excel',
    supported: false,
  },
  xls: {
    extension: 'xls',
    format: 'xlsx',
    kind: 'table',
    loadStrategy: 'table-points',
    label: 'Excel',
    supported: false,
  },
}

const unknownFormat: GisFormatInfo = {
  extension: '',
  format: 'unknown',
  kind: 'unknown',
  loadStrategy: 'unsupported',
  label: '未知格式',
  supported: false,
}

export function extractGisFileName(...candidates: Array<string | null | undefined>): string {
  for (const candidate of candidates) {
    const value = candidate?.trim()
    if (!value) continue

    const remarkSegment = value.includes(' - ') ? value.split(' - ').pop()?.trim() : ''
    if (remarkSegment && getFileExtension(remarkSegment)) {
      return remarkSegment
    }

    const directMatch = value.match(fileNamePattern)
    if (directMatch?.[1]) {
      return directMatch[1].trim()
    }
  }

  return ''
}

export function getPlanLayerFileName(layer: PlanLayer | null | undefined): string {
  if (!layer) return ''
  return extractGisFileName(layer.attachmentName, layer.filename, layer.remarks, layer.name)
}

export function getFileExtension(fileName: string | null | undefined): string {
  const cleanName = fileName?.split(/[?#]/)[0]?.trim() ?? ''
  const lastSegment = cleanName.split(/[\\/]/).pop() ?? ''
  const dotIndex = lastSegment.lastIndexOf('.')
  if (dotIndex < 0 || dotIndex === lastSegment.length - 1) return ''
  return lastSegment.slice(dotIndex + 1).toLowerCase()
}

export function detectGisFormat(fileName: string | null | undefined): GisFormatInfo {
  const extension = getFileExtension(fileName)
  if (!extension) return unknownFormat

  return formatByExtension[extension] ?? {
    ...unknownFormat,
    extension,
  }
}
