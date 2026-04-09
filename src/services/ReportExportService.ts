/**
 * 报告导出服务
 * 生成成本报告、性能报告、系统概要报告
 */

import type { LinkSimulationResult, LinkBudget } from '@/types/simulation'
import type { SLDTable, SLDMetadata } from '@/types/sld'

// 报告类型
export type ReportType = 'cost' | 'performance' | 'summary' | 'full' | 'feasibility'

// 报告格式
export type ReportFormat = 'txt' | 'json' | 'html' | 'csv'

// 成本报告数据
export interface CostReportData {
  projectName: string
  totalLength: number
  // 材料成本
  cableCost: number
  repeaterCost: number
  branchingUnitCost: number
  equalizerCost: number
  terminalEquipmentCost: number
  // 施工成本
  laborCost: number
  surveyingCost: number
  vesselCost: number
  installationCost: number
  // 其他成本
  permitCost: number
  insuranceCost: number
  contingency: number
  // 汇总
  subtotal: number
  total: number
  costBreakdown: CostBreakdownItem[]
}

// 成本明细项
export interface CostBreakdownItem {
  category: string
  item: string
  quantity: number
  unit: string
  unitCost: number
  totalCost: number
  percentage: number
}

// 性能报告数据
export interface PerformanceReportData {
  projectName: string
  simulationModel: string
  simulatedAt: Date
  // 链路概要
  totalLength: number
  spanCount: number
  repeaterCount: number
  // WDM参数
  channelCount: number
  channelSpacing: number
  modulationFormat: string
  // 性能指标
  endToEndOSNR: number
  endToEndGSNR: number
  gsnrMargin: number
  qFactor: number
  estimatedBER: number
  // 系统可行性
  isFeasible: boolean
  bottleneckType: string
  recommendations: string[]
  // 各跨段数据
  spanResults: Array<{
    index: number
    kpStart: number
    kpEnd: number
    length: number
    gsnr: number
    margin: number
  }>
}

// 报告配置
export interface ReportConfig {
  includeHeader: boolean
  includeTimestamp: boolean
  includeSummary: boolean
  includeDetails: boolean
  includeRecommendations: boolean
  language: 'zh' | 'en'
  currency: string
  decimalPlaces: number
}

// 默认配置
const DEFAULT_CONFIG: ReportConfig = {
  includeHeader: true,
  includeTimestamp: true,
  includeSummary: true,
  includeDetails: true,
  includeRecommendations: true,
  language: 'zh',
  currency: 'USD',
  decimalPlaces: 2
}

/**
 * 报告导出服务
 */
export class ReportExportService {
  private config: ReportConfig = DEFAULT_CONFIG

  /**
   * 设置配置
   */
  setConfig(config: Partial<ReportConfig>): void {
    this.config = { ...this.config, ...config }
  }

  /**
   * 生成成本报告
   */
  generateCostReport(data: CostReportData, format: ReportFormat = 'txt'): string {
    switch (format) {
      case 'json':
        return this.generateCostReportJSON(data)
      case 'html':
        return this.generateCostReportHTML(data)
      case 'csv':
        return this.generateCostReportCSV(data)
      default:
        return this.generateCostReportTXT(data)
    }
  }

  /**
   * 生成性能报告
   */
  generatePerformanceReport(data: PerformanceReportData, format: ReportFormat = 'txt'): string {
    switch (format) {
      case 'json':
        return this.generatePerformanceReportJSON(data)
      case 'html':
        return this.generatePerformanceReportHTML(data)
      case 'csv':
        return this.generatePerformanceReportCSV(data)
      default:
        return this.generatePerformanceReportTXT(data)
    }
  }

