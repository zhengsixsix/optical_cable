/**
 * 器件库引用服务
 * 用于在 SLD 设备、Connector 接线元等数据中引用器件库定义
 */

import { useDeviceLibraryStore } from '@/modules/device-library/store'
import type { SLDEquipment, SLDFiberSegment } from '@/types'
import type { ConnectorElement } from '@/types/connector'

export interface DeviceSpecifications {
  model: string
  manufacturer: string
  specifications: Record<string, any>
  unitPrice: number
}

/**
 * 获取设备的器件库规格
 */
export function getDeviceSpecs(componentRefId: string | undefined): DeviceSpecifications | null {
  if (!componentRefId) return null
  
  const deviceLibrary = useDeviceLibraryStore()
  const device = deviceLibrary.devices.find(d => d.id === componentRefId)
  
  if (!device) return null
  
  return {
    model: device.model,
    manufacturer: device.manufacturer,
    specifications: device.specifications,
    unitPrice: device.unitPrice,
  }
}

/**
 * 获取海缆的器件库规格
 */
export function getCableSpecs(cableRefId: string | undefined): DeviceSpecifications | null {
  if (!cableRefId) return null
  
  const deviceLibrary = useDeviceLibraryStore()
  const cable = deviceLibrary.devices.find(d => d.id === cableRefId && d.category === 'cable')
  
  if (!cable) return null
  
  return {
    model: cable.model,
    manufacturer: cable.manufacturer,
    specifications: cable.specifications,
    unitPrice: cable.unitPrice,
  }
}

/**
 * 为 SLD 设备应用器件库规格
 */
export function applySLDEquipmentSpecs(equipment: SLDEquipment): SLDEquipment {
  const specs = getDeviceSpecs(equipment.componentRefId)
  if (!specs) return equipment
  
  return {
    ...equipment,
    specifications: specs.model,
    manufacturer: specs.manufacturer,
  }
}

/**
 * 为 SLD 光纤段应用器件库规格
 */
export function applySLDFiberSpecs(segment: SLDFiberSegment): SLDFiberSegment {
  const specs = getCableSpecs(segment.cableRefId)
  if (!specs) return segment
  
  return {
    ...segment,
    cableType: specs.model,
    attenuation: specs.specifications.attenuation || segment.attenuation,
  }
}

/**
 * 为接线元应用器件库规格
 */
export function applyConnectorSpecs(element: ConnectorElement): ConnectorElement {
  const specs = getDeviceSpecs(element.componentRefId)
  if (!specs) return element
  
  return {
    ...element,
    specifications: specs.model,
    manufacturer: specs.manufacturer,
  }
}

/**
 * 计算设备成本（基于器件库单价）
 */
export function calculateDeviceCost(componentRefId: string | undefined, quantity: number = 1): number {
  const specs = getDeviceSpecs(componentRefId)
  if (!specs) return 0
  return specs.unitPrice * quantity
}

/**
 * 计算海缆成本（基于长度和器件库单价）
 */
export function calculateCableCost(cableRefId: string | undefined, lengthKm: number): number {
  const specs = getCableSpecs(cableRefId)
  if (!specs) return 0
  return specs.unitPrice * lengthKm
}

export const deviceReferenceService = {
  getDeviceSpecs,
  getCableSpecs,
  applySLDEquipmentSpecs,
  applySLDFiberSpecs,
  applyConnectorSpecs,
  calculateDeviceCost,
  calculateCableCost,
}
