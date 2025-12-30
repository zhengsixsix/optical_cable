/**
 * SLD文件导出服务
 * 按行业标准格式导出 System Line Diagram 文件
 * 支持 XML 格式，符合海缆系统SLD数据交换格式标准 9.2版本
 */

import type { 
  SLDTable, 
  SLDEquipment, 
  SLDFiberSegment,
  SLDTransmissionParams,
  SLDGlobalInfo 
} from '@/types'

// ========== XML工具函数 ==========

/**
 * XML转义处理
 */
export function escapeXml(str: string | number | boolean | undefined | null): string {
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
  'JOINT': 'Joint',
  'OADM': 'OADM'
}

// 光纤段对应的Element_Type
const CABLE_SPAN_TYPE = 'CableSpan'

// 设备类型全名映射 (用于旧格式兼容)
const EQUIPMENT_TYPE_FULL_NAME: Record<string, string> = {
  'TE': 'Terminal Equipment',
  'PFE': 'Power Feeding Equipment',
  'REP': 'Repeater',
  'BU': 'Branching Unit',
  'JOINT': 'Joint',
  'OADM': 'OADM'
}

// ========== XML导出函数 ==========

/**
 * 生成设备配置参数XML (9.2格式使用 Config_Params 和 key 属性)
 */
function generateConfigParamsXML(params: Record<string, any> | undefined, level: number): string {
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
  configParams: Record<string, any>,
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
 * 生成单个设备的XML (保留旧格式兼容)
 */
function generateEquipmentXML(equipment: SLDEquipment, level: number): string {
  let xml = `${indent(level)}<Equipment id="${escapeXml(equipment.id)}">\n`
  xml += `${indent(level + 1)}<Sequence>${equipment.sequence}</Sequence>\n`
  xml += `${indent(level + 1)}<Name>${escapeXml(equipment.name)}</Name>\n`
  xml += `${indent(level + 1)}<Type code="${equipment.type}">${escapeXml(EQUIPMENT_TYPE_FULL_NAME[equipment.type] || equipment.type)}</Type>\n`
  xml += `${indent(level + 1)}<Location>${escapeXml(equipment.location)}</Location>\n`
  xml += `${indent(level + 1)}<Position>\n`
  xml += `${indent(level + 2)}<KP unit="km">${equipment.kp.toFixed(3)}</KP>\n`
  xml += `${indent(level + 2)}<RouteKM unit="km">${(equipment.routeKM ?? equipment.kp).toFixed(3)}</RouteKM>\n`
  xml += `${indent(level + 2)}<SystemKM unit="km">${(equipment.systemKM ?? equipment.kp).toFixed(3)}</SystemKM>\n`
  xml += `${indent(level + 2)}<Longitude unit="deg">${equipment.longitude.toFixed(6)}</Longitude>\n`
  xml += `${indent(level + 2)}<Latitude unit="deg">${equipment.latitude.toFixed(6)}</Latitude>\n`
  xml += `${indent(level + 2)}<Depth unit="m">${equipment.depth.toFixed(1)}</Depth>\n`
  xml += `${indent(level + 1)}</Position>\n`
  
  // 连接关系
  if (equipment.upstreamId || equipment.downstreamId || equipment.branchId) {
    xml += `${indent(level + 1)}<Connections>\n`
    if (equipment.upstreamId) {
      xml += `${indent(level + 2)}<Upstream ref="${escapeXml(equipment.upstreamId)}" />\n`
    }
    if (equipment.downstreamId) {
      xml += `${indent(level + 2)}<Downstream ref="${escapeXml(equipment.downstreamId)}" />\n`
    }
    if (equipment.branchId) {
      xml += `${indent(level + 2)}<Branch ref="${escapeXml(equipment.branchId)}" />\n`
    }
    xml += `${indent(level + 1)}</Connections>\n`
  }
  
  xml += `${indent(level + 1)}<Specifications>${escapeXml(equipment.specifications)}</Specifications>\n`
  if (equipment.manufacturer) {
    xml += `${indent(level + 1)}<Manufacturer>${escapeXml(equipment.manufacturer)}</Manufacturer>\n`
  }
  
  // 配置参数
  xml += generateConfigParamsXML(equipment.configParams, level + 1)
  
  if (equipment.remarks) {
    xml += `${indent(level + 1)}<Remarks>${escapeXml(equipment.remarks)}</Remarks>\n`
  }
  
  xml += `${indent(level)}</Equipment>\n`
  return xml
}

/**
 * 生成单个光纤段的XML
 */
function generateFiberSegmentXML(segment: SLDFiberSegment, level: number): string {
  let xml = `${indent(level)}<FiberSegment id="${escapeXml(segment.id)}">\n`
  xml += `${indent(level + 1)}<Sequence>${segment.sequence}</Sequence>\n`
  xml += `${indent(level + 1)}<FromEquipment ref="${escapeXml(segment.fromEquipmentId)}">${escapeXml(segment.fromName)}</FromEquipment>\n`
  xml += `${indent(level + 1)}<ToEquipment ref="${escapeXml(segment.toEquipmentId)}">${escapeXml(segment.toName)}</ToEquipment>\n`
  xml += `${indent(level + 1)}<Length unit="km">${segment.length.toFixed(3)}</Length>\n`
  xml += `${indent(level + 1)}<FiberPairs count="${segment.fiberPairs}" type="${segment.fiberPairType}" />\n`
  xml += `${indent(level + 1)}<CableType>${escapeXml(segment.cableType)}</CableType>\n`
  xml += `${indent(level + 1)}<OpticalParams>\n`
  xml += `${indent(level + 2)}<Attenuation unit="dB/km">${segment.attenuation.toFixed(3)}</Attenuation>\n`
  xml += `${indent(level + 2)}<TotalLoss unit="dB">${segment.totalLoss.toFixed(3)}</TotalLoss>\n`
  xml += `${indent(level + 1)}</OpticalParams>\n`
  if (segment.remarks) {
    xml += `${indent(level + 1)}<Remarks>${escapeXml(segment.remarks)}</Remarks>\n`
  }
  xml += `${indent(level)}</FiberSegment>\n`
  return xml
}

/**
 * 生成传输参数XML
 */
function generateTransmissionParamsXML(params: SLDTransmissionParams, level: number): string {
  let xml = `${indent(level)}<TransmissionParams>\n`
  xml += `${indent(level + 1)}<DesignCapacity unit="Tbps">${params.designCapacity}</DesignCapacity>\n`
  xml += `${indent(level + 1)}<Wavelengths>${params.wavelengths}</Wavelengths>\n`
  xml += `${indent(level + 1)}<ChannelSpacing unit="GHz">${params.channelSpacing}</ChannelSpacing>\n`
  xml += `${indent(level + 1)}<ModulationFormat>${escapeXml(params.modulationFormat)}</ModulationFormat>\n`
  xml += `${indent(level + 1)}<LaunchPower unit="dBm">${params.launchPower}</LaunchPower>\n`
  xml += `${indent(level + 1)}<OSNRRequired unit="dB">${params.osnrRequired}</OSNRRequired>\n`
  xml += `${indent(level + 1)}<SpanLossBudget unit="dB">${params.spanLossBudget}</SpanLossBudget>\n`
  xml += `${indent(level + 1)}<SystemMargin unit="dB">${params.systemMargin}</SystemMargin>\n`
  xml += `${indent(level)}</TransmissionParams>\n`
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
    version: globalInfo?.version || '1.0',
    author: globalInfo?.author || 'System',
    description: globalInfo?.description
  }

  // 格式化日期为 YYYY-MM-DD
  const dateStr = new Date().toISOString().slice(0, 10)

  // 9.2标准格式: SystemLineDiagram 根元素
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`
  xml += `<!-- 海缆系统 SLD (System Line Diagram) 数据交换格式标准 9.2 -->\n`
  xml += `<SystemLineDiagram project="${escapeXml(fullGlobalInfo.systemName)}" version="1.0" date="${dateStr}">\n\n`
  
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
    const configParams: Record<string, any> = {
      ...(equipment.configParams || {})
    }
    
    // 添加设备特定参数
    if (equipment.name) configParams['Name'] = equipment.name
    if (equipment.type === 'TE' || equipment.type === 'PFE') {
      configParams['StationName'] = equipment.name
    }
    if (equipment.specifications) configParams['Specifications'] = equipment.specifications
    if (equipment.manufacturer) configParams['Manufacturer'] = equipment.manufacturer
    
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
        'CableType': outgoingSegment.cableType || 'LW',
        'FiberType': 'G.654.D',
        'LossCoeff': outgoingSegment.attenuation.toFixed(3),
        'Length': outgoingSegment.length.toFixed(3),
        'FiberPairs': outgoingSegment.fiberPairs
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
export function downloadFile(content: string, filename: string, mimeType: string) {
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
  const baseName = `SLD_${table.name.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_')}_${timestamp}`
  
  const content = exportToXML(table, globalInfo)
  downloadFile(content, `${baseName}.xml`, 'application/xml;charset=utf-8')
}

/**
 * 导出为CSV格式（设备列表）
 */
export function exportEquipmentsToCSV(table: SLDTable): string {
  const headers = [
    'Sequence', 'ID', 'Name', 'Type', 'Location', 
    'KP (km)', 'Route KM', 'System KM',
    'Longitude', 'Latitude', 'Depth (m)',
    'Upstream ID', 'Downstream ID', 'Branch ID',
    'Specifications', 'Manufacturer', 'Remarks'
  ]
  
  const rows = table.equipments.map(e => [
    e.sequence,
    e.id,
    e.name,
    e.type,
    e.location,
    e.kp.toFixed(3),
    (e.routeKM ?? e.kp).toFixed(3),
    (e.systemKM ?? e.kp).toFixed(3),
    e.longitude.toFixed(6),
    e.latitude.toFixed(6),
    e.depth.toFixed(1),
    e.upstreamId || '',
    e.downstreamId || '',
    e.branchId || '',
    e.specifications,
    e.manufacturer || '',
    e.remarks
  ])
  
  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => {
      const str = String(cell)
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`
      }
      return str
    }).join(','))
  ].join('\n')
  
  return csvContent
}

// Element_Type到内部类型的反向映射
const ELEMENT_TYPE_REVERSE_MAP: Record<string, string> = {
  'LandingStation': 'TE',
  'Repeater': 'REP',
  'BU': 'BU',
  'Joint': 'JOINT',
  'OADM': 'OADM',
  'CableSpan': 'CABLE'  // 光缆段特殊标记
}

/**
 * 从XML解析SLD数据（导入用）
 * 支持9.2格式(SystemLineDiagram)和旧格式(SystemLayoutDiagram)
 */
export function parseFromXML(xmlContent: string): { table: Partial<SLDTable>, globalInfo: Partial<SLDGlobalInfo> } | null {
  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(xmlContent, 'application/xml')
    
    // 检查解析错误
    const parseError = doc.querySelector('parsererror')
    if (parseError) {
      console.error('XML解析错误:', parseError.textContent)
      return null
    }
    
    // 支持9.2格式(SystemLineDiagram)和旧格式(SystemLayoutDiagram)
    let root = doc.querySelector('SystemLineDiagram')
    const is92Format = !!root
    
    if (!root) {
      root = doc.querySelector('SystemLayoutDiagram')
    }
    
    if (!root) {
      console.error('无效的SLD XML格式')
      return null
    }
    
    const globalInfo: Partial<SLDGlobalInfo> = {}
    const equipments: SLDEquipment[] = []
    const fiberSegments: SLDFiberSegment[] = []
    
    if (is92Format) {
      // ========== 解析9.2格式 ==========
      
      // 从根元素获取项目名
      globalInfo.systemName = root.getAttribute('project') || ''
      globalInfo.version = root.getAttribute('version') || '1.0'
      
      // 解析GlobalInfo
      const globalInfoEl = root.querySelector('GlobalInfo')
      if (globalInfoEl) {
        globalInfo.systemName = globalInfoEl.querySelector('SystemName')?.textContent || globalInfo.systemName
        globalInfo.totalLength = parseFloat(globalInfoEl.querySelector('TotalSystemLengthKM')?.textContent || '0')
        
        // 构建登陆点列表
        const startStation = globalInfoEl.querySelector('StartStation')?.textContent
        const endStation = globalInfoEl.querySelector('EndStation')?.textContent
        const landingPoints: string[] = []
        if (startStation) landingPoints.push(startStation)
        if (endStation && endStation !== startStation) landingPoints.push(endStation)
        globalInfo.landingPoints = landingPoints
      }
      
      // 解析Elements (9.2格式)
      let equipmentSequence = 1
      let segmentSequence = 1
      
      root.querySelectorAll('Elements > Element').forEach(elNode => {
        const elementType = elNode.querySelector('Element_Type')?.textContent || ''
        const routeKM = parseFloat(elNode.querySelector('Location > Route_KM')?.textContent || '0')
        const systemKM = parseFloat(elNode.querySelector('Location > System_KM')?.textContent || '0')
        const upstreamId = elNode.querySelector('Connection_Info > Upstream_ID')?.textContent || ''
        const downstreamId = elNode.querySelector('Connection_Info > Downstream_ID')?.textContent || ''
        const branchId = elNode.querySelector('Connection_Info > Branch_ID')?.textContent || ''
        
        // 解析配置参数
        const configParams: Record<string, string> = {}
        elNode.querySelectorAll('Config_Params > Param').forEach(paramEl => {
          const key = paramEl.getAttribute('key')
          const value = paramEl.getAttribute('value')
          if (key && value) {
            configParams[key] = value
          }
        })
        
        const internalType = ELEMENT_TYPE_REVERSE_MAP[elementType] || 'JOINT'
        
        if (internalType === 'CABLE') {
          // 这是光缆段 CableSpan
          const segment: SLDFiberSegment = {
            id: `seg-${Date.now()}-${segmentSequence}`,
            sequence: segmentSequence++,
            fromEquipmentId: '',  // 需要后处理关联
            toEquipmentId: '',
            fromName: '',
            toName: '',
            length: parseFloat(configParams['Length'] || '0'),
            fiberPairs: parseInt(configParams['FiberPairs'] || '0'),
            fiberPairType: 'working',
            cableType: configParams['CableType'] || 'LW',
            attenuation: parseFloat(configParams['LossCoeff'] || '0'),
            totalLoss: parseFloat(configParams['Length'] || '0') * parseFloat(configParams['LossCoeff'] || '0'),
            remarks: configParams['Remarks'] || '',
          }
          fiberSegments.push(segment)
        } else {
          // 这是设备
          const equipment: SLDEquipment = {
            id: `eq-${Date.now()}-${equipmentSequence}`,
            sequence: equipmentSequence++,
            name: configParams['Name'] || configParams['StationName'] || `${elementType}-${equipmentSequence}`,
            type: internalType as any,
            location: '',
            kp: routeKM,
            routeKM: routeKM,
            systemKM: systemKM,
            longitude: 0,
            latitude: 0,
            depth: 0,
            specifications: configParams['Specifications'] || configParams['Model'] || '',
            manufacturer: configParams['Manufacturer'],
            remarks: '',
            upstreamId: upstreamId && upstreamId !== 'NULL' ? upstreamId : undefined,
            downstreamId: downstreamId && downstreamId !== 'NULL' ? downstreamId : undefined,
            branchId: branchId || undefined,
            configParams: configParams,
          }
          equipments.push(equipment)
        }
      })
      
    } else {
      // ========== 解析旧格式 ==========
      
      const globalInfoEl = root.querySelector('GlobalInfo')
      if (globalInfoEl) {
        globalInfo.systemName = globalInfoEl.querySelector('SystemName')?.textContent || ''
        globalInfo.systemCode = globalInfoEl.querySelector('SystemCode')?.textContent || ''
        globalInfo.designCapacity = globalInfoEl.querySelector('DesignCapacity')?.textContent || ''
        globalInfo.totalLength = parseFloat(globalInfoEl.querySelector('TotalLength')?.textContent || '0')
        globalInfo.fiberPairs = parseInt(globalInfoEl.querySelector('FiberPairs')?.textContent || '0')
        globalInfo.version = globalInfoEl.querySelector('Version')?.textContent || ''
        globalInfo.author = globalInfoEl.querySelector('Author')?.textContent || ''
        globalInfo.description = globalInfoEl.querySelector('Description')?.textContent || ''
        
        const landingPointsEl = globalInfoEl.querySelector('LandingPoints')
        if (landingPointsEl) {
          globalInfo.landingPoints = Array.from(landingPointsEl.querySelectorAll('Point'))
            .map(p => p.textContent || '')
        }
      }
      
      // 解析设备列表 (旧格式)
      root.querySelectorAll('Equipments > Equipment').forEach(eqEl => {
        const equipment: SLDEquipment = {
          id: eqEl.getAttribute('id') || `eq-${Date.now()}`,
          sequence: parseInt(eqEl.querySelector('Sequence')?.textContent || '0'),
          name: eqEl.querySelector('Name')?.textContent || '',
          type: (eqEl.querySelector('Type')?.getAttribute('code') || 'JOINT') as any,
          location: eqEl.querySelector('Location')?.textContent || '',
          kp: parseFloat(eqEl.querySelector('Position > KP')?.textContent || '0'),
          routeKM: parseFloat(eqEl.querySelector('Position > RouteKM')?.textContent || '0'),
          systemKM: parseFloat(eqEl.querySelector('Position > SystemKM')?.textContent || '0'),
          longitude: parseFloat(eqEl.querySelector('Position > Longitude')?.textContent || '0'),
          latitude: parseFloat(eqEl.querySelector('Position > Latitude')?.textContent || '0'),
          depth: parseFloat(eqEl.querySelector('Position > Depth')?.textContent || '0'),
          specifications: eqEl.querySelector('Specifications')?.textContent || '',
          manufacturer: eqEl.querySelector('Manufacturer')?.textContent || undefined,
          remarks: eqEl.querySelector('Remarks')?.textContent || '',
          upstreamId: eqEl.querySelector('Connections > Upstream')?.getAttribute('ref') || undefined,
          downstreamId: eqEl.querySelector('Connections > Downstream')?.getAttribute('ref') || undefined,
          branchId: eqEl.querySelector('Connections > Branch')?.getAttribute('ref') || undefined,
        }
        
        // 解析配置参数 (旧格式使用name属性，也支持9.2的key属性)
        const configParams: Record<string, string> = {}
        eqEl.querySelectorAll('ConfigParams > Param, Config_Params > Param').forEach(paramEl => {
          const key = paramEl.getAttribute('name') || paramEl.getAttribute('key')
          const value = paramEl.getAttribute('value')
          if (key && value) {
            configParams[key] = value
          }
        })
        if (Object.keys(configParams).length > 0) {
          equipment.configParams = configParams
        }
        
        equipments.push(equipment)
      })
      
      // 解析光纤段列表 (旧格式)
      root.querySelectorAll('FiberSegments > FiberSegment').forEach(segEl => {
        const segment: SLDFiberSegment = {
          id: segEl.getAttribute('id') || `seg-${Date.now()}`,
          sequence: parseInt(segEl.querySelector('Sequence')?.textContent || '0'),
          fromEquipmentId: segEl.querySelector('FromEquipment')?.getAttribute('ref') || '',
          toEquipmentId: segEl.querySelector('ToEquipment')?.getAttribute('ref') || '',
          fromName: segEl.querySelector('FromEquipment')?.textContent || '',
          toName: segEl.querySelector('ToEquipment')?.textContent || '',
          length: parseFloat(segEl.querySelector('Length')?.textContent || '0'),
          fiberPairs: parseInt(segEl.querySelector('FiberPairs')?.getAttribute('count') || '0'),
          fiberPairType: (segEl.querySelector('FiberPairs')?.getAttribute('type') || 'working') as any,
          cableType: segEl.querySelector('CableType')?.textContent || '',
          attenuation: parseFloat(segEl.querySelector('OpticalParams > Attenuation')?.textContent || '0'),
          totalLoss: parseFloat(segEl.querySelector('OpticalParams > TotalLoss')?.textContent || '0'),
          remarks: segEl.querySelector('Remarks')?.textContent || '',
        }
        fiberSegments.push(segment)
      })
    }
    
    // 解析传输参数 (两种格式通用)
    const transEl = root.querySelector('TransmissionParams')
    const transmissionParams: Partial<SLDTransmissionParams> = {}
    if (transEl) {
      transmissionParams.designCapacity = parseFloat(transEl.querySelector('DesignCapacity')?.textContent || '0')
      transmissionParams.wavelengths = parseInt(transEl.querySelector('Wavelengths')?.textContent || '0')
      transmissionParams.channelSpacing = parseFloat(transEl.querySelector('ChannelSpacing')?.textContent || '0')
      transmissionParams.modulationFormat = transEl.querySelector('ModulationFormat')?.textContent || ''
      transmissionParams.launchPower = parseFloat(transEl.querySelector('LaunchPower')?.textContent || '0')
      transmissionParams.osnrRequired = parseFloat(transEl.querySelector('OSNRRequired')?.textContent || '0')
      transmissionParams.spanLossBudget = parseFloat(transEl.querySelector('SpanLossBudget')?.textContent || '0')
      transmissionParams.systemMargin = parseFloat(transEl.querySelector('SystemMargin')?.textContent || '0')
    }
    
    return {
      table: {
        name: globalInfo.systemName,
        equipments,
        fiberSegments,
        transmissionParams: transmissionParams as SLDTransmissionParams,
      },
      globalInfo
    }
  } catch (error) {
    console.error('XML解析失败:', error)
    return null
  }
}

// Vue composable
export function useSLDExport() {
  return {
    exportToXML,
    exportSLDFile,
    exportEquipmentsToCSV,
    parseFromXML,
    downloadFile,
    escapeXml,
  }
}
