/**
 * 器件导入解析服务
 * 支持 Excel/JSON/CSV 格式导入器件参数
 */

import type { FiberType, AmplifierType, BranchingUnitType } from '@/types/settings'

// 导入结果
export interface ImportResult {
  success: boolean
  fiberTypes: FiberType[]
  amplifierTypes: AmplifierType[]
  branchingUnitTypes: BranchingUnitType[]
  errors: ImportError[]
  warnings: string[]
  summary: ImportSummary
}

// 导入错误
export interface ImportError {
  row?: number
  field?: string
  message: string
  type: 'error' | 'warning'
}

// 导入摘要
export interface ImportSummary {
  totalRows: number
  successCount: number
  errorCount: number
  fiberCount: number
  amplifierCount: number
  branchingUnitCount: number
}

// 支持的文件类型
export type ImportFileType = 'json' | 'csv' | 'xlsx'

/**
 * 器件导入服务
 */
export class DeviceImportService {
  /**
   * 检测文件类型
   */
  detectFileType(filename: string): ImportFileType | null {
    const ext = filename.split('.').pop()?.toLowerCase()
    if (ext === 'json') return 'json'
    if (ext === 'csv') return 'csv'
    if (ext === 'xlsx' || ext === 'xls') return 'xlsx'
    return null
  }

  /**
   * 导入文件
   */
  async importFile(file: File): Promise<ImportResult> {
    const fileType = this.detectFileType(file.name)
    
    if (!fileType) {
      return {
        success: false,
        fiberTypes: [],
        amplifierTypes: [],
        branchingUnitTypes: [],
        errors: [{ message: '不支持的文件格式，请使用 JSON、CSV 或 Excel 文件', type: 'error' }],
        warnings: [],
        summary: { totalRows: 0, successCount: 0, errorCount: 1, fiberCount: 0, amplifierCount: 0, branchingUnitCount: 0 }
      }
    }

    try {
      const text = await file.text()
      
      switch (fileType) {
        case 'json':
          return this.parseJSON(text)
        case 'csv':
          return this.parseCSV(text)
        case 'xlsx':
          return this.parseExcel(file)
        default:
          throw new Error('未知文件类型')
      }
    } catch (error) {
      return {
        success: false,
        fiberTypes: [],
        amplifierTypes: [],
        branchingUnitTypes: [],
        errors: [{ message: `解析文件失败: ${(error as Error).message}`, type: 'error' }],
        warnings: [],
        summary: { totalRows: 0, successCount: 0, errorCount: 1, fiberCount: 0, amplifierCount: 0, branchingUnitCount: 0 }
      }
    }
  }

  /**
   * 解析 JSON 格式
   */
  private parseJSON(content: string): ImportResult {
    const errors: ImportError[] = []
    const warnings: string[] = []
    
    let data: any
    try {
      data = JSON.parse(content)
    } catch (e) {
      return {
        success: false,
        fiberTypes: [],
        amplifierTypes: [],
        branchingUnitTypes: [],
        errors: [{ message: 'JSON 格式错误', type: 'error' }],
        warnings: [],
        summary: { totalRows: 0, successCount: 0, errorCount: 1, fiberCount: 0, amplifierCount: 0, branchingUnitCount: 0 }
      }
    }

    const fiberTypes: FiberType[] = []
    const amplifierTypes: AmplifierType[] = []
    const branchingUnitTypes: BranchingUnitType[] = []

    // 解析光纤类型
    if (Array.isArray(data.fiberTypes)) {
      for (let i = 0; i < data.fiberTypes.length; i++) {
        const fiber = this.parseFiberType(data.fiberTypes[i], i + 1, errors)
        if (fiber) fiberTypes.push(fiber)
      }
    }

    // 解析放大器类型
    if (Array.isArray(data.amplifierTypes)) {
      for (let i = 0; i < data.amplifierTypes.length; i++) {
        const amp = this.parseAmplifierType(data.amplifierTypes[i], i + 1, errors)
        if (amp) amplifierTypes.push(amp)
      }
    }

    // 解析分支器类型
    if (Array.isArray(data.branchingUnitTypes)) {
      for (let i = 0; i < data.branchingUnitTypes.length; i++) {
        const bu = this.parseBranchingUnitType(data.branchingUnitTypes[i], i + 1, errors)
        if (bu) branchingUnitTypes.push(bu)
      }
    }

    const totalRows = (data.fiberTypes?.length || 0) + (data.amplifierTypes?.length || 0) + (data.branchingUnitTypes?.length || 0)
    const successCount = fiberTypes.length + amplifierTypes.length + branchingUnitTypes.length

    return {
      success: errors.filter(e => e.type === 'error').length === 0,
      fiberTypes,
      amplifierTypes,
      branchingUnitTypes,
      errors,
      warnings,
      summary: {
        totalRows,
        successCount,
        errorCount: totalRows - successCount,
        fiberCount: fiberTypes.length,
        amplifierCount: amplifierTypes.length,
        branchingUnitCount: branchingUnitTypes.length
      }
    }
  }

