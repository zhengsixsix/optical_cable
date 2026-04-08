/**
 * 放大器落位与管理 Composable
 * 从 DesignView 提取的放大器配置、拖拽、光纤段生成逻辑
 */

import { ref, type Ref } from 'vue'
import { useSettingsStore, useAppStore, useConnectorStore, useRPLStore, useMonitorStore, useRouteStore } from '@/stores'
import { repeaterPlacementService } from '@/services'
import { getAmplifierParamsFromLibrary } from '@/services/DeviceParamsService'
import { calculateRouteTrunkLengthKm } from '@/utils/routeLength'
import { getRoutePositionAtKP } from '@/utils/routePosition'

export function useAmplifierPlacement(deps: {
  repeaterSpacing: Ref<number>
  gsnrData: Ref<Array<{ kp: number; gsnr: number; margin: number; repeaterIndex?: number }>>
  calculateGSNRData: () => Array<{ kp: number; gsnr: number; margin: number; repeaterIndex?: number }>
  centerViewMode: Ref<'map' | 'gsnr' | 'span'>
}) {
  const settingsStore = useSettingsStore()
  const appStore = useAppStore()
  const connectorStore = useConnectorStore()
  const rplStore = useRPLStore()
  const monitorStore = useMonitorStore()
  const routeStore = useRouteStore()

  // 自动落位结果
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const autoPlacementResult = ref<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const placementRoutePoints = ref<any[]>([])

  // 放大器配置数据
  const savedRepeaterConfigs = ref<Array<{
    id: string
    kp: number
    name: string
    gain: number
    noiseFigure?: number
    model?: string
    spacing?: number
    powerConsumption?: number
    type?: string
  }>>([])

  // 生成光纤段数据（连接相邻节点）
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const generateFiberSpans = (sortedRepeaters: Record<string, any>[]) => {
    const existingFibers = connectorStore.elements.filter(e => e.type === 'fiber')
    existingFibers.forEach(f => connectorStore.deleteElement(f.id))

    const fiberTypes = settingsStore.fiberTypes || []
    const defaultFiber = fiberTypes[0]
    const fiberName = defaultFiber?.name || '光纤'
    const fiberCategory = defaultFiber?.fiberCategory || 'G.654.E'

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mainTrunkNodes = connectorStore.elements
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter(e => e.type !== 'fiber' && !(e as any).isBranchStation)
      .sort((a, b) => a.kp - b.kp)

    for (let i = 0; i < mainTrunkNodes.length - 1; i++) {
      const startNode = mainTrunkNodes[i]
      const endNode = mainTrunkNodes[i + 1]
      const length = endNode.kp - startNode.kp

      connectorStore.addElement({
        type: 'fiber',
        name: `${fiberName}-${String(i + 1).padStart(2, '0')}`,
        kp: startNode.kp,
        endKp: endNode.kp,
        fromDeviceId: startNode.id,
        toDeviceId: endNode.id,
        longitude: (startNode.longitude + endNode.longitude) / 2,
        latitude: (startNode.latitude + endNode.latitude) / 2,
        depth: (startNode.depth + endNode.depth) / 2,
        status: 'active',
        specifications: `${fiberCategory} ${length.toFixed(1)}km`,
        remarks: `${startNode.name} → ${endNode.name}`,
      })
    }
  }

  // 处理放大器配置保存
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleRepeatersSaved = (repeaters: Record<string, any>[]) => {
    const defaultAmpParams = getAmplifierParamsFromLibrary()

    savedRepeaterConfigs.value = repeaters.map(r => ({
      id: r.id,
      kp: r.kp,
      name: r.name,
      gain: r.gain || defaultAmpParams.gain,
      noiseFigure: r.noiseFigure || defaultAmpParams.noiseFigure,
      model: r.model,
      spacing: r.spacing,
      powerConsumption: r.powerConsumption,
      type: r.type,
    }))

    const sortedRepeaters = [...repeaters].sort((a, b) => a.kp - b.kp)

    // 删除现有放大器
    const existingAmplifiers = connectorStore.elements.filter(
      e => e.type === 'amplifier_e' || e.type === 'amplifier_w' || e.type === 'ola',
    )
    existingAmplifiers.forEach(amp => {
      connectorStore.deleteElement(amp.id, false)
    })

    // 添加新放大器到 connectorStore
    sortedRepeaters.forEach(rep => {
      const ampType = rep.type || 'amplifier_e'
      connectorStore.addElement({
        type: ampType,
        name: rep.name,
        kp: rep.kp,
        longitude: rep.longitude,
        latitude: rep.latitude,
        depth: rep.depth || 3000,
        status: 'active',
        specifications: rep.model || 'EREP-C+L',
        remarks: rep.remarks || '',
      }, false)
    })

    // 初始化运行时数据
    sortedRepeaters.forEach(rep => {
      const addedElement = connectorStore.elements.find(
        e => e.name === rep.name && Math.abs(e.kp - rep.kp) < 0.01,
      )
      if (addedElement) {
        monitorStore.updateDevice(addedElement.id, {
          status: 'normal',
          inputPower: -15,
          outputPower: 1,
          pumpCurrent: 200,
          pfeVoltage: 48,
          pfeCurrent: 1.5,
          temperature: 25,
        })
      }
    })

    generateFiberSpans(sortedRepeaters)

    if (deps.gsnrData.value.length > 0) {
      deps.gsnrData.value = deps.calculateGSNRData()
    }

    appStore.showNotification({ type: 'success', message: `已保存 ${repeaters.length} 个放大器配置` })
    appStore.addLog('INFO', `放大器配置已更新: ${repeaters.length} 个放大器`)
  }

  // 处理地图拖拽放大器
  const handleAmplifierMoved = (data: { id: string; newKp: number; longitude: number; latitude: number }) => {
    const success = connectorStore.updateElement(data.id, {
      kp: data.newKp,
      longitude: data.longitude,
      latitude: data.latitude,
    })

    if (!success) {
      appStore.showNotification({ type: 'warning', message: '未找到对应放大器，无法更新' })
      return
    }

    const cfgIdx = savedRepeaterConfigs.value.findIndex(r => r.id === data.id)
    if (cfgIdx >= 0) {
      savedRepeaterConfigs.value[cfgIdx].kp = data.newKp
    }

    if (autoPlacementResult.value) {
      autoPlacementResult.value = {
        ...autoPlacementResult.value,
        positions: connectorStore.elements
          .filter(e => e.type === 'amplifier_e' || e.type === 'amplifier_w' || e.type === 'ola')
          .map(e => ({ kp: e.kp, longitude: e.longitude, latitude: e.latitude })),
      }
    }

    if (deps.gsnrData.value.length > 0) {
      deps.gsnrData.value = deps.calculateGSNRData()
    }

    // 检测跨段过长风险
    const allAmps = connectorStore.elements
      .filter(e => e.type === 'amplifier_e' || e.type === 'amplifier_w' || e.type === 'ola')
      .sort((a, b) => a.kp - b.kp)
    const totalLength = calculateRouteTrunkLengthKm(routeStore.selectedRoute) || (rplStore.currentTable?.metadata?.totalLength ?? 0)
    let maxSpacing = 0
    let prevKp = 0
    for (const amp of allAmps) {
      const spacing = amp.kp - prevKp
      if (spacing > maxSpacing) maxSpacing = spacing
      prevKp = amp.kp
    }
    if (allAmps.length > 0) {
      const lastSpacing = totalLength - allAmps[allAmps.length - 1].kp
      if (lastSpacing > maxSpacing) maxSpacing = lastSpacing
    }

    const device = connectorStore.elements.find(e => e.id === data.id)
    const deviceName = device?.name || data.id

    if (maxSpacing > 100) {
      appStore.showNotification({
        type: 'warning',
        message: `${deviceName} 已移至 KP ${data.newKp.toFixed(1)}km。⚠️ 最大跨段 ${maxSpacing.toFixed(1)}km 超过 100km，可能导致增益超限！`,
      })
    } else {
      appStore.showNotification({
        type: 'success',
        message: `${deviceName} 已移至 KP ${data.newKp.toFixed(1)}km`,
      })
    }

    appStore.addLog('INFO', `Step 6.2 地图拖拽调整: ${deviceName} → KP ${data.newKp.toFixed(1)}km`)
  }

  // 应用推荐配置
  const handleApplyRecommendation = (spanKm: number) => {
    deps.repeaterSpacing.value = spanKm

    const currentRoute = routeStore.selectedRoute
    const totalLength = calculateRouteTrunkLengthKm(currentRoute) || (rplStore.currentTable?.metadata?.totalLength ?? 0)
    const routePointsList = placementRoutePoints.value.length > 0
      ? placementRoutePoints.value
      : (currentRoute?.points || [])
    autoPlacementResult.value = repeaterPlacementService.generateEDFAPlacement(
      totalLength,
      spanKm,
      routePointsList,
    )
    placementRoutePoints.value = routePointsList

    if (autoPlacementResult.value && autoPlacementResult.value.positions.length > 0) {
      if (!connectorStore.currentTable) {
        connectorStore.createTable(`${currentRoute?.name || '链路'}_接线元`, currentRoute?.id)
      }

      connectorStore.deleteElementsByType(['ola', 'amplifier_e', 'amplifier_w', 'fiber'])
      const routeForDepth = currentRoute
        ? { ...currentRoute, points: routePointsList }
        : null
      const rplRecords = rplStore.currentTable?.records || []

      autoPlacementResult.value.positions.forEach(
        (pos: { kp: number; longitude: number; latitude: number; depth: number; isBranch?: boolean }, index: number) => {
          const position = getRoutePositionAtKP(pos.kp, routeForDepth, {
            configuredTotalLength: totalLength,
            rplRecords,
          })
          connectorStore.addElement({
            type: index % 2 === 0 ? 'amplifier_e' : 'amplifier_w',
            name: `AMP-${String(index + 1).padStart(2, '0')}`,
            kp: pos.kp,
            longitude: pos.longitude,
            latitude: pos.latitude,
            depth: pos.depth ?? position.depth,
            status: 'active',
            specifications: `Span ${spanKm}km`,
            remarks: pos.isBranch ? '分支放大器' : 'EDFA',
          }, false)
        },
      )

      generateFiberSpans(autoPlacementResult.value.positions)
    }

    deps.centerViewMode.value = 'map'

    appStore.showNotification({
      type: 'success',
      message: `已应用推荐 Span 长度: ${spanKm} km，放大器数量: ${autoPlacementResult.value?.count || 0}`,
    })
  }

  return {
    autoPlacementResult,
    placementRoutePoints,
    savedRepeaterConfigs,
    generateFiberSpans,
    handleRepeatersSaved,
    handleAmplifierMoved,
    handleApplyRecommendation,
  }
}
