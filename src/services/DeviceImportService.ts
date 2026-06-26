/**
 * 器件导入解析服务
 * 支持 Excel/JSON/CSV 格式导入器件参数
 */

import type { FiberType, AmplifierType, BranchingUnitType, EqualizerType, JointBoxType } from '@/types/settings'
import { deviceLibraryItemToPlatform } from '@/services/platform/deviceLibraryMapping'

// 导入结果
export interface ImportResult {
  success: boolean
  fiberTypes: FiberType[]
  amplifierTypes: AmplifierType[]
  branchingUnitTypes: BranchingUnitType[]
  equalizerTypes: EqualizerType[]
  jointBoxTypes: JointBoxType[]
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
  equalizerCount: number
  jointCount: number
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
        fiberTypes: [], amplifierTypes: [], branchingUnitTypes: [],
        equalizerTypes: [], jointBoxTypes: [],
        errors: [{ message: '不支持的文件格式，请使用 JSON、CSV 或 Excel 文件', type: 'error' }],
        warnings: [],
        summary: { totalRows: 0, successCount: 0, errorCount: 1, fiberCount: 0, amplifierCount: 0, branchingUnitCount: 0, equalizerCount: 0, jointCount: 0 }
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
        fiberTypes: [], amplifierTypes: [], branchingUnitTypes: [],
        equalizerTypes: [], jointBoxTypes: [],
        errors: [{ message: `解析文件失败: ${(error as Error).message}`, type: 'error' }],
        warnings: [],
        summary: { totalRows: 0, successCount: 0, errorCount: 1, fiberCount: 0, amplifierCount: 0, branchingUnitCount: 0, equalizerCount: 0, jointCount: 0 }
      }
    }
  }

  /**
   * 解析 JSON 格式
   */
  private parseJSON(content: string): ImportResult {
    const errors: ImportError[] = []
    const warnings: string[] = []
    
    let data: { fiberTypes?: unknown[]; amplifierTypes?: unknown[]; branchingUnitTypes?: unknown[]; equalizerTypes?: unknown[]; jointBoxTypes?: unknown[] }
    try {
      data = JSON.parse(content)
    } catch (e) {
      return {
        success: false,
        fiberTypes: [], amplifierTypes: [], branchingUnitTypes: [],
        equalizerTypes: [], jointBoxTypes: [],
        errors: [{ message: 'JSON 格式错误', type: 'error' }],
        warnings: [],
        summary: { totalRows: 0, successCount: 0, errorCount: 1, fiberCount: 0, amplifierCount: 0, branchingUnitCount: 0, equalizerCount: 0, jointCount: 0 }
      }
    }

    const fiberTypes: FiberType[] = []
    const amplifierTypes: AmplifierType[] = []
    const branchingUnitTypes: BranchingUnitType[] = []
    const equalizerTypes: EqualizerType[] = []
    const jointBoxTypes: JointBoxType[] = []

    if (Array.isArray(data.fiberTypes)) {
      for (let i = 0; i < data.fiberTypes.length; i++) {
        const fiber = this.parseFiberType(data.fiberTypes[i] as Record<string, unknown>, i + 1, errors)
        if (fiber) fiberTypes.push(fiber)
      }
    }
    if (Array.isArray(data.amplifierTypes)) {
      for (let i = 0; i < data.amplifierTypes.length; i++) {
        const amp = this.parseAmplifierType(data.amplifierTypes[i] as Record<string, unknown>, i + 1, errors)
        if (amp) amplifierTypes.push(amp)
      }
    }
    if (Array.isArray(data.branchingUnitTypes)) {
      for (let i = 0; i < data.branchingUnitTypes.length; i++) {
        const bu = this.parseBranchingUnitType(data.branchingUnitTypes[i] as Record<string, unknown>, i + 1, errors)
        if (bu) branchingUnitTypes.push(bu)
      }
    }
    if (Array.isArray(data.equalizerTypes)) {
      for (let i = 0; i < data.equalizerTypes.length; i++) {
        const eq = this.parseEqualizerType(data.equalizerTypes[i] as Record<string, unknown>, i + 1, errors)
        if (eq) equalizerTypes.push(eq)
      }
    }
    if (Array.isArray(data.jointBoxTypes)) {
      for (let i = 0; i < data.jointBoxTypes.length; i++) {
        const jb = this.parseJointBoxType(data.jointBoxTypes[i] as Record<string, unknown>, i + 1, errors)
        if (jb) jointBoxTypes.push(jb)
      }
    }

    const totalRows = (data.fiberTypes?.length ?? 0) + (data.amplifierTypes?.length ?? 0) + (data.branchingUnitTypes?.length ?? 0) + (data.equalizerTypes?.length ?? 0) + (data.jointBoxTypes?.length ?? 0)
    const successCount = fiberTypes.length + amplifierTypes.length + branchingUnitTypes.length + equalizerTypes.length + jointBoxTypes.length

    return {
      success: errors.filter(e => e.type === 'error').length === 0,
      fiberTypes, amplifierTypes, branchingUnitTypes, equalizerTypes, jointBoxTypes,
      errors, warnings,
      summary: { totalRows, successCount, errorCount: totalRows - successCount,
        fiberCount: fiberTypes.length, amplifierCount: amplifierTypes.length,
        branchingUnitCount: branchingUnitTypes.length,
        equalizerCount: equalizerTypes.length, jointCount: jointBoxTypes.length }
    }
  }

  /**
   * 解析 CSV 格式（支持 [Section] 分区格式和带 type 列的平标格式）
   */
  private parseCSV(content: string): ImportResult {
    const errors: ImportError[] = []
    const warnings: string[] = []

    const fiberTypes: FiberType[] = []
    const amplifierTypes: AmplifierType[] = []
    const branchingUnitTypes: BranchingUnitType[] = []
    const equalizerTypes: EqualizerType[] = []
    const jointBoxTypes: JointBoxType[] = []

    const rawLines = content.split('\n').map(l => l.trim().replace(/\r$/, ''))

    // 检测是否为分区格式
    const isSectioned = rawLines.some(l => /^\[\w+\]$/.test(l))

    if (isSectioned) {
      // 分区式解析：[FiberTypes] [AmplifierTypes] [BranchingUnitTypes] [EqualizerTypes] [JointBoxTypes]
      let currentSection = ''
      let headers: string[] = []
      let rowNum = 0

      for (const line of rawLines) {
        if (!line) continue
        if (/^\[\w+\]$/.test(line)) {
          currentSection = line.slice(1, -1)
          headers = []
          continue
        }
        if (headers.length === 0) {
          headers = this.parseCSVLine(line)
          continue
        }
        rowNum++
        const values = this.parseCSVLine(line)
        const row: Record<string, string> = {}
        headers.forEach((h, i) => { row[h] = values[i] || '' })

        if (currentSection === 'FiberTypes') {
          const r = this.parseFiberTypeFromRow(row, rowNum, errors); if (r) fiberTypes.push(r)
        } else if (currentSection === 'AmplifierTypes') {
          const r = this.parseAmplifierTypeFromRow(row, rowNum, errors); if (r) amplifierTypes.push(r)
        } else if (currentSection === 'BranchingUnitTypes') {
          const r = this.parseBranchingUnitTypeFromRow(row, rowNum, errors); if (r) branchingUnitTypes.push(r)
        } else if (currentSection === 'EqualizerTypes') {
          const r = this.parseEqualizerTypeFromRow(row, rowNum, errors); if (r) equalizerTypes.push(r)
        } else if (currentSection === 'JointBoxTypes') {
          const r = this.parseJointBoxTypeFromRow(row, rowNum, errors); if (r) jointBoxTypes.push(r)
        }
      }
    } else {
      // 平标式解析（type 列分类）
      const lines = rawLines.filter(l => l)
      if (lines.length < 2) {
        return {
          success: false, fiberTypes: [], amplifierTypes: [], branchingUnitTypes: [],
          equalizerTypes: [], jointBoxTypes: [],
          errors: [{ message: 'CSV 文件为空或格式错误', type: 'error' }],
          warnings: [],
          summary: { totalRows: 0, successCount: 0, errorCount: 1, fiberCount: 0, amplifierCount: 0, branchingUnitCount: 0, equalizerCount: 0, jointCount: 0 }
        }
      }
      const headers = this.parseCSVLine(lines[0])
      for (let i = 1; i < lines.length; i++) {
        const values = this.parseCSVLine(lines[i])
        const row: Record<string, string> = {}
        headers.forEach((h, j) => { row[h] = values[j] || '' })
        const type = row['type'] || row['类型'] || ''
        if (type === 'fiber' || type === '光纤') {
          const r = this.parseFiberTypeFromRow(row, i + 1, errors); if (r) fiberTypes.push(r)
        } else if (type === 'amplifier' || type === '放大器') {
          const r = this.parseAmplifierTypeFromRow(row, i + 1, errors); if (r) amplifierTypes.push(r)
        } else if (type === 'branching' || type === '分支器') {
          const r = this.parseBranchingUnitTypeFromRow(row, i + 1, errors); if (r) branchingUnitTypes.push(r)
        } else if (type === 'equalizer' || type === '均衡器') {
          const r = this.parseEqualizerTypeFromRow(row, i + 1, errors); if (r) equalizerTypes.push(r)
        } else if (type === 'joint' || type === '接头盒') {
          const r = this.parseJointBoxTypeFromRow(row, i + 1, errors); if (r) jointBoxTypes.push(r)
        } else {
          warnings.push(`第 ${i + 1} 行: 未知类型 "${type}"，已跳过`)
        }
      }
    }

    const totalRows = fiberTypes.length + amplifierTypes.length + branchingUnitTypes.length + equalizerTypes.length + jointBoxTypes.length
    return {
      success: errors.filter(e => e.type === 'error').length === 0,
      fiberTypes, amplifierTypes, branchingUnitTypes, equalizerTypes, jointBoxTypes,
      errors, warnings,
      summary: { totalRows, successCount: totalRows, errorCount: errors.filter(e => e.type === 'error').length,
        fiberCount: fiberTypes.length, amplifierCount: amplifierTypes.length,
        branchingUnitCount: branchingUnitTypes.length,
        equalizerCount: equalizerTypes.length, jointCount: jointBoxTypes.length }
    }
  }

  /**
   * 解析 Excel 格式
   */
  private async parseExcel(_file: File): Promise<ImportResult> {
    return {
      success: false,
      fiberTypes: [], amplifierTypes: [], branchingUnitTypes: [],
      equalizerTypes: [], jointBoxTypes: [],
      errors: [{ 
        message: 'Excel 导入请使用 JSON 或 CSV 格式', 
        type: 'error' 
      }],
      warnings: [],
      summary: { totalRows: 0, successCount: 0, errorCount: 1, fiberCount: 0, amplifierCount: 0, branchingUnitCount: 0, equalizerCount: 0, jointCount: 0 }
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
  private parseFiberType(data: Record<string, unknown>, row: number, errors: ImportError[]): FiberType | null {
    if (!data['name'] && !data['id']) {
      errors.push({ row, message: '光纤类型缺少名称或ID', type: 'error' })
      return null
    }

    return {
      id: String(data['id'] || `fiber-${Date.now()}-${row}`),
      name: String(data['name'] || data['id']),
      nonlinearCoeff: this.parseNumber(data['nonlinearCoeff'], 1.4),
      effectiveArea: this.parseNumber(data['effectiveArea'], 80),
      dispersion: this.parseNumber(data['dispersion'], 17),
      nonlinearRefractiveIndex: this.parseNumber(data['nonlinearRefractiveIndex'], 2.6),
      attenuationCoeff: this.parseNumber(data['attenuationCoeff'], 0.2),
      secondOrderDispersion: this.parseNumber(data['secondOrderDispersion'], -21),
      simulationModel: (data['simulationModel'] as 'GN' | 'EGN') || 'GN'
    }
  }

  /**
   * 解析放大器类型
   */
  private parseAmplifierType(data: Record<string, unknown>, row: number, errors: ImportError[]): AmplifierType | null {
    if (!data['name'] && !data['id']) {
      errors.push({ row, message: '放大器类型缺少名称或ID', type: 'error' })
      return null
    }

    return {
      id: String(data['id'] || `amp-${Date.now()}-${row}`),
      name: String(data['name'] || data['id']),
      gain: this.parseNumber(data['gain'], 20),
      bandwidth: this.parseNumber(data['bandwidth'], 1550),
      gainFlatness: this.parseNumber(data['gainFlatness'], 0.5),
      noiseFigure: this.parseNumber(data['noiseFigure'], 5),
      pumpPower: this.parseNumber(data['pumpPower'], 100),
      outputPower: this.parseNumber(data['outputPower'], 17),
      gainRangePower: this.parseNumber(data['gainRangePower'], 0.1)
    }
  }

  /**
   * 解析分支器类型
   */
  private parseBranchingUnitType(data: Record<string, unknown>, row: number, errors: ImportError[]): BranchingUnitType | null {
    if (!data['name'] && !data['id']) {
      errors.push({ row, message: '分支器类型缺少名称或ID', type: 'error' })
      return null
    }
    return {
      id: String(data['id'] || `bu-${Date.now()}-${row}`),
      name: String(data['name'] || data['id']),
      portCount: this.parseNumber(data['portCount'], 3),
      trunkInsertionLoss: this.parseNumber(data['trunkInsertionLoss'], 0.5),
      branchInsertionLoss: this.parseNumber(data['branchInsertionLoss'], 3.0),
      insertionLoss: this.parseNumber(data['insertionLoss'], 0.5),
      wavelengthRange: this.parseNumber(data['wavelengthRange'], 1550)
    }
  }

  /**
   * 解析均衡器类型 (JSON)
   */
  private parseEqualizerType(data: Record<string, unknown>, row: number, errors: ImportError[]): EqualizerType | null {
    if (!data['name']) {
      errors.push({ row, message: '均衡器类型缺少名称', type: 'error' })
      return null
    }
    return {
      id: String(data['id'] || `eq-${Date.now()}-${row}`),
      name: String(data['name']),
      attenuationMode: (data['attenuationMode'] as 'adjustable' | 'fixed') || 'adjustable',
      defaultAttenuationDb: this.parseNumber(data['defaultAttenuationDb'], 0),
      unitPrice: data['unitPrice'] !== undefined ? this.parseNumber(data['unitPrice'], 0) : undefined,
      currency: (data['currency'] as 'USD' | 'CNY' | 'EUR') || 'USD',
      remarks: String(data['remarks'] || '')
    }
  }

  /**
   * 解析接头盒型号 (JSON)
   */
  private parseJointBoxType(data: Record<string, unknown>, row: number, errors: ImportError[]): JointBoxType | null {
    if (!data['name']) {
      errors.push({ row, message: '接头盒类型缺少名称', type: 'error' })
      return null
    }
    return {
      id: String(data['id'] || `jb-${Date.now()}-${row}`),
      name: String(data['name']),
      insertionLoss: this.parseNumber(data['insertionLoss'], 0),
      maxFiberPairs: data['maxFiberPairs'] !== undefined ? this.parseNumber(data['maxFiberPairs'], 0) : undefined,
      unitPrice: data['unitPrice'] !== undefined ? this.parseNumber(data['unitPrice'], 0) : undefined,
      currency: (data['currency'] as 'USD' | 'CNY' | 'EUR') || 'USD',
      remarks: String(data['remarks'] || '')
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
   * 从 CSV行解析分支器类型
   */
  private parseBranchingUnitTypeFromRow(row: Record<string, string>, rowNum: number, errors: ImportError[]): BranchingUnitType | null {
    const name = row['name'] || row['名称'] || ''
    if (!name) {
      errors.push({ row: rowNum, message: '分支器类型缺少名称', type: 'error' })
      return null
    }
    const rawSubType = row['subType'] || row['子类型'] || ''
    const validBuSubTypes = ['BU', 'ROADM', 'OADM']
    return {
      id: row['id'] || `bu-${Date.now()}-${rowNum}`,
      name,
      subType: validBuSubTypes.includes(rawSubType) ? rawSubType as 'BU' | 'ROADM' | 'OADM' : 'BU',
      portCount: this.parseNumber(row['portCount'] || row['端口数'], 3),
      trunkInsertionLoss: this.parseNumber(row['trunkInsertionLoss'] || row['主干插损'], 0.5),
      branchInsertionLoss: this.parseNumber(row['branchInsertionLoss'] || row['分支插损'], 3.0),
      insertionLoss: this.parseNumber(row['insertionLoss'] || row['插损'], 0.5),
      wavelengthRange: this.parseNumber(row['wavelengthRange'] || row['波长范围'], 1550)
    }
  }

  /**
   * 从 CSV行解析均衡器型号
   */
  private parseEqualizerTypeFromRow(row: Record<string, string>, rowNum: number, errors: ImportError[]): EqualizerType | null {
    const name = row['name'] || row['型号名称'] || ''
    if (!name) {
      errors.push({ row: rowNum, message: '均衡器缺少型号名称', type: 'error' })
      return null
    }
    const mode = row['attenuationMode'] || row['光衰模式'] || 'adjustable'
    return {
      id: row['id'] || `eq-${Date.now()}-${rowNum}`,
      name,
      attenuationMode: (mode === 'fixed' || mode === '固定') ? 'fixed' : 'adjustable',
      defaultAttenuationDb: this.parseNumber(row['defaultAttenuationDb'] || row['默认光衰値'], 0),
      unitPrice: row['unitPrice'] ? this.parseNumber(row['unitPrice'], 0) : undefined,
      currency: (row['currency'] || 'USD') as 'USD' | 'CNY' | 'EUR',
      remarks: row['remarks'] || row['备注'] || ''
    }
  }

  /**
   * 从 CSV行解析接头盒型号
   */
  private parseJointBoxTypeFromRow(row: Record<string, string>, rowNum: number, errors: ImportError[]): JointBoxType | null {
    const name = row['name'] || row['型号名称'] || ''
    if (!name) {
      errors.push({ row: rowNum, message: '接头盒缺少型号名称', type: 'error' })
      return null
    }
    const rawSubType = row['subType'] || row['子类型'] || ''
    const validJbSubTypes = ['BJB', 'SEJB', 'BUJB', 'SJB', 'FJB', 'LIJB']
    return {
      id: row['id'] || `jb-${Date.now()}-${rowNum}`,
      name,
      subType: validJbSubTypes.includes(rawSubType) ? rawSubType as 'BJB' | 'SEJB' | 'BUJB' | 'SJB' | 'FJB' | 'LIJB' : 'SJB',
      insertionLoss: this.parseNumber(row['insertionLoss'] || row['插损'], 0),
      maxFiberPairs: row['maxFiberPairs'] ? this.parseNumber(row['maxFiberPairs'], 0) : undefined,
      unitPrice: row['unitPrice'] ? this.parseNumber(row['unitPrice'], 0) : undefined,
      currency: (row['currency'] || 'USD') as 'USD' | 'CNY' | 'EUR',
      remarks: row['remarks'] || row['备注'] || ''
    }
  }

  /**
   * 解析数字，带默认値
   */
  private parseNumber(value: unknown, defaultValue: number): number {
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
        { id: 'fiber-smf28', name: 'SMF-28e+', nonlinearCoeff: 1.3, effectiveArea: 82,
          dispersion: 17, nonlinearRefractiveIndex: 2.6, attenuationCoeff: 0.18,
          secondOrderDispersion: -21.7, simulationModel: 'GN' }
      ],
      amplifierTypes: [
        { id: 'amp-edfa-1', name: 'EDFA-C 标准型', gain: 18, bandwidth: 35,
          gainFlatness: 0.5, noiseFigure: 5.5, pumpPower: 200, outputPower: 17,
          saturationPower: 20, gainRangePower: 15, operatingMode: 'fixed_gain',
          unitPrice: 25000, currency: 'USD' }
      ],
      branchingUnitTypes: [
        { id: 'bu-3port', name: 'BU-3P 标准型', portCount: 3,
          trunkInsertionLoss: 0.8, branchInsertionLoss: 3.5,
          insertionLoss: 0.8, wavelengthRange: 1550, unitPrice: 15000, currency: 'USD' }
      ],
      equalizerTypes: [
        { id: 'eq-adj-1', name: 'EQ-1000 可调型', attenuationMode: 'adjustable',
          defaultAttenuationDb: 0, unitPrice: 8000, currency: 'USD', remarks: '可调均衡器' },
        { id: 'eq-fixed-1', name: 'EQ-FATT-3dB 固定型', attenuationMode: 'fixed',
          defaultAttenuationDb: 3, unitPrice: 5000, currency: 'USD', remarks: 'F-ATT 3dB' }
      ],
      jointBoxTypes: [
        { id: 'jb-500', name: 'JB-500', insertionLoss: 0.05, maxFiberPairs: 16,
          unitPrice: 3000, currency: 'USD', remarks: '水下第500米级接头盒' },
        { id: 'jb-2000', name: 'JB-2000', insertionLoss: 0.05, maxFiberPairs: 32,
          unitPrice: 5000, currency: 'USD', remarks: '水下第2000米级接头盒' }
      ]
    }
    return JSON.stringify(template, null, 2)
  }

  /**
   * 生成模板 CSV（分区格式）
   */
  generateTemplateCSV(): string {
    return [
      '[FiberTypes]',
      'name,fiberCategory,nonlinearCoeff,effectiveArea,dispersion,nonlinearRefractiveIndex,attenuationCoeff,secondOrderDispersion,simulationModel',
      'SMF-28e+,G.652.D,1.3,82,17,2.6,0.18,-21.7,GN',
      '',
      '[AmplifierTypes]',
      'name,gain,bandwidth,gainFlatness,noiseFigure,pumpPower,outputPower,saturationPower,gainRangePower,operatingMode,unitPrice,currency',
      'EDFA-C 标准型,18,35,0.5,5.5,200,17,20,15,fixed_gain,25000,USD',
      '',
      '[BranchingUnitTypes]',
      'name,portCount,trunkInsertionLoss,branchInsertionLoss,wavelengthRange,unitPrice,currency',
      'BU-3P 标准型,3,0.8,3.5,1550,15000,USD',
      '',
      '[EqualizerTypes]',
      'name,attenuationMode,defaultAttenuationDb,unitPrice,currency,remarks',
      'EQ-1000 可调型,adjustable,0,8000,USD,可调均衡器',
      'EQ-FATT-3dB,fixed,3,5000,USD,F-ATT 3dB固定光衰',
      '',
      '[JointBoxTypes]',
      'name,insertionLoss,maxFiberPairs,unitPrice,currency,remarks',
      'JB-500,0.05,16,3000,USD,水下接头盒',
      'JB-2000,0.05,32,5000,USD,水下大容量接头盒',
    ].join('\n')
  }
}

/**
 * 将导入结果应用到 settingsStore
 * @returns 各类型导入数量的摘要
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function applyImportResultToStore(result: ImportResult, settingsStore: any): Promise<string> {
  const syncTasks: Array<Promise<unknown> | undefined> = []
  result.fiberTypes.forEach(f => syncTasks.push(settingsStore.savePlatformDeviceLibrary(deviceLibraryItemToPlatform('fiber', f))))
  result.amplifierTypes.forEach(a => syncTasks.push(settingsStore.savePlatformDeviceLibrary(deviceLibraryItemToPlatform('amplifier', a))))
  result.branchingUnitTypes.forEach(b => syncTasks.push(settingsStore.savePlatformDeviceLibrary(deviceLibraryItemToPlatform('branching', b))))
  result.equalizerTypes.forEach(e => syncTasks.push(settingsStore.savePlatformDeviceLibrary(deviceLibraryItemToPlatform('equalizer', e))))
  result.jointBoxTypes.forEach(j => syncTasks.push(settingsStore.savePlatformDeviceLibrary(deviceLibraryItemToPlatform('joint', j))))
  await Promise.all(syncTasks.filter(Boolean))
  const s = result.summary
  return `导入成功：光纤${s.fiberCount}、放大器${s.amplifierCount}、分支器${s.branchingUnitCount}、均衡器${s.equalizerCount}、接头盒${s.jointCount}`
}

// 导出单例
export const deviceImportService = new DeviceImportService()
