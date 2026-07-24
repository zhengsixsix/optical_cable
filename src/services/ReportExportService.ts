type ReportFormat = 'txt' | 'json' | 'html' | 'csv'

interface BackendMetricSummary {
  min?: number | null
  max?: number | null
  avg?: number | null
}

export interface BackendCostItem {
  category?: string
  model?: string
  quantity?: number | string
  unit?: string
  unitPrice?: number | null
  subtotal?: number | null
}

export interface BackendCostData {
  cableCost?: number | null
  amplifierCost?: number | null
  buCost?: number | null
  equalizerCost?: number | null
  totalCost?: number | null
  costItems?: BackendCostItem[]
}

interface CostReportPayload {
  projectName: string
  totalLength?: number | null
  calculatedAt?: string | null
  costData: BackendCostData
}

interface PerformanceReportPayload {
  projectName: string
  totalLength?: number | null
  calculatedAt?: string | null
  status?: string | null
  systemCapacityTbps?: number | null
  metrics?: {
    osnr?: BackendMetricSummary | null
    gsnr?: BackendMetricSummary | null
    power?: BackendMetricSummary | null
    nli?: BackendMetricSummary | null
    qFactor?: BackendMetricSummary | null
  } | null
  margin?: {
    targetOsnr?: number | null
    worstMargin?: number | null
    avgMargin?: number | null
    meetsRequirement?: boolean | null
  } | null
  systemConfig?: {
    amplifierCount?: number | null
    avgSpanLength?: number | null
    buCount?: number | null
    equalizerCount?: number | null
    totalBuLoss?: number | null
    totalEqualizerLoss?: number | null
    channelCount?: number | null
    modulation?: string | null
  } | null
}

