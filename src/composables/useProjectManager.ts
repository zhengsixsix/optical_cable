/**
 * 项目管理 Composable
 * 整合打开/保存/另存为/关闭项目的完整业务流程
 */

import { ref, computed } from 'vue'
import { useAppStore, useUserStore, useProjectDataStore, useLayerStore, useRPLStore, useSettingsStore, useRouteStore, useConnectorStore, useMonitorStore } from '@/stores'
import { projectFileService, type OpenProjectResult, type ProjectMetadata, type ProjectType } from '@/services/ProjectFileService'
import { generateUUID } from '@/types/useFile'

// 新建项目参数
export interface CreateProjectParams {
  projectType: ProjectType
  projectName: string
  allowOtherUsers: boolean
  rplFile?: string
  rplFileData?: File  // RPL 文件对象，用于导入
  planningMode?: 'point-to-point' | 'multi-point'
  startStation?: {
    name: string
    longitude: number
    latitude: number
  }
  endStation?: {
    name: string
    longitude: number
    latitude: number
  }
  waypoints?: Array<{
    id: string
    name: string
    longitude: number
    latitude: number
  }>
  gisConfig?: {
    planningRange: string
    gridSize: string
  }
  layers: Array<{
    key: string
    label: string
    checked: boolean
    value: string
  }>
  devices?: Array<{
    id: string
    name: string
    type: string
    file?: string
    parsedData?: {
      fiberTypes?: any[]
      amplifierTypes?: any[]
      branchingUnitTypes?: any[]
    }
  }>
  // 路径规划成本
  routeCosts?: Array<{
    id: string
    name: string
    price: number
  }>
  // 系统规划成本
  systemCosts?: Array<{
    id: string
    name: string
    price: number
  }>
}

// 保存提示对话框的用户选择
export type SavePromptChoice = 'save' | 'discard' | 'cancel'

// 打开项目的流程状态
interface OpenProjectState {
  pendingFile: File | null
  showSavePrompt: boolean
}

