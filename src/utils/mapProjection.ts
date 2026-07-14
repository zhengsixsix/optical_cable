import { transform, transformExtent } from 'ol/proj'
import type { ProjectionLike } from 'ol/proj'
import type { Coordinate, Extent } from '@/types'

export const DATA_PROJECTION = 'EPSG:4326'
export const MAP_DISPLAY_PROJECTION = 'EPSG:3857'

function getProjectionCode(projection: ProjectionLike): string {
  if (typeof projection === 'string') return projection
  return projection?.getCode?.() ?? String(projection)
}

export function toMapCoordinate(
  coordinate: Coordinate,
  mapProjection: ProjectionLike = MAP_DISPLAY_PROJECTION,
): Coordinate {
  if (getProjectionCode(mapProjection) === DATA_PROJECTION) {
    return [coordinate[0], coordinate[1]]
  }

  return transform([coordinate[0], coordinate[1]], DATA_PROJECTION, mapProjection) as Coordinate
}

export function toMapCoordinates(
  coordinates: Coordinate[],
  mapProjection: ProjectionLike = MAP_DISPLAY_PROJECTION,
): Coordinate[] {
  return coordinates.map(coordinate => toMapCoordinate(coordinate, mapProjection))
}

export function fromMapCoordinate(
  coordinate: Coordinate,
  mapProjection: ProjectionLike = MAP_DISPLAY_PROJECTION,
): Coordinate {
  if (getProjectionCode(mapProjection) === DATA_PROJECTION) {
    return [coordinate[0], coordinate[1]]
  }

  return transform([coordinate[0], coordinate[1]], mapProjection, DATA_PROJECTION) as Coordinate
}

export function fromMapCoordinates(
  coordinates: Coordinate[],
  mapProjection: ProjectionLike = MAP_DISPLAY_PROJECTION,
): Coordinate[] {
  return coordinates.map(coordinate => fromMapCoordinate(coordinate, mapProjection))
}

export function toMapExtent(
  extent: Extent,
  mapProjection: ProjectionLike = MAP_DISPLAY_PROJECTION,
): Extent {
  if (getProjectionCode(mapProjection) === DATA_PROJECTION) {
    return [...extent] as Extent
  }

  return transformExtent(extent, DATA_PROJECTION, mapProjection) as Extent
}

export function fromMapExtent(
  extent: Extent,
  mapProjection: ProjectionLike = MAP_DISPLAY_PROJECTION,
): Extent {
  if (getProjectionCode(mapProjection) === DATA_PROJECTION) {
    return [...extent] as Extent
  }

  return transformExtent(extent, mapProjection, DATA_PROJECTION) as Extent
}