  /**
   * 解析 CSV 格式
   */
  private parseCSV(content: string): ImportResult {
    const errors: ImportError[] = []
    const warnings: string[] = []
    
    const lines = content.split('\n').map(line => line.trim()).filter(line => line)
    if (lines.length < 2) {
      return {
        success: false,
        fiberTypes: [],
        amplifierTypes: [],
        branchingUnitTypes: [],
        errors: [{ message: 'CSV 文件为空或格式错误', type: 'error' }],
        warnings: [],
        summary: { totalRows: 0, successCount: 0, errorCount: 1, fiberCount: 0, amplifierCount: 0, branchingUnitCount: 0 }
      }
    }

    const headers = this.parseCSVLine(lines[0])
    const fiberTypes: FiberType[] = []
    const amplifierTypes: AmplifierType[] = []
    const branchingUnitTypes: BranchingUnitType[] = []

    for (let i = 1; i < lines.length; i++) {
      const values = this.parseCSVLine(lines[i])
      const row: Record<string, string> = {}
      
      for (let j = 0; j < headers.length; j++) {
        row[headers[j]] = values[j] || ''
      }

      // 根据类型字段分类
      const type = row['type'] || row['类型'] || ''
      
      if (type === 'fiber' || type === '光纤') {
        const fiber = this.parseFiberTypeFromRow(row, i + 1, errors)
        if (fiber) fiberTypes.push(fiber)
      } else if (type === 'amplifier' || type === '放大器') {
        const amp = this.parseAmplifierTypeFromRow(row, i + 1, errors)
        if (amp) amplifierTypes.push(amp)
      } else if (type === 'branching' || type === '分支器') {
        const bu = this.parseBranchingUnitTypeFromRow(row, i + 1, errors)
        if (bu) branchingUnitTypes.push(bu)
      } else {
        warnings.push(`第 ${i + 1} 行: 未知类型 "${type}"，已跳过`)
      }
    }

    const totalRows = lines.length - 1
    const successCount = fiberTypes.length + amplifierTypes.length + branchingUnitTypes.length

    return {
      success: errors.filter(e => e.type === 'error').length === 0,
      fiberTypes,
      amplifierTypes,
      branchingUnitTypes,
      errors,
      warnings,
      summary: {
        totalRows,
        successCount,
        errorCount: totalRows - successCount,
        fiberCount: fiberTypes.length,
        amplifierCount: amplifierTypes.length,
        branchingUnitCount: branchingUnitTypes.length
      }
    }
  }

  /**
   * 解析 Excel 格式 (简化实现，实际需要使用xlsx库)
   */
  private async parseExcel(file: File): Promise<ImportResult> {
    // 由于没有xlsx库，这里返回提示信息
    // 实际实现需要引入xlsx库
    return {
      success: false,
      fiberTypes: [],
      amplifierTypes: [],
      branchingUnitTypes: [],
      errors: [{ 
        message: 'Excel 导入需要先安装 xlsx 库。请使用 JSON 或 CSV 格式，或运行 npm install xlsx', 
        type: 'error' 
      }],
      warnings: ['建议使用 JSON 格式导入，支持更完整的数据结构'],
      summary: { totalRows: 0, successCount: 0, errorCount: 1, fiberCount: 0, amplifierCount: 0, branchingUnitCount: 0 }
    }
  }

