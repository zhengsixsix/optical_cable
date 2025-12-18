/**
 * 数据联动服务
 * 负责管理所有数据模块之间的关联关系和联动更新
 * 当一个数据变化时，自动触发关联数据的同步更新
 */

import { ref, watch } from 'vue'
import type { RPLRecord, SLDEquipment, ConnectorElement } from '@/types'

// 统一设备ID前缀
export const DEVICE_ID_PREFIX = {
  RPL: 'rpl-',
  SLD: 'sld-',
  CONNECTOR: 'conn-',
  MONITOR: 'mon-',
}

// 设备关联映射表 - 通过KP位置建立关联
export interface DeviceLink {
  kp: number
  rplRecordId?: string
  sldEquipmentId?: string
  connectorElementId?: string
  monitorDeviceId?: string
  longitude: number
  latitude: number
  depth: number
  name: string
  type: string
}

// 数据变更事件
export type DataChangeEvent = {
  source: 'rpl' | 'sld' | 'connector' | 'monitor' | 'route'
  action: 'add' | 'update' | 'delete'
  data: any
  kp?: number
}

// 联动回调类型
type LinkCallback = (event: DataChangeEvent) => void

class DataLinkService {
  private deviceLinks = ref<Map<number, DeviceLink>>(new Map())
  private callbacks: Map<string, LinkCallback[]> = new Map()
  private enabled = ref(true)

  constructor() {
    this.callbacks.set('rpl', [])
    this.callbacks.set('sld', [])
    this.callbacks.set('connector', [])
    this.callbacks.set('monitor', [])
    this.callbacks.set('route', [])
  }

  // 注册联动回调
  subscribe(module: string, callback: LinkCallback) {
    const callbacks = this.callbacks.get(module) || []
    callbacks.push(callback)
    this.callbacks.set(module, callbacks)
    
    return () => {
      const cbs = this.callbacks.get(module) || []
      const index = cbs.indexOf(callback)
      if (index > -1) cbs.splice(index, 1)
    }
  }

  // 触发联动更新
  emit(event: DataChangeEvent) {
    if (!this.enabled.value) return

    // 通知所有非源模块
    this.callbacks.forEach((callbacks, module) => {
      if (module !== event.source) {
        callbacks.forEach(cb => cb(event))
      }
    })

    // 更新设备关联表
    if (event.kp !== undefined) {
      this.updateDeviceLink(event)
    }
  }

  // 更新设备关联
  private updateDeviceLink(event: DataChangeEvent) {
    const kp = event.kp!
    const existing = this.deviceLinks.value.get(kp) || {
      kp,
      longitude: 0,
      latitude: 0,
      depth: 0,
      name: '',
      type: '',
    }

    if (event.action === 'delete') {
      // 删除对应模块的ID
      switch (event.source) {
        case 'rpl':
          delete existing.rplRecordId
          break
        case 'sld':
          delete existing.sldEquipmentId
          break
        case 'connector':
          delete existing.connectorElementId
          break
        case 'monitor':
          delete existing.monitorDeviceId
          break
      }
      
      // 如果所有ID都为空，删除整个关联
      if (!existing.rplRecordId && !existing.sldEquipmentId && 
          !existing.connectorElementId && !existing.monitorDeviceId) {
        this.deviceLinks.value.delete(kp)
      } else {
        this.deviceLinks.value.set(kp, existing)
      }
    } else {
      // 添加或更新
      const data = event.data
      existing.longitude = data.longitude ?? existing.longitude
      existing.latitude = data.latitude ?? existing.latitude
      existing.depth = data.depth ?? existing.depth
      existing.name = data.name ?? data.remarks ?? existing.name
      existing.type = data.pointType ?? data.type ?? existing.type

      switch (event.source) {
        case 'rpl':
          existing.rplRecordId = data.id
          break
        case 'sld':
          existing.sldEquipmentId = data.id
          break
        case 'connector':
          existing.connectorElementId = data.id
          break
        case 'monitor':
          existing.monitorDeviceId = data.id
          break
      }

      this.deviceLinks.value.set(kp, existing)
    }
  }

  // 根据KP获取关联设备
  getLinkedDevices(kp: number): DeviceLink | undefined {
    return this.deviceLinks.value.get(kp)
  }

  // 根据KP范围获取关联设备
  getLinkedDevicesInRange(startKp: number, endKp: number): DeviceLink[] {
    const result: DeviceLink[] = []
    this.deviceLinks.value.forEach((link, kp) => {
      if (kp >= startKp && kp <= endKp) {
        result.push(link)
      }
    })
    return result.sort((a, b) => a.kp - b.kp)
  }

  // 获取所有关联设备
  getAllDeviceLinks(): DeviceLink[] {
    return Array.from(this.deviceLinks.value.values()).sort((a, b) => a.kp - b.kp)
  }