export function useProjectManager() {
  const appStore = useAppStore()
  const userStore = useUserStore()
  const projectDataStore = useProjectDataStore()
  
  // 状态
  const openState = ref<OpenProjectState>({
    pendingFile: null,
    showSavePrompt: false,
  })
  
  const showSaveAsDialog = ref(false)
  const isProcessing = ref(false)
  
  // 计算属性
  const hasOpenProject = computed(() => appStore.hasOpenProject)
  const currentProjectName = computed(() => appStore.currentProjectName)
  const currentProjectType = computed(() => appStore.currentProjectType)
  const isDirty = computed(() => appStore.projectState.isDirty)
  
  /**
   * 打开项目文件
   * 完整流程：检查当前项目 → 提示保存 → 选择文件 → 权限验证 → 加载
   */
  async function openProject(): Promise<void> {
    // 1. 先让用户选择文件
    const file = await projectFileService.openFileDialog('.use')
    if (!file) return
    
    // 2. 检查当前是否有未保存的项目
    if (hasOpenProject.value && isDirty.value) {
      // 保存待打开的文件，显示保存提示对话框
      openState.value.pendingFile = file
      openState.value.showSavePrompt = true
      return
    }
    
    // 3. 直接打开文件
    await doOpenFile(file)
  }
  
  /**
   * 处理保存提示对话框的用户选择
   */
  async function handleSavePromptChoice(choice: SavePromptChoice): Promise<void> {
    openState.value.showSavePrompt = false
    
    if (choice === 'cancel') {
      // 取消操作，清除待打开的文件
      openState.value.pendingFile = null
      return
    }
    
    if (choice === 'save') {
      // 先保存当前项目
      const saved = await saveProject()
      if (!saved) {
        // 保存失败，取消操作
        openState.value.pendingFile = null
        return
      }
    }
    
    // 关闭当前项目并打开新文件
    if (openState.value.pendingFile) {
      closeProject()
      await doOpenFile(openState.value.pendingFile)
      openState.value.pendingFile = null
    }
  }
  
  /**
   * 执行打开文件操作
   */
  async function doOpenFile(file: File): Promise<OpenProjectResult> {
    isProcessing.value = true
    
    try {
      const result = await projectFileService.importProject(file)
      
      if (!result.success) {
        // 处理错误
        if (result.errorType === 'permission') {
          appStore.showNotification({
            type: 'error',
            message: result.error || '无法打开项目：权限不足',
          })
        } else if (result.errorType === 'format') {
          appStore.showNotification({
            type: 'error',
            message: result.error || '无效的项目文件格式',
          })
        } else {
          appStore.showNotification({
            type: 'error',
            message: result.error || '打开项目失败',
          })
        }
        return result
      }
      
      // 成功打开 - 从 projectFileService 获取元数据
      const currentProject = projectFileService.getCurrentProject()
      if (currentProject) {
        appStore.setCurrentProject(currentProject)
      }
      
      // 设置数据联动并标记已加载（文件数据已由 ProjectFileService.importProject 加载）
      projectDataStore.setupDataLinks()
      projectDataStore.markDataLoaded()
      
      appStore.showNotification({
        type: 'success',
        message: `项目已打开：${currentProject?.name || file.name}`,
      })
      
      return result
    } finally {
      isProcessing.value = false
    }
  }
  
  /**
   * 保存当前项目
   */
  async function saveProject(): Promise<boolean> {
    if (!hasOpenProject.value) {
      appStore.showNotification({
        type: 'warning',
        message: '当前没有打开的项目',
      })
      return false
    }
    
    isProcessing.value = true
    
    try {
      const result = await projectFileService.saveProject()
      
      if (result.success) {
        appStore.markProjectSaved()
        appStore.showNotification({
          type: 'success',
          message: `项目已保存：${currentProjectName.value}`,
        })
      } else {
        appStore.showNotification({
          type: 'error',
          message: result.error || '保存项目失败',
        })
      }
      
      return result.success
    } finally {
      isProcessing.value = false
    }
  }
  
  /**
   * 另存为
   */
  function openSaveAsDialog(): void {
    appStore.openDialog('save-as')
  }
  
  /**
   * 执行另存为操作
   */
  async function saveProjectAs(projectName: string, savePath: string): Promise<boolean> {
    isProcessing.value = true
    
    try {
      // 导出 USE 格式
      await projectFileService.exportUSE(projectName)
      
      // 更新当前项目信息
      const newMetadata: ProjectMetadata = {
        name: projectName,
        path: `${savePath}/${projectName}.use`,
        type: 'use',
        uuid: '',
        lastModified: new Date().toISOString(),
        creatorId: userStore.currentUser?.id || '',
        allowOtherUsers: false,
      }
      
      appStore.setCurrentProject(newMetadata)
      appStore.markProjectSaved()
      appStore.showNotification({
        type: 'success',
        message: `项目已另存为：${projectName}`,
      })
      
      return true
    } catch (error) {
      appStore.showNotification({
        type: 'error',
        message: '另存项目失败',
      })
      return false
    } finally {
      isProcessing.value = false
    }
  }
  
  /**
   * 关闭当前项目
   */
  function closeProject(): void {
    projectFileService.closeProject()
    appStore.closeCurrentProject()
    // 清空项目数据
    projectDataStore.clearProjectData()
  }
  
  /**
   * 检查是否可以安全关闭（无未保存更改）
   */
  function canSafelyClose(): boolean {
    return !hasOpenProject.value || !isDirty.value
  }
  
  /**
   * 标记项目已修改
   */
  function markDirty(): void {
    appStore.setProjectDirty(true)
  }

  /**
   * 新建项目
   */
  async function createProject(params: CreateProjectParams): Promise<boolean> {
    const { projectType, projectName, allowOtherUsers, layers, rplFileData, startStation, endStation, waypoints, planningMode, gisConfig } = params
    
    // 检查当前是否有未保存的项目
    if (hasOpenProject.value && isDirty.value) {
      appStore.showNotification({
        type: 'warning',
        message: '请先保存或关闭当前项目',
      })
      return false
    }

    // 关闭当前项目
    if (hasOpenProject.value) {
      closeProject()
    }

    isProcessing.value = true

    try {
      // 创建项目元数据
      const projectUUID = generateUUID()
      const newMetadata: ProjectMetadata = {
        name: projectName,
        path: '',
        type: projectType,
        uuid: projectUUID,
        lastModified: new Date().toISOString(),
        creatorId: userStore.currentUser?.id || '',
        allowOtherUsers: allowOtherUsers,
      }

      // 设置当前项目
      appStore.setCurrentProject(newMetadata)
      projectFileService.setCurrentProject(newMetadata)

      // 根据选择的图层加载数据
      const layerStore = useLayerStore()
      for (const layer of layers) {
        if (layer.checked) {
          layerStore.setLayerVisible(layer.key, true)
        }
      }

      // 如果有设置站点位置或GIS配置，更新工程设置
      const settingsStore = useSettingsStore()
      
      if (startStation || endStation || gisConfig || (waypoints && waypoints.length > 0)) {
        settingsStore.updateRoutePlanningConfig({
          mode: planningMode || 'point-to-point',
          startPoint: startStation ? { name: startStation.name, lon: startStation.longitude, lat: startStation.latitude } : { lon: 0, lat: 0 },
          endPoint: endStation ? { name: endStation.name, lon: endStation.longitude, lat: endStation.latitude } : { lon: 0, lat: 0 },
          waypoints: waypoints ? waypoints.map(wp => ({
            id: wp.id,
            name: wp.name,
            lon: wp.longitude,
            lat: wp.latitude
          })) : [],
          isConfigured: true
        })
      }
      
      // 处理成本参数
      const costUpdates: Record<string, number> = {}
      
      // 路径规划成本
      if (params.routeCosts && params.routeCosts.length > 0) {
        params.routeCosts.forEach((cost) => {
          switch (cost.name) {
            case '轻型海缆单价':
              costUpdates.lightCableCost = cost.price
              break
            case '重型海缆单价':
              costUpdates.heavyCableCost = cost.price
              break
            case '施工成本极大值':
              costUpdates.maxConstructionCost = cost.price
              break
            case '深浅分界值':
              costUpdates.depthThreshold = cost.price
              break
          }
        })
      }
      
      // 系统规划成本
      if (params.systemCosts && params.systemCosts.length > 0) {
        params.systemCosts.forEach((cost) => {
          switch (cost.name) {
            case '光缆成本':
              costUpdates.cableCostPerKm = cost.price
              break
            case '放大器成本':
              costUpdates.repeaterCost = cost.price
              break
            case '分支器成本':
              costUpdates.branchingUnitCost = cost.price
              break
            case '岸上站点成本':
              costUpdates.landingStationCost = cost.price
              break
            case '施工成本':
              costUpdates.installationCostPerKm = cost.price
              break
          }
        })
      }
      
      if (Object.keys(costUpdates).length > 0) {
        settingsStore.updateCostFactors(costUpdates)
      }
      
      // 处理器件库文件（解析并导入器件数据）
      if (params.devices && params.devices.length > 0) {
        const deviceFiles: string[] = []
        let totalFibers = 0, totalAmplifiers = 0, totalBranchingUnits = 0
        
        for (const device of params.devices) {
          deviceFiles.push(device.file || device.name)
          
          // 如果有解析后的数据，导入到 settingsStore
          if (device.parsedData) {
            const { fiberTypes, amplifierTypes, branchingUnitTypes } = device.parsedData
            
            if (fiberTypes && fiberTypes.length > 0) {
              fiberTypes.forEach((f: any) => settingsStore.addFiberType(f))
              totalFibers += fiberTypes.length
            }
            if (amplifierTypes && amplifierTypes.length > 0) {
              amplifierTypes.forEach((a: any) => settingsStore.addAmplifierType(a))
              totalAmplifiers += amplifierTypes.length
            }
            if (branchingUnitTypes && branchingUnitTypes.length > 0) {
              branchingUnitTypes.forEach((b: any) => settingsStore.addBranchingUnitType(b))
              totalBranchingUnits += branchingUnitTypes.length
            }
          }
        }
        
        settingsStore.setCurrentLibraryFile(deviceFiles.join(', '))
        
        if (totalFibers > 0 || totalAmplifiers > 0 || totalBranchingUnits > 0) {
          appStore.addLog('INFO', `导入器件库: 光纤${totalFibers}种，放大器${totalAmplifiers}种，分支器${totalBranchingUnits}种`)
        } else {
          appStore.addLog('INFO', `导入器件库文件: ${deviceFiles.join(', ')}`)
        }
      }

      // 如果是 USE 项目，初始化接线元表格
      if (projectType === 'use') {
        const connectorStore = useConnectorStore()
        // 无论是否有 RPL 文件，都创建空的接线元表格
        if (connectorStore.tables.length === 0) {
          connectorStore.createTable(projectName, 'route-main')
        }
      }
      
      // 如果是 USE 项目并且有 RPL 文件，导入 RPL 数据
      if (projectType === 'use' && rplFileData) {
        const rplStore = useRPLStore()
        const settingsStore = useSettingsStore()
        const routeStore = useRouteStore()
        const connectorStore = useConnectorStore()
        const monitorStore = useMonitorStore()
        
        try {
          const fileContent = await rplFileData.text()
          const tableName = rplFileData.name.replace(/\.(rpl|csv)$/i, '')
          const success = rplStore.importFromCSV(fileContent, tableName, 'route-main')
          
          if (success && rplStore.currentTable) {
            const records = rplStore.currentTable.records
            
            // 1. 从 RPL 数据中提取起点/终点坐标更新到工程设置
            const landingStations = records.filter(r => r.pointType === 'landing')
            if (landingStations.length >= 2) {
              settingsStore.updateRoutePlanningConfig({
                startPoint: { lon: landingStations[0].longitude, lat: landingStations[0].latitude },
                endPoint: { lon: landingStations[landingStations.length - 1].longitude, lat: landingStations[landingStations.length - 1].latitude },
                isConfigured: true,
              })
            } else if (records.length >= 2) {
              settingsStore.updateRoutePlanningConfig({
                startPoint: { lon: records[0].longitude, lat: records[0].latitude },
                endPoint: { lon: records[records.length - 1].longitude, lat: records[records.length - 1].latitude },
                isConfigured: true,
              })
            }
            
            // 2. 同步到 routeStore 以便地图显示
            const totalLength = records.length > 0 ? records[records.length - 1].cumulativeLength : 0
            const routePoints = records
              .filter(r => r.pointType !== 'waypoint')
              .map(r => ({
                id: r.id,
                coordinates: [r.longitude, r.latitude] as [number, number],
                type: r.pointType as 'landing' | 'branching' | 'repeater' | 'waypoint',
                name: r.remarks || undefined,
              }))
            
            const displayPoints = routePoints.length > 0 
              ? routePoints 
              : records.filter((_, i) => i % Math.max(1, Math.floor(records.length / 20)) === 0 || i === records.length - 1)
                  .map(r => ({
                    id: r.id,
                    coordinates: [r.longitude, r.latitude] as [number, number],
                    type: 'waypoint' as const,
                    name: undefined,
                  }))
            
            const routeSegments = displayPoints.slice(0, -1).map((point, i) => ({
              id: `seg-${i}`,
              startPointId: point.id,
              endPointId: displayPoints[i + 1].id,
              length: 0,
              depth: 0,
              cableType: 'LW',
              riskLevel: 'low' as const,
              cost: 0,
            }))
            
            const mainRoute = {
              id: 'route-main',
              name: projectName,
              points: displayPoints,
              segments: routeSegments,
              totalLength,
              totalCost: 0,
              riskScore: 0,
              cost: { cable: 0, installation: 0, equipment: 0, total: 0 },
              risk: { seismic: 0, volcanic: 0, depth: 0, overall: 0 },
              distance: totalLength,
              createdAt: new Date(),
              updatedAt: new Date(),
            }
            routeStore.setParetoRoutes([mainRoute as any])
            
            // 3. 同步到 connectorStore 以便系统设计视图显示
            if (connectorStore.tables.length === 0) {
              connectorStore.createTable(projectName, 'route-main')
            } else {
              connectorStore.currentTableId = connectorStore.tables[0].id
            }
            
            if (connectorStore.currentTable) {
              const newElements: any[] = []
              let deviceIndex = 0
              
              records.forEach((record) => {
                if (record.pointType !== 'waypoint') {
                  const connectorType = mapPointTypeToConnectorType(record.pointType)
                  newElements.push({
                    id: `device-${deviceIndex}`,
                    name: record.remarks || `${getDeviceTypeChinese(connectorType)}-${deviceIndex + 1}`,
                    type: connectorType,
                    longitude: record.longitude,
                    latitude: record.latitude,
                    depth: record.depth,
                    kp: record.kp || record.cumulativeLength,
                    status: 'active',
                    specifications: '',
                    remarks: record.remarks || '',
                  })
                  deviceIndex++
                }
              })
              
              // 生成光纤段
              for (let i = 0; i < newElements.length - 1; i++) {
                const fromElem = newElements[i]
                const toElem = newElements[i + 1]
                newElements.push({
                  id: `fiber-${i}`,
                  name: `光纤段 F${i + 1}`,
                  type: 'fiber',
                  kp: fromElem.kp,
                  endKp: toElem.kp,
                  longitude: 0,
                  latitude: 0,
                  depth: 0,
                  status: 'active',
                  specifications: '',
                  remarks: `${fromElem.name} → ${toElem.name}`,
                  fromDeviceId: fromElem.id,
                  toDeviceId: toElem.id,
                  length: Math.abs(toElem.kp - fromElem.kp),
                })
              }
              
              connectorStore.currentTable.elements = newElements
            }
            
            // 4. 同步到 monitorStore 以便实时监控视图显示
            const newDevices: any[] = []
            let deviceIdx = 0
            
            records.forEach((record) => {
              if (record.pointType !== 'waypoint') {
                const deviceType = mapPointTypeToConnectorType(record.pointType)
                newDevices.push({
                  id: `monitor-${deviceIdx}`,
                  name: record.remarks || `${getDeviceTypeChinese(deviceType)}-${deviceIdx + 1}`,
                  type: deviceType,
                  neType: deviceType,
                  status: 'normal',
                  location: `KP ${(record.kp || record.cumulativeLength).toFixed(1)}`,
                  kp: record.kp || record.cumulativeLength,
                  sldEquipmentName: record.remarks || `${getDeviceTypeChinese(deviceType)}-${deviceIdx + 1}`,
                  longitude: record.longitude,
                  latitude: record.latitude,
                  depth: record.depth,
                  inputPower: -15 + Math.random() * 5,
                  outputPower: -10 + Math.random() * 5,
                  pumpCurrent: 200 + Math.random() * 50,
                  pfeVoltage: 48,
                  pfeCurrent: 1.2 + Math.random() * 0.3,
                  temperature: 4 + Math.random() * 2,
                })
                deviceIdx++
              }
            })
            
            // 设备数据通过 connectorStore 管理，monitorStore.devices 是 computed 属性
            if (connectorStore.currentTable) {
              // 将设备数据转换为 connectorStore 格式
              const connectorElements = newDevices.map((d: any) => ({
                id: d.id,
                name: d.name,
                type: d.type,
                longitude: d.longitude,
                latitude: d.latitude,
                depth: d.depth,
                kp: d.kp,
                status: 'active' as const,
                specifications: '',
                remarks: d.name,
              }))
              connectorStore.currentTable.elements = connectorElements
            }
            
            appStore.addLog('INFO', `导入 RPL 文件: ${rplFileData.name}, ${records.length} 条记录, ${newDevices.length} 个设备`)
          }
        } catch (e) {
          console.error('RPL 文件导入失败:', e)
          appStore.showNotification({
            type: 'warning',
            message: 'RPL 文件导入失败，项目已创建但无路由数据',
          })
        }
      }
      
      // 辅助函数: 映射点位类型到接线元类型
      function mapPointTypeToConnectorType(pointType: string): string {
        const map: Record<string, string> = {
          'landing': 'landing',
          'repeater': 'amplifier_e',
          'branching': 'bu',
        }
        return map[pointType] || 'underwater'
      }
      
      // 辅助函数: 获取器件类型中文名称
      function getDeviceTypeChinese(deviceType: string): string {
        const map: Record<string, string> = {
          'landing': '岸上站点',
          'amplifier_e': '放大器',
          'bu': '水下分支器',
          'underwater': '水下站点',
        }
        return map[deviceType] || deviceType
      }

      // 初始化项目数据
      projectDataStore.setupDataLinks()
      projectDataStore.markDataLoaded()

      appStore.addLog('INFO', `新建项目: ${projectName} (${projectType})`)
      appStore.showNotification({
        type: 'success',
        message: `项目已创建：${projectName}`,
      })

      return true
    } catch (error) {
      appStore.showNotification({
        type: 'error',
        message: '创建项目失败',
      })
      return false
    } finally {
      isProcessing.value = false
    }
  }
  
  return {
    // 状态
    openState,
    showSaveAsDialog,
    isProcessing,
    
    // 计算属性
    hasOpenProject,
    currentProjectName,
    currentProjectType,
    isDirty,
    
    // 方法
    openProject,
    handleSavePromptChoice,
    saveProject,
    openSaveAsDialog,
    saveProjectAs,
    closeProject,
    canSafelyClose,
    markDirty,
    createProject,
  }
}
