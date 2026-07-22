export interface SystemDeviceLegendItem {
  type: string
  label: string
}

const DEVICE_ICON_FILES: Record<string, string> = {
  landing: 'landing.png',
  ola: 'amplifier-e.png',
  amplifier_e: 'amplifier-e.png',
  amplifier_w: 'amplifier-w.png',
  bu: 'bu.png',
  branching: 'bu.png',
  equalizer: 'equalizer.svg',
  joint: 'joint.svg',
  underwater: 'underwater.png',
}

export const systemDeviceLegendItems: SystemDeviceLegendItem[] = [
  { type: 'landing', label: '岸上站点' },
  { type: 'amplifier_e', label: '放大器东' },
  { type: 'amplifier_w', label: '放大器西' },
  { type: 'bu', label: '分支器' },
  { type: 'equalizer', label: '均衡器' },
  { type: 'joint', label: '接头盒' },
  { type: 'underwater', label: '水下站点' },
]

export function getSystemDeviceIcon(
  type: string,
  isSelected = false,
  elevation?: number,
): string {
  const resolvedType = type === 'landing' && elevation !== undefined && elevation < 0
    ? 'underwater'
    : type
  const filename = DEVICE_ICON_FILES[resolvedType] || DEVICE_ICON_FILES.underwater
  if (!isSelected) return `/image/${filename}`

  const extensionIndex = filename.lastIndexOf('.')
  return `/image/${filename.slice(0, extensionIndex)}-select${filename.slice(extensionIndex)}`
}