interface ReportRow {
  field: string
  value: string
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

const numberText = (value: unknown, unit = ''): string | null =>
  isFiniteNumber(value) ? `${value}${unit}` : null

const escapeCsv = (value: unknown): string => {
  const text = String(value ?? '')
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

const escapeHtml = (value: unknown): string => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;')

const pushNumberRow = (rows: ReportRow[], field: string, value: unknown, unit = '') => {
  const text = numberText(value, unit)
  if (text != null) rows.push({ field, value: text })
}

const costRows = (payload: CostReportPayload): ReportRow[] => {
  const rows: ReportRow[] = []
  pushNumberRow(rows, '线路总长', payload.totalLength, ' km')
  if (payload.calculatedAt) rows.push({ field: '后端计算时间', value: payload.calculatedAt })

  const explicitItems = Array.isArray(payload.costData.costItems)
    ? payload.costData.costItems
    : []
  if (explicitItems.length > 0) {
    explicitItems.forEach((item, index) => {
      const label = [item.category, item.model].filter(Boolean).join(' / ') || `成本项 ${index + 1}`
      const details = [
        item.quantity != null ? `${item.quantity}${item.unit ? ` ${item.unit}` : ''}` : null,
        isFiniteNumber(item.unitPrice) ? `单价 ${item.unitPrice}` : null,
        isFiniteNumber(item.subtotal) ? `小计 ${item.subtotal}` : null,
      ].filter((value): value is string => Boolean(value))
      rows.push({ field: label, value: details.join('；') || '后端未提供金额' })
    })
  } else {
    pushNumberRow(rows, '海缆成本', payload.costData.cableCost)
    pushNumberRow(rows, '放大器成本', payload.costData.amplifierCost)
    pushNumberRow(rows, 'BU 成本', payload.costData.buCost)
    pushNumberRow(rows, '均衡器成本', payload.costData.equalizerCost)
  }
  pushNumberRow(rows, '总成本', payload.costData.totalCost)
  return rows
}

const performanceRows = (payload: PerformanceReportPayload): ReportRow[] => {
  const rows: ReportRow[] = []
  pushNumberRow(rows, '线路总长', payload.totalLength, ' km')
  if (payload.calculatedAt) rows.push({ field: '后端计算时间', value: payload.calculatedAt })
  if (payload.status) rows.push({ field: '后端状态', value: payload.status })
  pushNumberRow(rows, '系统容量', payload.systemCapacityTbps, ' Tbps')

  const metricRows: Array<[string, BackendMetricSummary | null | undefined]> = [
    ['OSNR', payload.metrics?.osnr],
    ['GSNR', payload.metrics?.gsnr],
    ['功率', payload.metrics?.power],
    ['NLI', payload.metrics?.nli],
    ['Q-Factor', payload.metrics?.qFactor],
  ]
  metricRows.forEach(([label, metric]) => {
    if (!metric) return
    pushNumberRow(rows, `${label} 最小值`, metric.min)
    pushNumberRow(rows, `${label} 最大值`, metric.max)
    pushNumberRow(rows, `${label} 平均值`, metric.avg)
  })

  pushNumberRow(rows, '目标 OSNR', payload.margin?.targetOsnr, ' dB')
  pushNumberRow(rows, '最差裕量', payload.margin?.worstMargin, ' dB')
  pushNumberRow(rows, '平均裕量', payload.margin?.avgMargin, ' dB')
  if (typeof payload.margin?.meetsRequirement === 'boolean') {
    rows.push({
      field: '后端裕量判定',
      value: payload.margin.meetsRequirement ? '满足' : '不满足',
    })
  }

  pushNumberRow(rows, '放大器数量', payload.systemConfig?.amplifierCount)
  pushNumberRow(rows, '平均跨段', payload.systemConfig?.avgSpanLength, ' km')
  pushNumberRow(rows, 'BU 数量', payload.systemConfig?.buCount)
  pushNumberRow(rows, '均衡器数量', payload.systemConfig?.equalizerCount)
  pushNumberRow(rows, 'BU 总插损', payload.systemConfig?.totalBuLoss, ' dB')
  pushNumberRow(rows, '均衡器总损耗', payload.systemConfig?.totalEqualizerLoss, ' dB')
  pushNumberRow(rows, '信道数量', payload.systemConfig?.channelCount)
  if (payload.systemConfig?.modulation) {
    rows.push({ field: '调制格式', value: payload.systemConfig.modulation })
  }
  return rows
}

class ReportExportService {
  exportCostReport(payload: CostReportPayload, format: ReportFormat = 'txt'): void {
    this.exportRows('成本分析报告', 'cost', payload, costRows(payload), format)
  }

  exportPerformanceReport(payload: PerformanceReportPayload, format: ReportFormat = 'txt'): void {
    this.exportRows('性能分析报告', 'performance', payload, performanceRows(payload), format)
  }

  private exportRows(
    title: string,
    reportType: 'cost' | 'performance',
    payload: CostReportPayload | PerformanceReportPayload,
    rows: ReportRow[],
    format: ReportFormat,
  ): void {
    const content = this.serialize(title, reportType, payload, rows, format)
    const date = new Date().toISOString().slice(0, 10)
    this.download(content, `${title}_${date}`, format)
  }

  private serialize(
    title: string,
    reportType: 'cost' | 'performance',
    payload: CostReportPayload | PerformanceReportPayload,
    rows: ReportRow[],
    format: ReportFormat,
  ): string {
    if (format === 'json') {
      return JSON.stringify({
        reportType,
        generatedAt: new Date().toISOString(),
        ...payload,
      }, null, 2)
    }
    if (format === 'csv') {
      return `${String.fromCharCode(0xfeff)}字段,后端返回值\r\n${rows
        .map(row => `${escapeCsv(row.field)},${escapeCsv(row.value)}`)
        .join('\r\n')}`
    }
    if (format === 'html') {
      return `<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <p>项目名称：${escapeHtml(payload.projectName)}</p>
  <table border="1" cellspacing="0" cellpadding="6">
    <thead><tr><th>字段</th><th>后端返回值</th></tr></thead>
    <tbody>${rows.map(row => `<tr><td>${escapeHtml(row.field)}</td><td>${escapeHtml(row.value)}</td></tr>`).join('')}</tbody>
  </table>
</body>
</html>`
    }

    return [
      title,
      `项目名称: ${payload.projectName}`,
      '',
      ...rows.map(row => `${row.field}: ${row.value}`),
    ].join('\n')
  }

  private download(content: string, filename: string, format: ReportFormat): void {
    const mimeType = format === 'json'
      ? 'application/json'
      : format === 'html'
        ? 'text/html'
        : format === 'csv'
          ? 'text/csv'
          : 'text/plain'
    const url = URL.createObjectURL(new Blob([content], { type: `${mimeType};charset=utf-8` }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${filename}.${format}`
    anchor.click()
    URL.revokeObjectURL(url)
  }
}

export const reportExportService = new ReportExportService()
