import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { logger } from '@/shared/utils'

/**
 * 器件库模块 Store
 */

// 器件类型
export type DeviceCategory = 'cable' | 'repeater' | 'branching-unit' | 'terminal' | 'connector'

// 器件定义
export interface Device {
  id: string
  name: string
  category: DeviceCategory
  model: string
  manufacturer: string
  specifications: Record<string, any>
  unitPrice: number
  description: string
  createdAt: string
  updatedAt: string
}

// 器件库筛选
export interface DeviceFilter {
  category?: DeviceCategory
  manufacturer?: string
  keyword?: string
}

export const useDeviceLibraryStore = defineStore('device-library', () => {
  // ==================== 状态 ====================
  const devices = ref<Device[]>([])
  const selectedDeviceId = ref<string | null>(null)
  const filter = ref<DeviceFilter>({})

  // ==================== 计算属性 ====================
  const selectedDevice = computed(() =>
    devices.value.find(d => d.id === selectedDeviceId.value) || null
  )

  const filteredDevices = computed(() => {
    let result = [...devices.value]

    if (filter.value.category) {
      result = result.filter(d => d.category === filter.value.category)
    }

    if (filter.value.manufacturer) {
      result = result.filter(d => d.manufacturer === filter.value.manufacturer)
    }

    if (filter.value.keyword) {
      const keyword = filter.value.keyword.toLowerCase()
      result = result.filter(d =>
        d.name.toLowerCase().includes(keyword) ||
        d.model.toLowerCase().includes(keyword) ||
        d.description.toLowerCase().includes(keyword)
      )
    }

    return result
  })

  const categories = computed(() => {
    const cats = new Set(devices.value.map(d => d.category))
    return Array.from(cats)
  })

  const manufacturers = computed(() => {
    const mfrs = new Set(devices.value.map(d => d.manufacturer))
    return Array.from(mfrs)
  })

  // ==================== 操作 ====================
  function addDevice(device: Omit<Device, 'id' | 'createdAt' | 'updatedAt'>): Device {
    const now = new Date().toISOString()
    const newDevice: Device = {
      ...device,
      id: `device-${Date.now()}`,
      createdAt: now,
      updatedAt: now,
    }

    devices.value.push(newDevice)
    logger.info(`添加器件: ${device.name}`)
    return newDevice
  }

  function updateDevice(deviceId: string, updates: Partial<Device>) {
    const device = devices.value.find(d => d.id === deviceId)
    if (device) {
      Object.assign(device, updates, { updatedAt: new Date().toISOString() })
      logger.info(`更新器件: ${device.name}`)
    }
  }

  function deleteDevice(deviceId: string) {
    const index = devices.value.findIndex(d => d.id === deviceId)
    if (index > -1) {
      const device = devices.value[index]
      devices.value.splice(index, 1)
      logger.info(`删除器件: ${device.name}`)
    }
  }

  function selectDevice(deviceId: string | null) {
    selectedDeviceId.value = deviceId
  }

  function setFilter(newFilter: DeviceFilter) {
    filter.value = newFilter
  }

  function clearFilter() {
    filter.value = {}
  }

  // ==================== 初始化 Mock 数据 ====================
  function initMockData() {
    if (devices.value.length > 0) return

    const mockDevices: Omit<Device, 'id' | 'createdAt' | 'updatedAt'>[] = [
      {
        name: 'LW 轻型海缆',
        category: 'cable',
        model: 'LW-48',
        manufacturer: '中天科技',
        specifications: { fiberCount: 48, diameter: 17, weight: 0.7 },
        unitPrice: 25000,
        description: '适用于深水区域的轻型海缆',
      },
      {
        name: 'SA 单铠装海缆',
        category: 'cable',
        model: 'SA-48',
        manufacturer: '中天科技',
        specifications: { fiberCount: 48, diameter: 32, weight: 3.5 },
        unitPrice: 45000,
        description: '适用于中等水深的单铠装海缆',
      },
      {
        name: 'DA 双铠装海缆',
        category: 'cable',
        model: 'DA-48',
        manufacturer: '亨通光电',
        specifications: { fiberCount: 48, diameter: 45, weight: 8.0 },
        unitPrice: 75000,
        description: '适用于浅水区域的双铠装海缆',
      },
      {
        name: '光纤放大器',
        category: 'repeater',
        model: 'REP-200',
        manufacturer: '华为海洋',
        specifications: { gain: 20, wavelengths: 96, power: 15 },
        unitPrice: 500000,
        description: '高性能光纤放大器',
      },
      {
        name: '分支器',
        category: 'branching-unit',
        model: 'BU-4',
        manufacturer: 'NEC',
        specifications: { ports: 4, maxDepth: 6000 },
        unitPrice: 800000,
        description: '四端口水下分支器',
      },
    ]

    mockDevices.forEach(d => addDevice(d))
    logger.info(`初始化器件库: ${mockDevices.length} 个器件`)
  }

  // ==================== 清理 ====================
  function clearAllData() {
    devices.value = []
    selectedDeviceId.value = null
    filter.value = {}
  }

  return {
    // 状态
    devices,
    selectedDeviceId,
    filter,
    // 计算属性
    selectedDevice,
    filteredDevices,
    categories,
    manufacturers,
    // 操作
    addDevice,
    updateDevice,
    deleteDevice,
    selectDevice,
    setFilter,
    clearFilter,
    // 初始化和清理
    initMockData,
    clearAllData,
  }
})
