/**
 * 性能计算服务
 * 负责中继器位置调整后的光学性能自动重算
 */

import { ref } from 'vue'

// 中继器配置
export interface RepeaterConfig {
  id: string
  name: string
  kp: number
  longitude: number
  latitude: number
  depth: number
  model: string
  gain: number
  noiseFigure: number
}

// 光纤段参数
export interface FiberSpan {
  fromKp: number
  toKp: number
  length: number
  attenuation: number  // dB/km
  dispersion: number   // ps/nm/km
  nonlinearCoeff: number
}

// 性能计算结果
export interface PerformanceResult {
  gsnr: number          // 广义信噪比 (dB)
  osnr: number          // 光信噪比 (dB)
  capacity: number      // 系统容量 (Gbps)
  margin: number        // 系统余量 (dB)
  spanLosses: number[]  // 各跨段损耗
  spanGsnr: number[]    // 各跨段GSNR
  isValid: boolean      // 是否在有效范围
  warnings: string[]    // 警告信息
}

// 系统参数
interface SystemParams {
  launchPower: number      // 发射功率 (dBm)
  wavelengthCount: number  // 波道数
  channelSpacing: number   // 信道间隔 (GHz)
  symbolRate: number       // 符号率 (GBaud)
  fiberAttenuation: number // 光纤衰减 (dB/km)
  amplifierNF: number      // 放大器噪声系数 (dB)
  targetGsnr: number       // 目标GSNR (dB)
}

const defaultSystemParams: SystemParams = {
  launchPower: 0,
  wavelengthCount: 96,
  channelSpacing: 50,
  symbolRate: 64,
  fiberAttenuation: 0.2,
  amplifierNF: 5.5,
  targetGsnr: 15,
}

class PerformanceCalculator {
  private systemParams: SystemParams = { ...defaultSystemParams }
  
  // 计算状态
  public isCalculating = ref(false)
  public lastResult = ref<PerformanceResult | null>(null)

  // 设置系统参数
  setSystemParams(params: Partial<SystemParams>) {
    Object.assign(this.systemParams, params)
  }

  // 计算跨段损耗
  calculateSpanLoss(spanLength: number): number {
    return spanLength * this.systemParams.fiberAttenuation
  }

  // 计算ASE噪声贡献
  calculateAseNoise(spanLoss: number, noiseFigure: number): number {
    // 简化的ASE计算: P_ASE = h*v*B*nsp*(G-1)
    // 转换为dB形式
    const h = 6.626e-34  // 普朗克常数
    const v = 193.1e12   // 光频率 (Hz)
    const B = this.systemParams.channelSpacing * 1e9  // 带宽
    
    const G_linear = Math.pow(10, spanLoss / 10)  // 增益（补偿损耗）
    const nsp = Math.pow(10, noiseFigure / 10) / 2  // 自发辐射因子
    
    const P_ase = h * v * B * nsp * (G_linear - 1)
    return 10 * Math.log10(P_ase * 1000)  // 转换为dBm
  }

  // 计算非线性噪声（简化GN模型）
  calculateNliNoise(spanLength: number, launchPower: number): number {
    // 简化的GN模型: P_NLI ∝ P^3 * L * γ^2
    const gamma = 1.3e-3  // 非线性系数 (1/W/km)
    const Leff = 20  // 有效长度 (km)
    
    const P_linear = Math.pow(10, (launchPower - 30) / 10)  // 转换为W
    const P_nli = gamma * gamma * Math.pow(P_linear, 3) * Math.min(spanLength, Leff)
    
    return 10 * Math.log10(P_nli * 1000)  // 转换为dBm
  }

