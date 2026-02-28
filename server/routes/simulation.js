/**
 * 仿真计算 API 路由
 * 支持 GN / EGN / RAMAN / HYBRID / SSFM(fallback) 模型分发
 */

import { Router } from 'express'
import { buildSimulationInput, spanIteration, buildDetailedResult } from '../services/gnModel.js'
import { egnSpanIteration, buildDetailedResult as egnBuildDetailedResult } from '../services/egnModel.js'
import { ramanHybridSpanIteration, buildDetailedResult as ramanBuildDetailedResult } from '../services/ramanModel.js'
import { addEolMarginToResult } from '../services/eolModel.js'

export function createSimulationRouter() {
    const router = Router()

    /**
     * POST /api/simulation/run
     */
    router.post('/run', (req, res) => {
        try {
            const startTime = Date.now()
            const fiberModel = req.body.fiberModel || 'GN'
            const amplifierModel = req.body.amplifierModel || 'EDFA_Simple'
            console.log(`\n🔬 接收到仿真计算请求 [光纤: ${fiberModel}, 放大器: ${amplifierModel}]`)

            // Step 3: 构建标准化仿真输入
            const simInput = buildSimulationInput(req.body)
            console.log(`  📋 Step3 完成: 器件序列 ${simInput.deviceSequence.length} 个, 光纤段 ${simInput.fiberSegments.length} 段`)

            // Step 4: Span 迭代计算（根据模型分发）
            let iterationResult
            let detailBuilder = buildDetailedResult

            if (fiberModel === 'EGN') {
                console.log('  ⚙️ 使用 EGN 模型（含高阶色散+XPM修正）')
                iterationResult = egnSpanIteration(simInput)
                detailBuilder = egnBuildDetailedResult
            } else if (fiberModel === 'RAMAN' || fiberModel === 'HYBRID' || amplifierModel === 'EDFA_Raman') {
                console.log('  ⚙️ 使用 Raman+EDFA 混合放大模型')
                iterationResult = ramanHybridSpanIteration(simInput)
                detailBuilder = ramanBuildDetailedResult
            } else if (fiberModel === 'SSFM') {
                console.log('  ⚙️ SSFM 模型尚未实现，回退到 GN')
                iterationResult = spanIteration(simInput)
            } else {
                console.log('  ⚙️ 使用 GN 模型')
                iterationResult = spanIteration(simInput)
            }

            const { spanScanResult, recommendedPoint } = iterationResult
            console.log(`  📊 Step4 完成: 扫描 ${spanScanResult.spanLengthsKm.length} 个 span 长度`)
            console.log(`  ✅ 推荐 Span: ${spanScanResult.recommendedSpanKm} km, GSNR: ${recommendedPoint.avgGsnrDb} dB, 放大器: ${recommendedPoint.numAmplifiers} 台`)
            if (spanScanResult.feasibleRange) {
                console.log(`  📐 可行区间: [${spanScanResult.feasibleRange[0]}, ${spanScanResult.feasibleRange[1]}] km`)
            }

            // 用推荐 span 生成详细结果
            const detailedResult = detailBuilder(simInput, recommendedPoint, spanScanResult)
            detailedResult.calculatedAt = new Date().toLocaleString('zh-CN')
            detailedResult.calculationTime = parseFloat(((Date.now() - startTime) / 1000).toFixed(3))
            detailedResult.model = fiberModel

            // EOL 老化余量计算
            addEolMarginToResult(detailedResult, simInput)
            if (detailedResult.eolMargin) {
                const eol = detailedResult.eolMargin
                console.log(`  📉 EOL 余量: 总退化 ${eol.degradation.totalPenalty_dB} dB, EOL GSNR 余量 ${eol.eolGsnrMargin_dB} dB, ${eol.eolMeetsTarget ? '✅达标' : '❌不达标'}`)
            }

            console.log(`  ⏱️  总耗时: ${Date.now() - startTime}ms`)

            res.json({
                success: true,
                spanScanResult,
                detailedResult,
            })
        } catch (error) {
            console.error('仿真计算出错:', error)
            res.status(500).json({ success: false, error: error.message })
        }
    })

    return router
}