  /**
   * 从仿真结果创建性能报告数据
   */
  createPerformanceDataFromSimulation(
    result: LinkSimulationResult,
    projectName: string,
    wdmConfig: { channelCount: number; channelSpacing: number; modulationFormat: string }
  ): PerformanceReportData {
    return {
      projectName,
      simulationModel: result.model,
      simulatedAt: result.simulatedAt,
      totalLength: result.spanResults.reduce((sum, s) => sum + s.length, 0),
      spanCount: result.spanResults.length,
      repeaterCount: result.spanResults.length - 1,
      channelCount: wdmConfig.channelCount,
      channelSpacing: wdmConfig.channelSpacing,
      modulationFormat: wdmConfig.modulationFormat,
      endToEndOSNR: result.endToEndOSNR,
      endToEndGSNR: result.endToEndGSNR,
      gsnrMargin: result.gsnrMargin,
      qFactor: result.qFactor,
      estimatedBER: result.estimatedBER,
      isFeasible: result.isFeasible,
      bottleneckType: result.bottleneckAnalysis.type,
      recommendations: result.bottleneckAnalysis.recommendations,
      spanResults: result.spanResults.map(s => ({
        index: s.index,
        kpStart: s.kpStart,
        kpEnd: s.kpEnd,
        length: s.length,
        gsnr: s.gsnr,
        margin: s.gsnrMargin
      }))
    }
  }

  // ========== TXT 格式生成 ==========

  private generateCostReportTXT(data: CostReportData): string {
    const lines: string[] = []
    const separator = '='.repeat(60)
    const subSeparator = '-'.repeat(60)

    if (this.config.includeHeader) {
      lines.push(separator)
      lines.push('                    成本分析报告')
      lines.push(separator)
      lines.push(`项目名称: ${data.projectName}`)
      if (this.config.includeTimestamp) {
        lines.push(`生成时间: ${new Date().toLocaleString('zh-CN')}`)
      }
      lines.push(separator)
      lines.push('')
    }

    if (this.config.includeSummary) {
      lines.push('【项目概要】')
      lines.push(`  总长度: ${data.totalLength.toLocaleString()} km`)
      lines.push('')
    }

    lines.push('【成本明细】')
    lines.push('')
    
    // 材料成本
    lines.push('一、材料成本')
    lines.push(`  海缆材料: ${this.formatCurrency(data.cableCost)}`)
    lines.push(`  放大器设备: ${this.formatCurrency(data.repeaterCost)}`)
    lines.push(`  分支器设备: ${this.formatCurrency(data.branchingUnitCost)}`)
    lines.push(`  均衡器设备: ${this.formatCurrency(data.equalizerCost)}`)
    lines.push(`  终端设备: ${this.formatCurrency(data.terminalEquipmentCost)}`)
    lines.push('')

    // 施工成本
    lines.push('二、施工成本')
    lines.push(`  人工成本: ${this.formatCurrency(data.laborCost)}`)
    lines.push(`  勘测成本: ${this.formatCurrency(data.surveyingCost)}`)
    lines.push(`  船舶租赁: ${this.formatCurrency(data.vesselCost)}`)
    lines.push(`  安装调试: ${this.formatCurrency(data.installationCost)}`)
    lines.push('')

    // 其他成本
    lines.push('三、其他成本')
    lines.push(`  许可证费: ${this.formatCurrency(data.permitCost)}`)
    lines.push(`  保险费用: ${this.formatCurrency(data.insuranceCost)}`)
    lines.push(`  应急预算: ${this.formatCurrency(data.contingency)}`)
    lines.push('')

    lines.push(subSeparator)
    lines.push(`  小计: ${this.formatCurrency(data.subtotal)}`)
    lines.push(`  总计: ${this.formatCurrency(data.total)}`)
    lines.push(separator)
    lines.push('')
    lines.push('报告结束')

    return lines.join('\n')
  }

