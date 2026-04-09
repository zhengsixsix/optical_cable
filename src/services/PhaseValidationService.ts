/**
 * 阶段完成度校验服务
 * 检查各工作阶段的数据完整性，供 UI 提示和导出前校验使用
 */

import { useAppStore } from '@/stores/app'
import { useConnectorStore } from '@/stores/connector'
import { useRouteStore } from '@/stores/route'
import { useRPLStore } from '@/stores/rpl'

export interface PhaseValidationItem {
  key: string
  label: string
  passed: boolean
  message: string
}

export interface PhaseStatus {
  phase: string
  label: string
  completed: boolean
  items: PhaseValidationItem[]
}

export interface ExportValidationResult {
  canExport: boolean
  warnings: string[]
  errors: string[]
}

/**
 * 校验路由规划阶段
 * 要求：至少一条有效路由，包含 ≥2 个 landing 点
 */
export function validateRoutePlanning(): PhaseStatus {
  const routeStore = useRouteStore()
  const items: PhaseValidationItem[] = []

  // 检查是否有路由
  const allRoutes = routeStore.paretoRoutes.length > 0 ? routeStore.paretoRoutes : routeStore.routes
  const hasRoute = allRoutes.length > 0
  items.push({
    key: 'has-route',
    label: '路由数据',
    passed: hasRoute,
    message: hasRoute ? `${allRoutes.length} 条路由` : '无路由数据，请先进行路由规划',
  })

  // 检查路由是否包含登陆站
  const selectedRoute = routeStore.selectedRoute || allRoutes[0]
  const landingCount = selectedRoute?.points?.filter(
    (p: { type: string }) => p.type === 'landing'
  ).length ?? 0
  const hasLandings = landingCount >= 2
  items.push({
    key: 'has-landings',
    label: '登陆站',
    passed: hasLandings,
    message: hasLandings ? `${landingCount} 个登陆站` : '路由至少需要 2 个登陆站',
  })

  return {
    phase: 'route-planning',
    label: '路由规划',
    completed: items.every(i => i.passed),
    items,
  }
}

/**
 * 校验传输系统规划阶段
 * 要求：RPL 数据、接线元中有放大器配置
 */
export function validateTransmissionPlanning(): PhaseStatus {
  const rplStore = useRPLStore()
  const connectorStore = useConnectorStore()
  const items: PhaseValidationItem[] = []

  // 检查 RPL 数据
  const hasRPL = rplStore.tables.length > 0 &&
    rplStore.tables.some(t => t.records && t.records.length > 0)
  const rplRecordCount = rplStore.currentTable?.records?.length ?? 0
  items.push({
    key: 'has-rpl',
    label: 'RPL 路由表',
    passed: hasRPL,
    message: hasRPL ? `${rplRecordCount} 条记录` : '缺少 RPL 数据',
  })

  // 检查放大器配置
  const amplifiers = connectorStore.elements.filter(
    e => e.type === 'amplifier_e' || e.type === 'amplifier_w' || e.type === 'ola'
  )
  const hasAmplifiers = amplifiers.length > 0
  items.push({
    key: 'has-amplifiers',
    label: '放大器配置',
    passed: hasAmplifiers,
    message: hasAmplifiers ? `${amplifiers.length} 个放大器` : '未配置放大器',
  })

  // 检查接线元数据
  const hasConnectors = connectorStore.elements.length > 0
  items.push({
    key: 'has-connectors',
    label: '接线元数据',
    passed: hasConnectors,
    message: hasConnectors ? `${connectorStore.elements.length} 个设备` : '无接线元数据',
  })

  return {
    phase: 'transmission-planning',
    label: '传输系统规划',
    completed: items.every(i => i.passed),
    items,
  }
}

/**
 * 获取所有阶段的完成状态
 */
export function getPhaseStatus(): PhaseStatus[] {
  return [
    validateRoutePlanning(),
    validateTransmissionPlanning(),
  ]
}

/**
 * 导出前校验 — 检查导出的 USE 文件能否被自身导入
 * 返回 warnings（允许导出但提示）和 errors（阻止导出）
 */
export function validateForExport(): ExportValidationResult {
  const warnings: string[] = []
  const errors: string[] = []

  const appStore = useAppStore()
  
  // 检查项目是否存在
  if (!appStore.hasOpenProject) {
    errors.push('当前没有打开的项目')
  }

  const routePhase = validateRoutePlanning()
  const transmissionPhase = validateTransmissionPlanning()

  // 路由数据是必需的（导入时会校验）
  if (!routePhase.items.find(i => i.key === 'has-route')?.passed) {
    errors.push('缺少路由数据，导出的文件将无法被导入')
  }
  if (!routePhase.items.find(i => i.key === 'has-landings')?.passed) {
    warnings.push('路由缺少登陆站，导入时可能报错')
  }

  // 传输规划数据非必需但给警告
  if (!transmissionPhase.items.find(i => i.key === 'has-rpl')?.passed) {
    warnings.push('缺少 RPL 数据，导出文件数据不完整')
  }
  if (!transmissionPhase.items.find(i => i.key === 'has-amplifiers')?.passed) {
    warnings.push('未配置放大器，系统设计数据不完整')
  }

  return {
    canExport: errors.length === 0,
    warnings,
    errors,
  }
}
