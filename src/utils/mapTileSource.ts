import XYZ from 'ol/source/XYZ'

// 统一底图瓦片源
// 原先使用的 `ol/source/OSM` 走 tile.openstreetmap.org，在中国境内访问不稳定
// 这里切换为高德地图 XYZ 瓦片，支持多子域并发，全球覆盖，国内访问通畅
// 如需更换底图（天地图 / ArcGIS / 自建代理等），只需修改此文件

// 高德矢量底图（中文标注，样式偏清爽）
// style=7  —— 带路网 + 标注
// style=8  —— 纯路网
// style=6  —— 卫星影像
const GAODE_VECTOR_URL =
  'https://webrd0{1-4}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=7&x={x}&y={y}&z={z}'

export function createBaseTileSource(): XYZ {
  return new XYZ({
    url: GAODE_VECTOR_URL,
    crossOrigin: 'anonymous',
    // 最大缩放与 OSM 保持一致，避免越级请求 404
    maxZoom: 18,
  })
}