  private generatePerformanceReportTXT(data: PerformanceReportData): string {
    const lines: string[] = []
    const separator = '='.repeat(60)
    const subSeparator = '-'.repeat(60)

    if (this.config.includeHeader) {
      lines.push(separator)
      lines.push('                    性能分析报告')
      lines.push(separator)
      lines.push(`项目名称: ${data.projectName}`)
      lines.push(`仿真模型: ${data.simulationModel}`)
      if (this.config.includeTimestamp) {
        lines.push(`仿真时间: ${data.simulatedAt.toLocaleString('zh-CN')}`)
      }
      lines.push(separator)
      lines.push('')
    }

    if (this.config.includeSummary) {
      lines.push('【链路概要】')
      lines.push(`  总长度: ${data.totalLength.toFixed(1)} km`)
      lines.push(`  跨段数: ${data.spanCount}`)
      lines.push(`  放大器数: ${data.repeaterCount}`)
      lines.push('')

      lines.push('【WDM参数】')
      lines.push(`  波道数: ${data.channelCount}`)
      lines.push(`  信道间隔: ${data.channelSpacing} GHz`)
      lines.push(`  调制格式: ${data.modulationFormat}`)
      lines.push('')
    }

    lines.push('【性能指标】')
    lines.push(`  端到端OSNR: ${data.endToEndOSNR.toFixed(2)} dB`)
    lines.push(`  端到端GSNR: ${data.endToEndGSNR.toFixed(2)} dB`)
    lines.push(`  GSNR余量: ${data.gsnrMargin.toFixed(2)} dB`)
    lines.push(`  Q因子: ${data.qFactor.toFixed(2)} dB`)
    lines.push(`  预估BER: ${data.estimatedBER.toExponential(2)}`)
    lines.push('')

    lines.push('【系统评估】')
    lines.push(`  可行性: ${data.isFeasible ? '✓ 满足要求' : '✗ 不满足要求'}`)
    lines.push(`  瓶颈类型: ${this.getBottleneckTypeName(data.bottleneckType)}`)
    lines.push('')

    if (this.config.includeRecommendations && data.recommendations.length > 0) {
      lines.push('【优化建议】')
      data.recommendations.forEach((rec, i) => {
        lines.push(`  ${i + 1}. ${rec}`)
      })
      lines.push('')
    }

    if (this.config.includeDetails) {
      lines.push(subSeparator)
      lines.push('【各跨段性能】')
      lines.push('')
      lines.push('  序号    KP范围(km)      长度    GSNR     余量')
      lines.push('  ' + '-'.repeat(50))
      
      for (const span of data.spanResults) {
        const kpRange = `${span.kpStart.toFixed(0)}-${span.kpEnd.toFixed(0)}`
        const marginStr = span.margin >= 0 ? `+${span.margin.toFixed(1)}` : span.margin.toFixed(1)
        lines.push(
          `  ${String(span.index).padStart(4)}    ${kpRange.padEnd(14)} ${String(span.length.toFixed(0)).padStart(6)}   ${span.gsnr.toFixed(1).padStart(5)}   ${marginStr.padStart(6)}`
        )
      }
    }

    lines.push('')
    lines.push(separator)
    lines.push('报告结束')

    return lines.join('\n')
  }

  // ========== JSON 格式生成 ==========

  private generateCostReportJSON(data: CostReportData): string {
    return JSON.stringify({
      reportType: 'cost',
      generatedAt: new Date().toISOString(),
      ...data
    }, null, 2)
  }

  private generatePerformanceReportJSON(data: PerformanceReportData): string {
    return JSON.stringify({
      reportType: 'performance',
      generatedAt: new Date().toISOString(),
      ...data
    }, null, 2)
  }

  // ========== HTML 格式生成 ==========