  // 初始化设备关联（从现有数据构建）
  initFromData(
    rplRecords: RPLRecord[],
    sldEquipments: SLDEquipment[],
    connectorElements: ConnectorElement[]
  ) {
    this.deviceLinks.value.clear()

    // 从RPL记录构建基础关联
    rplRecords.forEach(record => {
      if (record.pointType !== 'waypoint') {
        this.deviceLinks.value.set(record.kp, {
          kp: record.kp,
          rplRecordId: record.id,
          longitude: record.longitude,
          latitude: record.latitude,
          depth: record.depth,
          name: record.remarks || `KP${record.kp}`,
          type: record.pointType,
        })
      }
    })

    // 关联SLD设备
    sldEquipments.forEach(eq => {
      const link = this.findClosestLink(eq.kp)
      if (link) {
        link.sldEquipmentId = eq.id
      } else {
        this.deviceLinks.value.set(eq.kp, {
          kp: eq.kp,
          sldEquipmentId: eq.id,
          longitude: eq.longitude,
          latitude: eq.latitude,
          depth: eq.depth,
          name: eq.name,
          type: eq.type,
        })
      }
    })

    // 关联接线元
    connectorElements.forEach(elem => {
      const link = this.findClosestLink(elem.kp)
      if (link) {
        link.connectorElementId = elem.id
      } else {
        this.deviceLinks.value.set(elem.kp, {
          kp: elem.kp,
          connectorElementId: elem.id,
          longitude: elem.longitude,
          latitude: elem.latitude,
          depth: elem.depth,
          name: elem.name,
          type: elem.type,
        })
      }
    })
  }

  // 查找最近的关联点（容差1km）
  private findClosestLink(kp: number, tolerance = 1): DeviceLink | null {
    let closest: DeviceLink | null = null
    let minDiff = tolerance

    this.deviceLinks.value.forEach((link, linkKp) => {
      const diff = Math.abs(linkKp - kp)
      if (diff < minDiff) {
        minDiff = diff
        closest = link
      }
    })

    return closest
  }

  // 暂停联动（批量操作时使用）
  pause() {
    this.enabled.value = false
  }

  // 恢复联动
  resume() {
    this.enabled.value = true
  }

  // 批量操作包装器
  batch<T>(fn: () => T): T {
    this.pause()
    try {
      return fn()
    } finally {
      this.resume()
    }
  }

  // 从RPL点位同步创建SLD设备数据
  rplToSldEquipment(record: RPLRecord): Omit<SLDEquipment, 'id' | 'sequence'> | null {
    if (record.pointType === 'waypoint') return null

    const typeMap: Record<string, SLDEquipment['type']> = {
      landing: 'TE',
      repeater: 'REP',
      branching: 'BU',
      joint: 'JOINT',
    }

    return {
      name: record.remarks || `${typeMap[record.pointType]}-KP${record.kp}`,
      type: typeMap[record.pointType] || 'JOINT',
      location: `KP ${record.kp.toFixed(1)}`,
      kp: record.kp,
      longitude: record.longitude,
      latitude: record.latitude,
      depth: record.depth,
      specifications: '',
      remarks: `由RPL记录同步生成`,
    }
  }

  // 从RPL点位同步创建接线元数据
  rplToConnectorElement(record: RPLRecord): Omit<ConnectorElement, 'id'> | null {
    if (record.pointType === 'waypoint' || record.pointType === 'landing') return null

    const typeMap: Record<string, ConnectorElement['type']> = {
      repeater: 'ola',
      branching: 'bu',
      joint: 'joint',
    }

    return {
      name: record.remarks || `${record.pointType}-KP${record.kp}`,
      type: typeMap[record.pointType] || 'joint',
      kp: record.kp,
      longitude: record.longitude,
      latitude: record.latitude,
      depth: record.depth,
      status: 'active',
      specifications: '',
      remarks: `由RPL记录同步生成`,
    }
  }

  // 从SLD设备同步更新相关数据
  syncFromSldEquipment(equipment: SLDEquipment) {
    return {
      kp: equipment.kp,
      longitude: equipment.longitude,
      latitude: equipment.latitude,
      depth: equipment.depth,
      name: equipment.name,
    }
  }
}

// 单例导出
export const dataLinkService = new DataLinkService()

// Vue composable
export function useDataLink() {
  return {
    service: dataLinkService,
    deviceLinks: dataLinkService.getAllDeviceLinks,
    getLinkedDevices: dataLinkService.getLinkedDevices.bind(dataLinkService),
    getLinkedDevicesInRange: dataLinkService.getLinkedDevicesInRange.bind(dataLinkService),
    emit: dataLinkService.emit.bind(dataLinkService),
    subscribe: dataLinkService.subscribe.bind(dataLinkService),
    batch: dataLinkService.batch.bind(dataLinkService),
  }
}