  // 计算单跨段GSNR
  calculateSpanGsnr(spanLength: number, repeaterGain: number, noiseFigure: number): number {
    const spanLoss = this.calculateSpanLoss(spanLength)
    const launchPower = this.systemParams.launchPower
    
    // 信号功率（到达接收端）
    const signalPower = launchPower - spanLoss + repeaterGain
    
    // ASE噪声
    const aseNoise = this.calculateAseNoise(spanLoss, noiseFigure)
    
    // NLI噪声
    const nliNoise = this.calculateNliNoise(spanLength, launchPower)
    
    // 总噪声功率（线性相加）
    const totalNoise_linear = Math.pow(10, aseNoise / 10) + Math.pow(10, nliNoise / 10)
    const totalNoise = 10 * Math.log10(totalNoise_linear)
    
    // GSNR = 信号功率 - 噪声功率
    return signalPower - totalNoise
  }

  // 计算整体性能
  calculate(repeaters: RepeaterConfig[], totalLength: number): PerformanceResult {
    this.isCalculating.value = true
    
    const warnings: string[] = []
    const spanLosses: number[] = []
    const spanGsnr: number[] = []
    
    // 构建跨段
    const spans: { length: number; repeater: RepeaterConfig | null }[] = []
    let prevKp = 0
    
    repeaters.sort((a, b) => a.kp - b.kp)
    
    repeaters.forEach(rep => {
      const spanLength = rep.kp - prevKp
      spans.push({ length: spanLength, repeater: rep })
      prevKp = rep.kp
    })
    
    // 最后一段（到终端）
    if (prevKp < totalLength) {
      spans.push({ length: totalLength - prevKp, repeater: null })
    }
    
    // 计算每段
    let totalGsnr_linear_inv = 0
    
    spans.forEach((span, index) => {
      const loss = this.calculateSpanLoss(span.length)
      spanLosses.push(loss)
      
      const gain = span.repeater?.gain || 0
      const nf = span.repeater?.noiseFigure || 5.5
      
      const gsnr = this.calculateSpanGsnr(span.length, gain, nf)
      spanGsnr.push(gsnr)
      
      // 累加噪声（GSNR倒数相加）
      totalGsnr_linear_inv += Math.pow(10, -gsnr / 10)
      
      // 检查跨段是否超限
      if (span.length > 120) {
        warnings.push(`跨段 ${index + 1} 长度 ${span.length.toFixed(1)}km 超过最大推荐值 120km`)
      }
      
      if (loss > gain + 3) {
        warnings.push(`跨段 ${index + 1} 损耗 ${loss.toFixed(1)}dB 超过中继器增益`)
      }
    })
    
    // 计算总GSNR
    const gsnr = -10 * Math.log10(totalGsnr_linear_inv)
    
    // 计算OSNR（简化：GSNR + 调整因子）
    const osnr = gsnr + 3
    
    // 计算容量（Shannon公式简化）
    const capacity = this.systemParams.wavelengthCount * this.systemParams.symbolRate * 
      Math.log2(1 + Math.pow(10, gsnr / 10)) / 1000  // Tbps
    
    // 计算余量
    const margin = gsnr - this.systemParams.targetGsnr
    
    // 判断有效性
    const isValid = margin > 0 && warnings.length === 0
    
    if (margin < 0) {
      warnings.push(`系统余量 ${margin.toFixed(1)}dB 低于目标值`)
    }
    
    const result: PerformanceResult = {
      gsnr: Math.round(gsnr * 100) / 100,
      osnr: Math.round(osnr * 100) / 100,
      capacity: Math.round(capacity * 100) / 100,
      margin: Math.round(margin * 100) / 100,
      spanLosses,
      spanGsnr,
      isValid,
      warnings,
    }
    
    this.lastResult.value = result
    this.isCalculating.value = false
    
    return result
  }

  // 获取上次计算结果
  getLastResult(): PerformanceResult | null {
    return this.lastResult.value
  }
}

// 单例导出
export const performanceCalculator = new PerformanceCalculator()

// Composable
export function usePerformanceCalculator() {
  return {
    calculate: (repeaters: RepeaterConfig[], totalLength: number) => 
      performanceCalculator.calculate(repeaters, totalLength),
    setSystemParams: (params: Partial<SystemParams>) => 
      performanceCalculator.setSystemParams(params),
    isCalculating: performanceCalculator.isCalculating,
    lastResult: performanceCalculator.lastResult,
  }
}
