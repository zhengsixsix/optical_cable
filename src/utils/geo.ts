/**
 * 地理计算工具函数
 */

/**
 * 使用 Haversine 公式计算两点间的精确距离
 * @param p1 第一个点 [经度, 纬度]
 * @param p2 第二个点 [经度, 纬度]
 * @returns 距离 (km)
 */
export function calculateDistance(p1: [number, number], p2: [number, number]): number {
  const R = 6371 // 地球半径 km
  const dLat = (p2[1] - p1[1]) * Math.PI / 180
  const dLon = (p2[0] - p1[0]) * Math.PI / 180
  const lat1 = p1[1] * Math.PI / 180
  const lat2 = p2[1] * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/**
 * 计算点列表的累计 KP 值
 * @param points 点列表，每个点需要有 coordinates: [lon, lat]
 * @returns 带 kp 属性的点列表
 */
export function calculateCumulativeKP<T extends { coordinates: [number, number] }>(
  points: T[]
): (T & { kp: number })[] {
  let cumulativeKp = 0
  return points.map((point, index) => {
    if (index > 0) {
      const prev = points[index - 1]
      cumulativeKp += calculateDistance(prev.coordinates, point.coordinates)
    }
    return { ...point, kp: cumulativeKp }
  })
}
