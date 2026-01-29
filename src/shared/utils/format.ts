/**
 * 格式化工具函数
 */

// 格式化时间
export function formatTime(date: Date = new Date()): string {
  return date.toTimeString().split(' ')[0]
}

// 格式化日期时间
export function formatDateTime(date: Date = new Date()): string {
  return date.toLocaleString('zh-CN')
}

// 格式化坐标
export function formatCoordinate(coord: number, precision: number = 6): string {
  return coord.toFixed(precision)
}

// 格式化距离
export function formatDistance(meters: number): string {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(2)} km`
  }
  return `${meters.toFixed(0)} m`
}

// 格式化文件大小
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}
