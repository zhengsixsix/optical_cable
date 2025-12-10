import type { GeoTiffData, ElevationData, Extent, ImportResult, ExportFormat } from '@/types'

export interface IGeoRepository {
  loadGeoTiff(url: string): Promise<GeoTiffData>
  getElevationData(extent: Extent): Promise<ElevationData>
  importGisFile(file: File): Promise<ImportResult>
  exportRouteData(routeId: string, format: ExportFormat): Promise<Blob>
}