  /**
   * 解析 CSV 行
   */
  private parseCSVLine(line: string): string[] {
    const result: string[] = []
    let current = ''
    let inQuotes = false
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i]
      
      if (char === '"') {
        inQuotes = !inQuotes
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim())
        current = ''
      } else {
        current += char
      }
    }
    result.push(current.trim())
    
    return result
  }

  /**
   * 解析光纤类型
   */
  private parseFiberType(data: any, row: number, errors: ImportError[]): FiberType | null {
    if (!data.name && !data.id) {
      errors.push({ row, message: '光纤类型缺少名称或ID', type: 'error' })
      return null
    }

    return {
      id: data.id || `fiber-${Date.now()}-${row}`,
      name: data.name || data.id,
      nonlinearCoeff: this.parseNumber(data.nonlinearCoeff, 1.4),
      effectiveArea: this.parseNumber(data.effectiveArea, 80),
      dispersion: this.parseNumber(data.dispersion, 17),
      nonlinearRefractiveIndex: this.parseNumber(data.nonlinearRefractiveIndex, 2.6),
      attenuationCoeff: this.parseNumber(data.attenuationCoeff, 0.2),
      secondOrderDispersion: this.parseNumber(data.secondOrderDispersion, -21),
      simulationModel: data.simulationModel || 'GN'
    }
  }

  /**
   * 解析放大器类型
   */
  private parseAmplifierType(data: any, row: number, errors: ImportError[]): AmplifierType | null {
    if (!data.name && !data.id) {
      errors.push({ row, message: '放大器类型缺少名称或ID', type: 'error' })
      return null
    }

    return {
      id: data.id || `amp-${Date.now()}-${row}`,
      name: data.name || data.id,
      gain: this.parseNumber(data.gain, 20),
      bandwidth: this.parseNumber(data.bandwidth, 1550),
      gainFlatness: this.parseNumber(data.gainFlatness, 0.5),
      noiseFigure: this.parseNumber(data.noiseFigure, 5),
      pumpPower: this.parseNumber(data.pumpPower, 100),
      outputPower: this.parseNumber(data.outputPower, 17),
      gainRangePower: this.parseNumber(data.gainRangePower, 0.1)
    }
  }

  /**
   * 解析分支器类型
   */
  private parseBranchingUnitType(data: any, row: number, errors: ImportError[]): BranchingUnitType | null {
    if (!data.name && !data.id) {
      errors.push({ row, message: '分支器类型缺少名称或ID', type: 'error' })
      return null
    }

    return {
      id: data.id || `bu-${Date.now()}-${row}`,
      name: data.name || data.id,
      portCount: this.parseNumber(data.portCount, 3),
      insertionLoss: this.parseNumber(data.insertionLoss, 0.5),
      wavelengthRange: this.parseNumber(data.wavelengthRange, 1550)
    }
  }

  /**
   * 从CSV行解析光纤类型
   */
  private parseFiberTypeFromRow(row: Record<string, string>, rowNum: number, errors: ImportError[]): FiberType | null {
    const name = row['name'] || row['名称'] || ''
    if (!name) {
      errors.push({ row: rowNum, message: '光纤类型缺少名称', type: 'error' })
      return null
    }

    return {
      id: row['id'] || `fiber-${Date.now()}-${rowNum}`,
      name,
      nonlinearCoeff: this.parseNumber(row['nonlinearCoeff'] || row['非线性系数'], 1.4),
      effectiveArea: this.parseNumber(row['effectiveArea'] || row['有效面积'], 80),
      dispersion: this.parseNumber(row['dispersion'] || row['色散'], 17),
      nonlinearRefractiveIndex: this.parseNumber(row['nonlinearRefractiveIndex'] || row['非线性折射率'], 2.6),
      attenuationCoeff: this.parseNumber(row['attenuationCoeff'] || row['衰减系数'], 0.2),
      secondOrderDispersion: this.parseNumber(row['secondOrderDispersion'] || row['二阶色散'], -21),
      simulationModel: (row['simulationModel'] || row['仿真模型'] || 'GN') as 'GN' | 'EGN'
    }
  }

  /**
   * 从CSV行解析放大器类型
   */
  private parseAmplifierTypeFromRow(row: Record<string, string>, rowNum: number, errors: ImportError[]): AmplifierType | null {
    const name = row['name'] || row['名称'] || ''
    if (!name) {
      errors.push({ row: rowNum, message: '放大器类型缺少名称', type: 'error' })
      return null
    }

    return {
      id: row['id'] || `amp-${Date.now()}-${rowNum}`,
      name,
      gain: this.parseNumber(row['gain'] || row['增益'], 20),
      bandwidth: this.parseNumber(row['bandwidth'] || row['带宽'], 1550),
      gainFlatness: this.parseNumber(row['gainFlatness'] || row['增益平坦度'], 0.5),
      noiseFigure: this.parseNumber(row['noiseFigure'] || row['噪声系数'], 5),
      pumpPower: this.parseNumber(row['pumpPower'] || row['泵浦功率'], 100),
      outputPower: this.parseNumber(row['outputPower'] || row['输出功率'], 17),
      gainRangePower: this.parseNumber(row['gainRangePower'] || row['增益范围功率'], 0.1)
    }
  }

  /**
   * 从CSV行解析分支器类型
   */
  private parseBranchingUnitTypeFromRow(row: Record<string, string>, rowNum: number, errors: ImportError[]): BranchingUnitType | null {
    const name = row['name'] || row['名称'] || ''
    if (!name) {
      errors.push({ row: rowNum, message: '分支器类型缺少名称', type: 'error' })
      return null
    }

    return {
      id: row['id'] || `bu-${Date.now()}-${rowNum}`,
      name,
      portCount: this.parseNumber(row['portCount'] || row['端口数'], 3),
      insertionLoss: this.parseNumber(row['insertionLoss'] || row['插损'], 0.5),
      wavelengthRange: this.parseNumber(row['wavelengthRange'] || row['波长范围'], 1550)
    }
  }

  /**
   * 解析数字，带默认值
   */
  private parseNumber(value: any, defaultValue: number): number {
    if (value === undefined || value === null || value === '') {
      return defaultValue
    }
    const num = parseFloat(String(value))
    return isNaN(num) ? defaultValue : num
  }

  /**
   * 生成模板 JSON
   */
  generateTemplateJSON(): string {
    const template = {
      fiberTypes: [
        {
          id: 'fiber-smf28',
          name: 'SMF-28e+',
          nonlinearCoeff: 1.3,
          effectiveArea: 82,
          dispersion: 17,
          nonlinearRefractiveIndex: 2.6,
          attenuationCoeff: 0.18,
          secondOrderDispersion: -21.7,
          simulationModel: 'GN'
        }
      ],
      amplifierTypes: [
        {
          id: 'amp-edfa-1',
          name: 'EDFA-C-Band',
          gain: 20,
          bandwidth: 1550,
          gainFlatness: 0.5,
          noiseFigure: 5,
          pumpPower: 100,
          outputPower: 17,
          gainRangePower: 0.1
        }
      ],
      branchingUnitTypes: [
        {
          id: 'bu-3port',
          name: '3端口分支器',
          portCount: 3,
          insertionLoss: 0.5,
          wavelengthRange: 1550
        }
      ]
    }
    return JSON.stringify(template, null, 2)
  }

  /**
   * 生成模板 CSV
   */
  generateTemplateCSV(): string {
    const headers = 'type,id,name,nonlinearCoeff,effectiveArea,dispersion,attenuationCoeff,gain,noiseFigure,portCount,insertionLoss'
    const rows = [
      'fiber,fiber-1,SMF-28,1.3,82,17,0.18,,,,',
      'amplifier,amp-1,EDFA-1,,,,20,5,,,',
      'branching,bu-1,BU-3Port,,,,,,,3,0.5'
    ]
    return [headers, ...rows].join('\n')
  }
}

// 导出单例
export const deviceImportService = new DeviceImportService()
