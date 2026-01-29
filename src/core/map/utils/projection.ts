import { fromLonLat } from 'ol/proj'
import { getDistance } from 'ol/sphere'
import type { Coordinate } from 'ol/coordinate'

/**
 * 坐标转换工具
 */

// 经纬度转墨卡托投影
export function lonLatToMercator(lonLat: [number, number]): [number, number] {
  return fromLonLat(lonLat) as [number, number]
}

// 墨卡托投影转经纬度
export { toLonLat as mercatorToLonLat } from 'ol/proj'

// 计算两点间距离（米）
export function calculateDistance(coord1: [number, number], coord2: [number, number]): number {
  return getDistance(coord1, coord2)
}

// 计算路径总长度（米）
export function calculatePathLength(coordinates: [number, number][]): number {
  let total = 0
  for (let i = 0; i < coordinates.length - 1; i++) {
    total += calculateDistance(coordinates[i], coordinates[i + 1])
  }
  return total
}

// 格式化坐标为字符串
export function formatCoordinate(lonLat: [number, number], precision = 6): string {
  return `${lonLat[0].toFixed(precision)}, ${lonLat[1].toFixed(precision)}`
}

// 解析坐标字符串
export function parseCoordinate(str: string): [number, number] | null {
  const parts = str.split(',').map(s => parseFloat(s.trim()))
  if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
    return [parts[0], parts[1]]
  }
  return null
}