  private generateCostReportHTML(data: CostReportData): string {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>成本分析报告 - ${data.projectName}</title>
  <style>
    body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
    h1 { color: #333; border-bottom: 2px solid #3b82f6; padding-bottom: 10px; }
    h2 { color: #555; margin-top: 20px; }
    table { width: 100%; border-collapse: collapse; margin: 10px 0; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background-color: #f5f5f5; }
    .total { font-weight: bold; background-color: #e3f2fd; }
    .currency { text-align: right; font-family: monospace; }
  </style>
</head>
<body>
  <h1>成本分析报告</h1>
  <p><strong>项目名称:</strong> ${data.projectName}</p>
  <p><strong>总长度:</strong> ${data.totalLength.toLocaleString()} km</p>
  <p><strong>生成时间:</strong> ${new Date().toLocaleString('zh-CN')}</p>
  
  <h2>成本明细</h2>
  <table>
    <tr><th>项目</th><th class="currency">金额</th></tr>
    <tr><td>海缆材料</td><td class="currency">${this.formatCurrency(data.cableCost)}</td></tr>
    <tr><td>放大器设备</td><td class="currency">${this.formatCurrency(data.repeaterCost)}</td></tr>
    <tr><td>分支器设备</td><td class="currency">${this.formatCurrency(data.branchingUnitCost)}</td></tr>
    <tr><td>均衡器设备</td><td class="currency">${this.formatCurrency(data.equalizerCost)}</td></tr>
    <tr><td>终端设备</td><td class="currency">${this.formatCurrency(data.terminalEquipmentCost)}</td></tr>
    <tr><td>人工成本</td><td class="currency">${this.formatCurrency(data.laborCost)}</td></tr>
    <tr><td>勘测成本</td><td class="currency">${this.formatCurrency(data.surveyingCost)}</td></tr>
    <tr><td>船舶租赁</td><td class="currency">${this.formatCurrency(data.vesselCost)}</td></tr>
    <tr><td>安装调试</td><td class="currency">${this.formatCurrency(data.installationCost)}</td></tr>
    <tr><td>许可证费用</td><td class="currency">${this.formatCurrency(data.permitCost)}</td></tr>
    <tr><td>保险费用</td><td class="currency">${this.formatCurrency(data.insuranceCost)}</td></tr>
    <tr><td>应急预算</td><td class="currency">${this.formatCurrency(data.contingency)}</td></tr>
    <tr class="total"><td>总计</td><td class="currency">${this.formatCurrency(data.total)}</td></tr>
  </table>
</body>
</html>`
  }

  private generatePerformanceReportHTML(data: PerformanceReportData): string {
    const spanRows = data.spanResults.map(s => 
      `<tr><td>${s.index}</td><td>${s.kpStart.toFixed(0)}-${s.kpEnd.toFixed(0)}</td><td>${s.length.toFixed(0)}</td><td>${s.gsnr.toFixed(1)}</td><td class="${s.margin >= 0 ? 'positive' : 'negative'}">${s.margin.toFixed(1)}</td></tr>`
    ).join('\n')

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>性能分析报告 - ${data.projectName}</title>
  <style>
    body { font-family: Arial, sans-serif; max-width: 900px; margin: 0 auto; padding: 20px; }
    h1 { color: #333; border-bottom: 2px solid #10b981; padding-bottom: 10px; }
    h2 { color: #555; margin-top: 20px; }
    .summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin: 20px 0; }
    .metric { background: #f9fafb; border-radius: 8px; padding: 15px; text-align: center; }
    .metric-value { font-size: 24px; font-weight: bold; color: #3b82f6; }
    .metric-label { font-size: 12px; color: #666; }
    .status { padding: 5px 15px; border-radius: 20px; display: inline-block; }
    .status.ok { background: #dcfce7; color: #166534; }
    .status.fail { background: #fee2e2; color: #991b1b; }
    table { width: 100%; border-collapse: collapse; margin: 10px 0; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: center; }
    th { background-color: #f5f5f5; }
    .positive { color: #166534; }
    .negative { color: #991b1b; }
  </style>
</head>
<body>
  <h1>性能分析报告</h1>
  <p><strong>项目名称:</strong> ${data.projectName}</p>
  <p><strong>仿真模型:</strong> ${data.simulationModel}</p>
  <p><strong>生成时间:</strong> ${new Date().toLocaleString('zh-CN')}</p>
  
  <div class="summary">
    <div class="metric">
      <div class="metric-value">${data.endToEndGSNR.toFixed(1)} dB</div>
      <div class="metric-label">端到端 GSNR</div>
    </div>
    <div class="metric">
      <div class="metric-value">${data.gsnrMargin.toFixed(1)} dB</div>
      <div class="metric-label">GSNR 余量</div>
    </div>
    <div class="metric">
      <div class="metric-value">${data.channelCount}</div>
      <div class="metric-label">波道数量</div>
    </div>
  </div>
  
  <p><strong>系统评估:</strong> <span class="status ${data.isFeasible ? 'ok' : 'fail'}">${data.isFeasible ? '满足要求' : '不满足要求'}</span></p>
  
  <h2>各跨段性能</h2>
  <table>
    <tr><th>序号</th><th>KP范围 (km)</th><th>长度 (km)</th><th>GSNR (dB)</th><th>余量 (dB)</th></tr>
    ${spanRows}
  </table>
</body>
</html>`
  }

  // ========== CSV 格式生成 ==========

  private generateCostReportCSV(data: CostReportData): string {
    const lines: string[] = [
      '项目,金额',
      `海缆材料,${data.cableCost}`,
      `放大器设备,${data.repeaterCost}`,
      `分支器设备,${data.branchingUnitCost}`,
      `均衡器设备,${data.equalizerCost}`,
      `终端设备,${data.terminalEquipmentCost}`,
      `人工成本,${data.laborCost}`,
      `勘测成本,${data.surveyingCost}`,
      `船舶租赁,${data.vesselCost}`,
      `安装调试,${data.installationCost}`,
      `许可证费用,${data.permitCost}`,
      `保险费用,${data.insuranceCost}`,
      `应急预算,${data.contingency}`,
      `总计,${data.total}`
    ]
    return lines.join('\n')
  }

  private generatePerformanceReportCSV(data: PerformanceReportData): string {
    const lines: string[] = [
      '序号,KP起点,KP终点,长度(km),GSNR(dB),余量(dB)',
      ...data.spanResults.map(s => 
        `${s.index},${s.kpStart},${s.kpEnd},${s.length},${s.gsnr.toFixed(2)},${s.margin.toFixed(2)}`
      )
    ]
    return lines.join('\n')
  }

  // ========== 辅助方法 ==========

  private formatCurrency(value: number): string {
    if (value >= 1000000) {
      return `$${(value / 1000000).toFixed(this.config.decimalPlaces)}M`
    }
    if (value >= 1000) {
      return `$${(value / 1000).toFixed(0)}K`
    }
    return `$${value.toFixed(0)}`
  }

  private getBottleneckTypeName(type: string): string {
    const names: Record<string, string> = {
      'ase': 'ASE噪声限制',
      'nli': '非线性噪声限制',
      'loss': '链路损耗限制',
      'none': '无瓶颈'
    }
    return names[type] || type
  }

  /**
   * 下载报告
   */
  downloadReport(content: string, filename: string, format: ReportFormat): void {
    let mimeType: string
    switch (format) {
      case 'json':
        mimeType = 'application/json'
        break
      case 'html':
        mimeType = 'text/html'
        break
      case 'csv':
        mimeType = 'text/csv'
        break
      default:
        mimeType = 'text/plain'
    }

    const blob = new Blob([content], { type: `${mimeType};charset=utf-8` })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${filename}.${format}`
    a.click()
    URL.revokeObjectURL(url)
  }

  /**
   * 快速导出成本报告（简化参数）
   */
  exportCostReport(
    params: {
      projectName: string
      totalLength: number
      repeaterCount: number
      branchingUnitCount?: number
      equalizerCount?: number
      terminalEquipmentCount?: number
      cableType: string
      repeaterType: string
      branchingUnitType?: string
      equalizerType?: string
      terminalEquipmentType?: string
      repeaterSpacing: number
      costs: {
        cable: number
        repeater: number
        branchingUnit?: number
        equalizer?: number
        terminalEquipment?: number
        labor: number
        surveying: number
        vessel: number
        installation?: number
        permit?: number
        insurance?: number
        contingency: number
        total: number
      }
    },
    format: ReportFormat = 'txt'
  ): void {
    // 构建完整的 CostReportData
    const data: CostReportData = {
      projectName: params.projectName,
      totalLength: params.totalLength,
      cableCost: params.costs.cable,
      repeaterCost: params.costs.repeater,
      branchingUnitCost: params.costs.branchingUnit || 0,
      equalizerCost: params.costs.equalizer || 0,
      terminalEquipmentCost: params.costs.terminalEquipment || 0,
      laborCost: params.costs.labor,
      surveyingCost: params.costs.surveying,
      vesselCost: params.costs.vessel,
      installationCost: params.costs.installation || 0,
      permitCost: params.costs.permit || 0,
      insuranceCost: params.costs.insurance || 0,
      contingency: params.costs.contingency,
      subtotal: params.costs.total - params.costs.contingency,
      total: params.costs.total,
      costBreakdown: [
        { category: '材料', item: params.cableType + ' 海缆', quantity: params.totalLength, unit: 'km', unitCost: params.costs.cable / Math.max(params.totalLength, 1), totalCost: params.costs.cable, percentage: params.costs.cable / params.costs.total * 100 },
        { category: '设备', item: params.repeaterType + ' 放大器', quantity: params.repeaterCount, unit: '台', unitCost: params.costs.repeater / Math.max(params.repeaterCount, 1), totalCost: params.costs.repeater, percentage: params.costs.repeater / params.costs.total * 100 },
        ...(params.costs.branchingUnit ? [{
          category: '设备',
          item: `${params.branchingUnitType || 'BU'} 分支器`,
          quantity: params.branchingUnitCount || 0,
          unit: '台',
          unitCost: params.costs.branchingUnit / Math.max(params.branchingUnitCount || 1, 1),
          totalCost: params.costs.branchingUnit,
          percentage: params.costs.branchingUnit / params.costs.total * 100
        }] : []),
        ...(params.costs.equalizer ? [{
          category: '设备',
          item: `${params.equalizerType || 'EQ/F-ATT'} 均衡器`,
          quantity: params.equalizerCount || 0,
          unit: '台',
          unitCost: params.costs.equalizer / Math.max(params.equalizerCount || 1, 1),
          totalCost: params.costs.equalizer,
          percentage: params.costs.equalizer / params.costs.total * 100
        }] : []),
        ...(params.costs.terminalEquipment ? [{
          category: '设备',
          item: `${params.terminalEquipmentType || 'Landing'} 终端设备`,
          quantity: params.terminalEquipmentCount || 0,
          unit: '站',
          unitCost: params.costs.terminalEquipment / Math.max(params.terminalEquipmentCount || 1, 1),
          totalCost: params.costs.terminalEquipment,
          percentage: params.costs.terminalEquipment / params.costs.total * 100
        }] : []),
      ]
    }

    const content = this.generateCostReport(data, format)
    const dateStr = new Date().toISOString().split('T')[0]
    this.downloadReport(content, `成本分析报告_${dateStr}`, format)
  }

  /**
   * 快速导出性能报告（简化参数）
   */
  exportPerformanceReport(
    params: {
      projectName: string
      totalLength: number
      repeaterCount: number
      channelCount: number
      centerWavelength: number
      performance: {
        minGSNR: number
        avgGSNR: number
        maxGSNR: number
        minMargin: number
        capacity: number
        wavelengths: number
      }
      bottlenecks?: Array<{ kp: number; issue: string; severity: string }>
    },
    format: ReportFormat = 'txt'
  ): void {
    // 生成模拟跨段数据
    const spanCount = params.repeaterCount + 1
    const spanLength = params.totalLength / spanCount
    const spanResults = Array.from({ length: spanCount }, (_, i) => ({
      index: i + 1,
      kpStart: i * spanLength,
      kpEnd: (i + 1) * spanLength,
      length: spanLength,
      gsnr: params.performance.avgGSNR - (i - spanCount/2) * 0.5,
      margin: params.performance.minMargin + (spanCount/2 - i) * 0.3
    }))

    const data: PerformanceReportData = {
      projectName: params.projectName,
      simulationModel: 'GN',
      simulatedAt: new Date(),
      totalLength: params.totalLength,
      spanCount,
      repeaterCount: params.repeaterCount,
      channelCount: params.channelCount,
      channelSpacing: 50,
      modulationFormat: '16QAM',
      endToEndOSNR: params.performance.avgGSNR + 3,
      endToEndGSNR: params.performance.avgGSNR,
      gsnrMargin: params.performance.minMargin,
      qFactor: 8.5,
      estimatedBER: 1e-15,
      isFeasible: params.performance.minMargin >= 0,
      bottleneckType: params.performance.minMargin < 2 ? 'ase' : 'none',
      recommendations: params.performance.minMargin < 2 
        ? ['建议调整放大器间距', '考虑增加放大器增益']
        : ['系统性能良好'],
      spanResults
    }

    const content = this.generatePerformanceReport(data, format)
    const dateStr = new Date().toISOString().split('T')[0]
    this.downloadReport(content, `性能分析报告_${dateStr}`, format)
  }

  // ========== 可行性报告 ==========

  /**
   * 生成可行性分析报告
   * 综合评估链路性能、成本、EOL 余量是否满足设计要求
   */
  generateFeasibilityReport(params: {
    projectName: string
    totalLengthKm: number
    amplifierCount: number
    buCount: number
    channelCount: number
    modulation: string
    fiberModel: string
    // BOL 性能
    bolGsnr: { min: number; avg: number; max: number }
    bolOsnr: { min: number; avg: number; max: number }
    targetGsnr: number
    // EOL 性能 (可选)
    eol?: {
      designLifeYears: number
      totalPenalty: number
      eolGsnrMin: number
      eolMeetsTarget: boolean
      breakdown?: Array<{ label: string; value: number; description: string }>
    }
    // 成本
    cost?: {
      cableCost: number
      amplifierCost: number
      buCost: number
      totalCost: number
    }
    // 推荐配置
    recommendedSpanKm?: number
    feasibleRange?: [number, number] | null
  }, format: ReportFormat = 'html'): string {
    const p = params
    const bolMargin = p.bolGsnr.min - p.targetGsnr
    const bolFeasible = bolMargin >= 0
    const eolFeasible = p.eol ? p.eol.eolMeetsTarget : null
    const overallFeasible = bolFeasible && (eolFeasible === null || eolFeasible)

    if (format === 'json') {
      return JSON.stringify({
        reportType: 'feasibility',
        generatedAt: new Date().toISOString(),
        project: { name: p.projectName, totalLengthKm: p.totalLengthKm },
        system: { amplifierCount: p.amplifierCount, buCount: p.buCount, channelCount: p.channelCount, modulation: p.modulation, fiberModel: p.fiberModel },
        bol: { gsnr: p.bolGsnr, osnr: p.bolOsnr, margin: bolMargin, feasible: bolFeasible },
        eol: p.eol || null,
        cost: p.cost || null,
        recommendation: { spanKm: p.recommendedSpanKm, feasibleRange: p.feasibleRange },
        overallFeasible,
      }, null, 2)
    }

    // HTML 格式
    const statusBadge = (ok: boolean) => `<span style="padding:3px 10px;border-radius:12px;background:${ok ? '#dcfce7' : '#fee2e2'};color:${ok ? '#166534' : '#991b1b'};font-weight:bold">${ok ? '✅ 达标' : '❌ 不达标'}</span>`

    let eolSection = ''
    if (p.eol) {
      const breakdownRows = (p.eol.breakdown || []).map(b =>
        `<tr><td>${b.label}</td><td style="text-align:right;font-family:monospace">${b.value.toFixed(2)} dB</td><td>${b.description}</td></tr>`
      ).join('\n')
      eolSection = `
      <h2>EOL 老化余量 (${p.eol.designLifeYears} 年)</h2>
      <p><strong>EOL 状态:</strong> ${statusBadge(p.eol.eolMeetsTarget)}</p>
      <p>总退化: <strong>${p.eol.totalPenalty.toFixed(1)} dB</strong>, EOL GSNR min: <strong>${p.eol.eolGsnrMin.toFixed(1)} dB</strong></p>
      ${breakdownRows ? `<table><tr><th>项目</th><th>值</th><th>说明</th></tr>${breakdownRows}</table>` : ''}`
    }

    let costSection = ''
    if (p.cost) {
      costSection = `
      <h2>成本概算</h2>
      <table>
        <tr><td>海缆</td><td style="text-align:right">${this.formatCurrency(p.cost.cableCost)}</td></tr>
        <tr><td>放大器</td><td style="text-align:right">${this.formatCurrency(p.cost.amplifierCost)}</td></tr>
        <tr><td>分支器</td><td style="text-align:right">${this.formatCurrency(p.cost.buCost)}</td></tr>
        <tr style="font-weight:bold;background:#e3f2fd"><td>总计</td><td style="text-align:right">${this.formatCurrency(p.cost.totalCost)}</td></tr>
      </table>`
    }

    return `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8"><title>可行性分析报告 - ${p.projectName}</title>
<style>body{font-family:Arial,sans-serif;max-width:900px;margin:0 auto;padding:20px}h1{color:#333;border-bottom:2px solid #6366f1;padding-bottom:10px}h2{color:#555;margin-top:20px}table{width:100%;border-collapse:collapse;margin:10px 0}th,td{border:1px solid #ddd;padding:8px;text-align:left}th{background:#f5f5f5}.kpi{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:15px 0}.kpi-card{background:#f9fafb;border-radius:8px;padding:12px;text-align:center}.kpi-val{font-size:20px;font-weight:bold;color:#3b82f6}.kpi-lbl{font-size:11px;color:#666}</style></head>
<body>
  <h1>可行性分析报告</h1>
  <p><strong>项目:</strong> ${p.projectName} | <strong>生成时间:</strong> ${new Date().toLocaleString('zh-CN')}</p>
  <p><strong>综合评估:</strong> ${statusBadge(overallFeasible)}</p>

  <h2>系统配置</h2>
  <div class="kpi">
    <div class="kpi-card"><div class="kpi-val">${p.totalLengthKm.toFixed(0)} km</div><div class="kpi-lbl">总长度</div></div>
    <div class="kpi-card"><div class="kpi-val">${p.amplifierCount}</div><div class="kpi-lbl">放大器</div></div>
    <div class="kpi-card"><div class="kpi-val">${p.channelCount}ch</div><div class="kpi-lbl">波道数</div></div>
    <div class="kpi-card"><div class="kpi-val">${p.fiberModel}</div><div class="kpi-lbl">仿真模型</div></div>
  </div>
  ${p.recommendedSpanKm ? `<p>推荐 Span: <strong>${p.recommendedSpanKm} km</strong>${p.feasibleRange ? ` (可行区间: ${p.feasibleRange[0]}-${p.feasibleRange[1]} km)` : ''}</p>` : ''}

  <h2>BOL 性能</h2>
  <p>BOL 状态: ${statusBadge(bolFeasible)} | GSNR 余量: <strong>${bolMargin.toFixed(1)} dB</strong></p>
  <div class="kpi">
    <div class="kpi-card"><div class="kpi-val">${p.bolGsnr.min.toFixed(1)} dB</div><div class="kpi-lbl">GSNR min</div></div>
    <div class="kpi-card"><div class="kpi-val">${p.bolGsnr.avg.toFixed(1)} dB</div><div class="kpi-lbl">GSNR avg</div></div>
    <div class="kpi-card"><div class="kpi-val">${p.bolOsnr.avg.toFixed(1)} dB</div><div class="kpi-lbl">OSNR avg</div></div>
    <div class="kpi-card"><div class="kpi-val">${p.targetGsnr.toFixed(1)} dB</div><div class="kpi-lbl">目标 GSNR</div></div>
  </div>

  ${eolSection}
  ${costSection}

  <hr><p style="color:#999;font-size:11px">报告由海底光缆智能规划系统自动生成</p>
</body></html>`
  }

  /**
   * 导出可行性报告
   */
  exportFeasibilityReport(params: Parameters<ReportExportService['generateFeasibilityReport']>[0], format: ReportFormat = 'html'): void {
    const content = this.generateFeasibilityReport(params, format)
    const dateStr = new Date().toISOString().split('T')[0]
    this.downloadReport(content, `可行性分析报告_${dateStr}`, format)
  }
}

// 导出单例
export const reportExportService = new ReportExportService()
