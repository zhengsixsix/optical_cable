/**
 * 验证服务
 * 提供业务流程中关键操作的数据验证
 */

import { useRPLStore, useSLDStore, useConnectorStore, useRouteStore, useAppStore } from '@/stores'
import type { ProjectPhase } from '@/stores'

// 验证结果
export interface ValidationResult {
  valid: boolean
  errors: ValidationError[]
  warnings: ValidationWarning[]
}

export interface ValidationError {
  code: string
  field?: string
  message: string
}

export interface ValidationWarning {
  code: string
  field?: string
  message: string
}

// 验证规则类型
export type ValidationRule = () => ValidationResult

/**
 * 验证路由数据是否完整
 */
export function validateRouteData(): ValidationResult {
  const routeStore = useRouteStore()
  const errors: ValidationError[] = []
  const warnings: ValidationWarning[] = []
  
  const route = routeStore.currentRoute || routeStore.paretoRoutes[0]
  
  if (!route) {
    errors.push({
      code: 'ROUTE_MISSING',
      message: '没有可用的路由数据',
    })
    return { valid: false, errors, warnings }
  }
  
  if (!route.points || route.points.length < 2) {
    errors.push({
      code: 'ROUTE_POINTS_INSUFFICIENT',
      message: '路由点数量不足，至少需要2个点',
    })
  }
  
  // 检查起终点是否是登陆站
  const landingPoints = route.points?.filter(p => p.type === 'landing') || []
  if (landingPoints.length < 2) {
    warnings.push({
      code: 'LANDING_POINTS_MISSING',
      message: '路由缺少登陆站定义',
    })
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}

/**
 * 验证 RPL 数据是否完整
 */
export function validateRPLData(): ValidationResult {
  const rplStore = useRPLStore()
  const errors: ValidationError[] = []
  const warnings: ValidationWarning[] = []
  
  if (!rplStore.currentTable) {
    errors.push({
      code: 'RPL_TABLE_MISSING',
      message: '没有可用的 RPL 表格',
    })
    return { valid: false, errors, warnings }
  }
  
  const records = rplStore.currentTable.records
  
  if (records.length === 0) {
    errors.push({
      code: 'RPL_RECORDS_EMPTY',
      message: 'RPL 表格没有记录',
    })
    return { valid: false, errors, warnings }
  }
  
  // 检查是否有登陆点
  const landingRecords = records.filter(r => r.pointType === 'landing')
  if (landingRecords.length < 2) {
    warnings.push({
      code: 'RPL_LANDING_INSUFFICIENT',
      message: 'RPL 登陆点数量不足',
    })
  }
  
  // 检查 KP 是否递增
  let lastKp = -Infinity
  for (const record of records) {
    if (record.kp < lastKp) {
      warnings.push({
        code: 'RPL_KP_NOT_ASCENDING',
        field: record.id,
        message: `KP 值 ${record.kp} 小于前一条记录`,
      })
    }
    lastKp = record.kp
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}

/**
 * 验证 SLD 数据是否完整
 */
export function validateSLDData(): ValidationResult {
  const sldStore = useSLDStore()
  const errors: ValidationError[] = []
  const warnings: ValidationWarning[] = []
  
  if (!sldStore.currentTable) {
    errors.push({
      code: 'SLD_TABLE_MISSING',
      message: '没有可用的 SLD 表格',
    })
    return { valid: false, errors, warnings }
  }
  
  const { equipments, fiberSegments } = sldStore.currentTable
  
  if (equipments.length === 0) {
    errors.push({
      code: 'SLD_EQUIPMENTS_EMPTY',
      message: 'SLD 设备列表为空',
    })
  }
  
  // 检查设备连接关系
  for (const equipment of equipments) {
    if (!equipment.upstreamId && !equipment.downstreamId && equipment.type !== 'TE') {
      warnings.push({
        code: 'SLD_EQUIPMENT_ISOLATED',
        field: equipment.id,
        message: `设备 ${equipment.name} 没有上下游连接`,
      })
    }
  }
  
  // 检查光纤段完整性
  for (const segment of fiberSegments) {
    const fromExists = equipments.some(e => e.id === segment.fromEquipmentId)
    const toExists = equipments.some(e => e.id === segment.toEquipmentId)
    
    if (!fromExists || !toExists) {
      errors.push({
        code: 'SLD_SEGMENT_BROKEN',
        field: segment.id,
        message: `光纤段 ${segment.id} 引用了不存在的设备`,
      })
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}

/**
 * 验证接线元数据是否完整
 */
export function validateConnectorData(): ValidationResult {
  const connectorStore = useConnectorStore()
  const errors: ValidationError[] = []
  const warnings: ValidationWarning[] = []
  
  if (!connectorStore.currentTable) {
    errors.push({
      code: 'CONNECTOR_TABLE_MISSING',
      message: '没有可用的接线元表格',
    })
    return { valid: false, errors, warnings }
  }
  
  const elements = connectorStore.currentTable.elements
  
  // 检查光纤段连接
  const fiberElements = elements.filter(e => e.type === 'fiber')
  for (const fiber of fiberElements) {
    if (!fiber.fromDeviceId || !fiber.toDeviceId) {
      warnings.push({
        code: 'CONNECTOR_FIBER_INCOMPLETE',
        field: fiber.id,
        message: `光纤段 ${fiber.name} 缺少起止设备引用`,
      })
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}

/**
 * 验证阶段切换前提条件
 */
export function validatePhaseTransition(fromPhase: ProjectPhase, toPhase: ProjectPhase): ValidationResult {
  const errors: ValidationError[] = []
  const warnings: ValidationWarning[] = []
  
  // 定义阶段切换的前提条件
  const phasePrerequisites: Record<ProjectPhase, () => ValidationResult> = {
    'route-planning': () => ({ valid: true, errors: [], warnings: [] }),
    'transmission-planning': validateRouteData,
    'detailed-design': () => {
      const rplResult = validateRPLData()
      const sldResult = validateSLDData()
      return {
        valid: rplResult.valid && sldResult.valid,
        errors: [...rplResult.errors, ...sldResult.errors],
        warnings: [...rplResult.warnings, ...sldResult.warnings],
      }
    },
    'monitoring': () => {
      const connResult = validateConnectorData()
      return connResult
    },
  }
  
  const validator = phasePrerequisites[toPhase]
  if (validator) {
    return validator()
  }
  
  return { valid: true, errors, warnings }
}

/**
 * 显示验证结果
 */
export function showValidationResult(result: ValidationResult): void {
  const appStore = useAppStore()
  
  if (!result.valid) {
    result.errors.forEach(error => {
      appStore.showNotification({
        type: 'error',
        message: error.message,
        duration: 5000,
      })
    })
  }
  
  result.warnings.forEach(warning => {
    appStore.showNotification({
      type: 'warning',
      message: warning.message,
      duration: 4000,
    })
  })
}

/**
 * 验证并执行操作
 */
export async function validateAndExecute<T>(
  validator: () => ValidationResult,
  action: () => T | Promise<T>,
  options?: { showWarnings?: boolean }
): Promise<{ success: boolean; result?: T; validation: ValidationResult }> {
  const validation = validator()
  
  if (!validation.valid) {
    showValidationResult(validation)
    return { success: false, validation }
  }
  
  if (options?.showWarnings && validation.warnings.length > 0) {
    showValidationResult({ ...validation, errors: [] })
  }
  
  const result = await action()
  return { success: true, result, validation }
}

export const validationService = {
  validateRouteData,
  validateRPLData,
  validateSLDData,
  validateConnectorData,
  validatePhaseTransition,
  showValidationResult,
  validateAndExecute,
}
