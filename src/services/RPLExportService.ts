/**
 * RPL文件导出服务
 * 按行业标准格式导出Route Position List文件
 * 支持Excel(.xlsx)和CSV格式
 */

import type { RPLRecord, RPLTable } from '@/types'

// 行业标准RPL表头
export const RPL_STANDARD_HEADERS = [
  'Pos No.',
  'Event',
  'Latitude',
  'Longitude',
  'Water Depth (m)',
  'Slack %',
  'Cable Type',
  'Distance (km) Between',
  'Distance (km) Cumulative',
  'Burial Depth (m)',
  'Remarks'
]

// 点类型映射到行业标准Event名称
const EVENT_TYPE_MAP: Record<string, string> = {
  landing: 'Landing Station',
  repeater: 'Repeater',
  branching: 'Branching Unit',
  joint: 'Joint',
  waypoint: 'Waypoint',
}

// 将RPLRecord转换为行业标准格式行
function recordToStandardRow(record: RPLRecord, index: number): (string | number)[] {
  return [
    index + 1,                                    // Pos No.
    EVENT_TYPE_MAP[record.pointType] || record.pointType,  // Event
    record.latitude.toFixed(6),                   // Latitude
    record.longitude.toFixed(6),                  // Longitude
    record.depth.toFixed(1),                      // Water Depth (m)
    record.slack.toFixed(2),                      // Slack %
    record.cableType,                             // Cable Type
    record.segmentLength.toFixed(3),              // Distance (km) Between
    record.cumulativeLength.toFixed(3),           // Distance (km) Cumulative
    record.burialDepth.toFixed(2),                // Burial Depth (m)
    record.remarks || ''                          // Remarks
  ]
}

// 导出为CSV格式
export function exportToCSV(table: RPLTable): string {
  const rows: string[] = []
  
  // 添加文件头信息
  rows.push(`# Route Position List (RPL)`)
  rows.push(`# Project: ${table.name}`)
  rows.push(`# Route ID: ${table.routeId || 'N/A'}`)
  rows.push(`# Generated: ${new Date().toISOString()}`)
  rows.push(`# Total Points: ${table.records.length}`)
  rows.push(`# Total Length: ${table.metadata.totalLength.toFixed(3)} km`)
  rows.push('')
  
  // 添加表头
  rows.push(RPL_STANDARD_HEADERS.join(','))
  
  // 添加数据行
  table.records.forEach((record, index) => {
    const row = recordToStandardRow(record, index)
    // CSV转义处理
    const csvRow = row.map(cell => {
      const str = String(cell)
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`
      }
      return str
    })
    rows.push(csvRow.join(','))
  })
  
  return rows.join('\n')
}

// 导出为Excel格式（生成xlsx兼容的XML）
export function exportToExcelXML(table: RPLTable): string {
  const escapeXml = (str: string) => 
    str.replace(/&/g, '&amp;')
       .replace(/</g, '&lt;')
       .replace(/>/g, '&gt;')
       .replace(/"/g, '&quot;')

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="Header">
   <Font ss:Bold="1" ss:Size="11"/>
   <Interior ss:Color="#4472C4" ss:Pattern="Solid"/>
   <Font ss:Color="#FFFFFF"/>
  </Style>
  <Style ss:ID="Info">
   <Font ss:Italic="1" ss:Color="#666666"/>
  </Style>
  <Style ss:ID="Number">
   <NumberFormat ss:Format="0.000"/>
  </Style>
 </Styles>
 <Worksheet ss:Name="RPL">
  <Table>
`

  // 文件信息行
  const infoRows = [
    ['Route Position List (RPL)'],
    [`Project: ${table.name}`],
    [`Route ID: ${table.routeId || 'N/A'}`],
    [`Generated: ${new Date().toISOString()}`],
    [`Total Points: ${table.records.length}`],
    [`Total Length: ${table.metadata.totalLength.toFixed(3)} km`],
    ['']
  ]
  
  infoRows.forEach(row => {
    xml += `   <Row>\n`
    row.forEach(cell => {
      xml += `    <Cell ss:StyleID="Info"><Data ss:Type="String">${escapeXml(String(cell))}</Data></Cell>\n`
    })
    xml += `   </Row>\n`
  })

  // 表头行
  xml += `   <Row>\n`
  RPL_STANDARD_HEADERS.forEach(header => {
    xml += `    <Cell ss:StyleID="Header"><Data ss:Type="String">${escapeXml(header)}</Data></Cell>\n`
  })
  xml += `   </Row>\n`

  // 数据行
  table.records.forEach((record, index) => {
    const row = recordToStandardRow(record, index)
    xml += `   <Row>\n`
    row.forEach((cell, cellIndex) => {
      const isNumber = typeof cell === 'number' || (cellIndex > 0 && cellIndex < 9)
      const type = isNumber ? 'Number' : 'String'
      xml += `    <Cell><Data ss:Type="${type}">${escapeXml(String(cell))}</Data></Cell>\n`
    })
    xml += `   </Row>\n`
  })

  xml += `  </Table>
 </Worksheet>
</Workbook>`

  return xml
}

// 触发文件下载
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

// 导出RPL文件主函数
export function exportRPLFile(table: RPLTable, format: 'csv' | 'excel' = 'csv') {
  const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const baseName = `RPL_${table.name.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_')}_${timestamp}`
  
  if (format === 'csv') {
    const content = exportToCSV(table)
    downloadFile(content, `${baseName}.csv`, 'text/csv;charset=utf-8')
  } else {
    const content = exportToExcelXML(table)
    downloadFile(content, `${baseName}.xls`, 'application/vnd.ms-excel')
  }
}

// Vue composable
export function useRPLExport() {
  return {
    exportToCSV,
    exportToExcelXML,
    exportRPLFile,
    downloadFile,
    RPL_STANDARD_HEADERS,
  }
}
