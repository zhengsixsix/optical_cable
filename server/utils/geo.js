/**
 * 地理计算工具
 */

/**
 * Haversine 距离计算 (km)
 */
export function haversineDistance(lon1, lat1, lon2, lat2) {
    const R = 6371
    const dLat = ((lat2 - lat1) * Math.PI) / 180
    const dLon = ((lon2 - lon1) * Math.PI) / 180
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) ** 2
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/**
 * EPSG:3857 转经纬度
 */
export function mercatorToLatLon(x, y) {
    const lon = (x / 20037508.34) * 180
    let lat = (y / 20037508.34) * 180
    lat = (180 / Math.PI) * (2 * Math.atan(Math.exp((lat * Math.PI) / 180)) - Math.PI / 2)
    return [lon, lat]
}
