/**
 * SLD文件导出服务
 * 按行业标准格式导出 System Line Diagram 文件
 * 支持 XML 格式，符合海缆系统SLD数据交换格式标准 9.2版本
 */

import type { 
  SLDTable, 
  SLDGlobalInfo,
} from '@/types'
import {
  buildSldEquipmentConfigParams,
} from '@/services/sldDeviceRegistry'

// ========== XML工具函数 ==========

/**
 * XML转义处理
 */
function escapeXml(str: string | number | boolean | undefined | null): string {
  if (str === undefined || str === null) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * 生成缩进
 */
function indent(level: number): string {
  return '    '.repeat(level)
}
// ========== 网元类型映射 (9.2标准) ==========

// 内部类型到SLD 9.2标准Element_Type的映射
const ELEMENT_TYPE_MAP: Record<string, string> = {
  'TE': 'LandingStation',
  'PFE': 'LandingStation',
  'REP': 'Repeater',
  'BU': 'BU',
  'EQ': 'Equalizer',
  'JOINT': 'Joint',
  'OADM': 'OADM'
}

// 光纤段对应的Element_Type
const CABLE_SPAN_TYPE = 'CableSpan'

// ========== XML导出函数 ==========

/**
 * 生成设备配置参数XML (9.2格式使用 Config_Params 和 key 属性)
 */
function generateConfigParamsXML(params: Record<string, string | number | boolean> | undefined, level: number): string {
  if (!params || Object.keys(params).length === 0) return ''
  
  let xml = `${indent(level)}<Config_Params>\n`
  Object.entries(params).forEach(([key, value]) => {
    xml += `${indent(level + 1)}<Param key="${escapeXml(key)}" value="${escapeXml(value)}" />\n`
  })
  xml += `${indent(level)}</Config_Params>\n`
  return xml
}

/**
 * 生成单个设备的XML (9.2格式: Element)
 */
function generateElementXML(
  sequenceId: number,
  elementType: string,
  routeKM: number,
  systemKM: number,
  upstreamId: string | number | null,
  downstreamId: string | number | null,
  branchId: string | number | null,
  configParams: Record<string, string | number | boolean>,
  level: number
): string {
  let xml = `${indent(level)}<Element>\n`
  xml += `${indent(level + 1)}<Sequence_ID>${sequenceId}</Sequence_ID>\n`
  xml += `${indent(level + 1)}<Element_Type>${escapeXml(elementType)}</Element_Type>\n`
  xml += `${indent(level + 1)}<Location>\n`
  xml += `${indent(level + 2)}<Route_KM>${routeKM.toFixed(3)}</Route_KM>\n`
  xml += `${indent(level + 2)}<System_KM>${systemKM.toFixed(3)}</System_KM>\n`
  xml += `${indent(level + 1)}</Location>\n`
  
  // 连接关系 (9.2格式使用 Connection_Info)
  xml += `${indent(level + 1)}<Connection_Info>\n`
  xml += `${indent(level + 2)}<Upstream_ID>${upstreamId === null ? 'NULL' : upstreamId}</Upstream_ID>\n`
  xml += `${indent(level + 2)}<Downstream_ID>${downstreamId === null ? 'NULL' : downstreamId}</Downstream_ID>\n`
  if (branchId !== null) {
    xml += `${indent(level + 2)}<Branch_ID>${branchId}</Branch_ID>\n`
  }
  xml += `${indent(level + 1)}</Connection_Info>\n`
  
  // 配置参数
  xml += generateConfigParamsXML(configParams, level + 1)
  
  xml += `${indent(level)}</Element>\n`
  return xml
}

/**
 * 生成全局信息XML (9.2格式)
 */
function generateGlobalInfoXML(info: SLDGlobalInfo, level: number): string {
  let xml = `${indent(level)}<GlobalInfo>\n`
  xml += `${indent(level + 1)}<SystemName>${escapeXml(info.systemName)}</SystemName>\n`
  xml += `${indent(level + 1)}<TotalSystemLengthKM>${info.totalLength.toFixed(3)}</TotalSystemLengthKM>\n`
  // 使用登陆点作为起始站和终止站
  if (info.landingPoints.length >= 1) {
    xml += `${indent(level + 1)}<StartStation>${escapeXml(info.landingPoints[0])}</StartStation>\n`
  }
  if (info.landingPoints.length >= 2) {
    xml += `${indent(level + 1)}<EndStation>${escapeXml(info.landingPoints[info.landingPoints.length - 1])}</EndStation>\n`
  }
  xml += `${indent(level)}</GlobalInfo>\n`
  return xml
}

/**
 * 导出SLD表格为9.2标准XML格式
 * @param table SLD表格数据
 * @param globalInfo 可选的全局信息
 * @returns XML字符串
 */
export function exportToXML(table: SLDTable, globalInfo?: Partial<SLDGlobalInfo>): string {
  // 构建完整的全局信息
  const terminals = table.equipments.filter(e => e.type === 'TE' || e.type === 'PFE')
  const landingPoints = terminals.map(t => t.name)
  
  const fullGlobalInfo: SLDGlobalInfo = {
    systemName: globalInfo?.systemName || table.name,
    systemCode: globalInfo?.systemCode || table.id,
    designCapacity: globalInfo?.designCapacity || `${table.transmissionParams.designCapacity} Tbps`,
    totalLength: globalInfo?.totalLength || table.metadata.totalLength,
    fiberPairs: globalInfo?.fiberPairs || table.metadata.totalFiberPairs,
    landingPoints: globalInfo?.landingPoints || landingPoints,
    createdDate: globalInfo?.createdDate || table.createdAt.toISOString(),
    lastModified: globalInfo?.lastModified || table.updatedAt.toISOString(),
    version: globalInfo?.version || table.metadata.exportTemplateVersion || '1.0',
    author: globalInfo?.author || 'System',
    description: globalInfo?.description
  }

  // 格式化日期为 YYYY-MM-DD
  const dateStr = new Date().toISOString().slice(0, 10)

  // 9.2标准格式: SystemLineDiagram 根元素
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`
  xml += `<!-- 海缆系统 SLD (System Line Diagram) 数据交换格式标准 9.2 -->\n`
  xml += `<SystemLineDiagram project="${escapeXml(fullGlobalInfo.systemName)}" version="${escapeXml(fullGlobalInfo.version)}" date="${dateStr}">\n\n`
  
  // 全局链路基础信息
  xml += `${indent(1)}<!-- 全局链路基础信息 -->\n`
  xml += generateGlobalInfoXML(fullGlobalInfo, 1)
  xml += `\n`
  
  // 网元设备列表 (按物理连接顺序排列，交织设备和光缆段)
  xml += `${indent(1)}<!-- 网元设备列表 (按物理连接顺序排列) -->\n`
  xml += `${indent(1)}<Elements>\n`
  
  // 构建交织的元素列表：设备和光缆段按顺序排列
  let globalSequence = 1
  const sortedEquipments = [...table.equipments].sort((a, b) => a.sequence - b.sequence)
  
  for (let i = 0; i < sortedEquipments.length; i++) {
    const equipment = sortedEquipments[i]
    const elementType = ELEMENT_TYPE_MAP[equipment.type] || equipment.type
    
    // 确定上下游连接
    const upstreamId = i === 0 ? null : globalSequence - 1
    // 查找关联的光纤段
    const outgoingSegment = table.fiberSegments.find(s => s.fromEquipmentId === equipment.id)
    const hasDownstream = i < sortedEquipments.length - 1 || outgoingSegment
    
    // 构建配置参数
    const configParams = buildSldEquipmentConfigParams(equipment)
    
    // 添加设备特定参数
    // 生成设备Element
    const downstreamId = hasDownstream ? globalSequence + 1 : null
    const branchIdVal = equipment.branchId ? equipment.branchId : null
    
    xml += `${indent(2)}<!-- ${globalSequence}. ${equipment.name} (${elementType}) -->\n`
    xml += generateElementXML(
      globalSequence,
      elementType,
      equipment.routeKM ?? equipment.kp,
      equipment.systemKM ?? equipment.kp,
      upstreamId,
      downstreamId,
      branchIdVal,
      configParams,
      2
    )
    globalSequence++
    
    // 如果有出向光纤段，添加CableSpan元素
    if (outgoingSegment && i < sortedEquipments.length - 1) {
      const nextEquipment = sortedEquipments[i + 1]
      const cableConfigParams: Record<string, any> = {
        'LossCoeff': outgoingSegment.attenuation.toFixed(3),
        'Length': outgoingSegment.length.toFixed(3),
        'FiberPairs': outgoingSegment.fiberPairs
      }
      if (outgoingSegment.cableType) {
        cableConfigParams['CableType'] = outgoingSegment.cableType
      }
      if (outgoingSegment.totalLoss !== undefined) {
        cableConfigParams['TotalLoss'] = outgoingSegment.totalLoss
      }
      if (outgoingSegment.remarks) {
        cableConfigParams['Remarks'] = outgoingSegment.remarks
      }
      
      xml += `${indent(2)}<!-- ${globalSequence}. 海缆段 (${equipment.name} → ${nextEquipment.name}) -->\n`
      xml += generateElementXML(
        globalSequence,
        CABLE_SPAN_TYPE,
        nextEquipment.routeKM ?? nextEquipment.kp,
        nextEquipment.systemKM ?? nextEquipment.kp,
        globalSequence - 1,
        globalSequence + 1,
        null,
        cableConfigParams,
        2
      )
      globalSequence++
    }
  }
  
  xml += `${indent(1)}</Elements>\n`
  
  xml += `</SystemLineDiagram>\n`
  
  return xml
}

/**
 * 触发文件下载
 */
function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * 导出SLD文件主函数
 */
export function exportSLDFile(table: SLDTable, globalInfo?: Partial<SLDGlobalInfo>) {
  const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const version = (globalInfo?.version || table.metadata.exportTemplateVersion || '1.0')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
  const baseName = `SLD_${table.name.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_')}_${version}_${timestamp}`
  
  const content = exportToXML(table, globalInfo)
  downloadFile(content, `${baseName}.xml`, 'application/xml;charset=utf-8')
}
