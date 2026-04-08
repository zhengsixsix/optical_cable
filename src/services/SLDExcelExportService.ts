/**
 * SLD Excel 导出服务 — 动态真实数据版
 *
 * 实现原理：
 *  1. buildLayout(table) → 计算每个设备的 Excel 列位置
 *  2. writeSheet(ws, layout, table) → 用 ExcelJS 写单元格数据（文字/数字/边框）
 *  3. generateDrawingXml(layout) → 根据设备类型和列位动态生成 drawing XML
 *     - REP               → 白色沙漏/X 轮廓（文档中的 R 图标）
 *     - EQ                → 蓝/红矩形均衡器
 *     - BJB/PFE/终端      → 六边形图形（白色内矩形）
 *     - SEJB/BUJB         → 实心黑六边形
 *     - SJB/FJB/LIJB      → 空心六边形 + 中线
 *     - OADM/ROADM/BU     → 分支器图标
 *  4. jszip 合并：把 ExcelJS xlsx + drawing XML 合成最终输出
 *
 * 图形模板直接提取自 SLD示例.xlsx 的 drawing1.xml，确保与示例完全一致。
 */

import * as ExcelJS from 'exceljs'
import JSZip from 'jszip'
import type { SLDTable, SLDEquipment, SLDFiberSegment } from '@/types'
import {
  DEFAULT_SLD_EXPORT_TEMPLATE_VERSION,
  isFixedEqualizer as sldIsFixedEqualizer,
  resolveEqualizerRole as sldResolveEqualizerRole,
  resolveJointSubType as sldResolveJointSubType,
  resolveSldDisplayName as sldResolveSldDisplayName,
  resolveSldSymbolCode as sldResolveSldSymbolCode,
} from '@/services/sldDeviceRegistry'

// ═══════════════════════════════════════════════════
// 布局常量（与 buildLayout 一致）
// ═══════════════════════════════════════════════════

const R_FP    = 0   // 行偏移：光纤对数行（0-indexed，相对 section 起始行）
const R_LAND  = 1   // LAND 行
const R_TYPE  = 2   // 电缆类型 / 站点字母
const R_DIST  = 3   // 距离值
const R_ID    = 4   // 电缆编号
const R_EQUIP = 5   // 设备名称
const R_SEC   = 6   // 次要 / 分支标签
const SECTION_ROWS = 10   // 每段内容行数
const SECTION_GAP  = 6    // 段间空白行数（与示例文件一致，合计16行/段）
const MAX_SECTION_COLS = 28  // 每段最多布局元素数（约14个设备+14个光缆段）

const COL_WIDTH  = 9.36328125
const ROW_HEIGHT = 13.5

// ═══════════════════════════════════════════════════
// 图形模板（提取自 drawing1.xml）
// {{FROM_COL}} {{FROM_ROW}} {{TO_COL}} {{TO_ROW}} 为位置占位符
// {{ID_N}} 为形状 ID 占位符，{{NAME}} 为名称占位符
// ═══════════════════════════════════════════════════

// 默认深海设备六边形（保留给未知深海设备）
const TPL_REP_HEX    = "<xdr:twoCellAnchor><xdr:from><xdr:col>{{FROM_COL}}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>{{FROM_ROW}}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>{{TO_COL}}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>{{TO_ROW}}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:grpSp><xdr:nvGrpSpPr><xdr:cNvPr id=\"{{ID_0}}\" name=\"{{NAME}}\"><a:extLst><a:ext uri=\"{FF2B5EF4-FFF2-40B4-BE49-F238E27FC236}\"><a16:creationId xmlns:a16=\"http://schemas.microsoft.com/office/drawing/2014/main\" id=\"{{ID_1}}\"/></a:ext></a:extLst></xdr:cNvPr><xdr:cNvGrpSpPr><a:grpSpLocks/></xdr:cNvGrpSpPr></xdr:nvGrpSpPr><xdr:grpSpPr bwMode=\"auto\"><a:xfrm><a:off x=\"8549554\" y=\"335107\"/><a:ext cx=\"658091\" cy=\"519546\"/><a:chOff x=\"883\" y=\"2553\"/><a:chExt cx=\"97\" cy=\"60\"/></a:xfrm></xdr:grpSpPr><xdr:sp macro=\"\" textlink=\"\"><xdr:nvSpPr><xdr:cNvPr id=\"{{ID_2}}\" name=\"{{NAME}}\"><a:extLst><a:ext uri=\"{FF2B5EF4-FFF2-40B4-BE49-F238E27FC236}\"><a16:creationId xmlns:a16=\"http://schemas.microsoft.com/office/drawing/2014/main\" id=\"{{ID_3}}\"/></a:ext></a:extLst></xdr:cNvPr><xdr:cNvSpPr><a:spLocks/></xdr:cNvSpPr></xdr:nvSpPr><xdr:spPr bwMode=\"auto\"><a:xfrm><a:off x=\"883\" y=\"2553\"/><a:ext cx=\"97\" cy=\"60\"/></a:xfrm><a:custGeom><a:avLst/><a:gdLst><a:gd name=\"{{NAME}}\" fmla=\"*/ 0 w 196\"/><a:gd name=\"{{NAME}}\" fmla=\"*/ 20 h 60\"/><a:gd name=\"{{NAME}}\" fmla=\"*/ 0 w 196\"/><a:gd name=\"{{NAME}}\" fmla=\"*/ 0 h 60\"/><a:gd name=\"{{NAME}}\" fmla=\"*/ 0 w 196\"/><a:gd name=\"{{NAME}}\" fmla=\"*/ 20 h 60\"/><a:gd name=\"{{NAME}}\" fmla=\"*/ 0 w 196\"/><a:gd name=\"{{NAME}}\" fmla=\"*/ 40 h 60\"/><a:gd name=\"{{NAME}}\" fmla=\"*/ 0 w 196\"/><a:gd name=\"{{NAME}}\" fmla=\"*/ 60 h 60\"/><a:gd name=\"{{NAME}}\" fmla=\"*/ 0 w 196\"/><a:gd name=\"{{NAME}}\" fmla=\"*/ 40 h 60\"/><a:gd name=\"{{NAME}}\" fmla=\"*/ 0 w 196\"/><a:gd name=\"{{NAME}}\" fmla=\"*/ 20 h 60\"/><a:gd name=\"{{NAME}}\" fmla=\"*/ 0 60000 65536\"/><a:gd name=\"{{NAME}}\" fmla=\"*/ 0 60000 65536\"/><a:gd name=\"{{NAME}}\" fmla=\"*/ 0 60000 65536\"/><a:gd name=\"{{NAME}}\" fmla=\"*/ 0 60000 65536\"/><a:gd name=\"{{NAME}}\" fmla=\"*/ 0 60000 65536\"/><a:gd name=\"{{NAME}}\" fmla=\"*/ 0 60000 65536\"/><a:gd name=\"{{NAME}}\" fmla=\"*/ 0 60000 65536\"/><a:gd name=\"{{NAME}}\" fmla=\"*/ 0 w 196\"/><a:gd name=\"{{NAME}}\" fmla=\"*/ 0 h 60\"/><a:gd name=\"{{NAME}}\" fmla=\"*/ 196 w 196\"/><a:gd name=\"{{NAME}}\" fmla=\"*/ 60 h 60\"/></a:gdLst><a:ahLst/><a:cxnLst><a:cxn ang=\"T14\"><a:pos x=\"T0\" y=\"T1\"/></a:cxn><a:cxn ang=\"T15\"><a:pos x=\"T2\" y=\"T3\"/></a:cxn><a:cxn ang=\"T16\"><a:pos x=\"T4\" y=\"T5\"/></a:cxn><a:cxn ang=\"T17\"><a:pos x=\"T6\" y=\"T7\"/></a:cxn><a:cxn ang=\"T18\"><a:pos x=\"T8\" y=\"T9\"/></a:cxn><a:cxn ang=\"T19\"><a:pos x=\"T10\" y=\"T11\"/></a:cxn><a:cxn ang=\"T20\"><a:pos x=\"T12\" y=\"T13\"/></a:cxn></a:cxnLst><a:rect l=\"T21\" t=\"T22\" r=\"T23\" b=\"T24\"/><a:pathLst><a:path w=\"196\" h=\"60\"><a:moveTo><a:pt x=\"0\" y=\"20\"/></a:moveTo><a:lnTo><a:pt x=\"98\" y=\"0\"/></a:lnTo><a:lnTo><a:pt x=\"196\" y=\"20\"/></a:lnTo><a:lnTo><a:pt x=\"196\" y=\"40\"/></a:lnTo><a:lnTo><a:pt x=\"98\" y=\"60\"/></a:lnTo><a:lnTo><a:pt x=\"0\" y=\"40\"/></a:lnTo><a:lnTo><a:pt x=\"0\" y=\"20\"/></a:lnTo><a:close/></a:path></a:pathLst></a:custGeom><a:solidFill><a:srgbClr val=\"000000\"/></a:solidFill><a:ln w=\"9525\"><a:solidFill><a:srgbClr val=\"000000\"/></a:solidFill><a:round/><a:headEnd/><a:tailEnd/></a:ln></xdr:spPr></xdr:sp><xdr:sp macro=\"\" textlink=\"\"><xdr:nvSpPr><xdr:cNvPr id=\"{{ID_4}}\" name=\"{{NAME}}\"><a:extLst><a:ext uri=\"{FF2B5EF4-FFF2-40B4-BE49-F238E27FC236}\"><a16:creationId xmlns:a16=\"http://schemas.microsoft.com/office/drawing/2014/main\" id=\"{{ID_5}}\"/></a:ext></a:extLst></xdr:cNvPr><xdr:cNvSpPr><a:spLocks noChangeArrowheads=\"1\"/></xdr:cNvSpPr></xdr:nvSpPr><xdr:spPr bwMode=\"auto\"><a:xfrm><a:off x=\"910\" y=\"2562\"/><a:ext cx=\"42\" cy=\"42\"/></a:xfrm><a:prstGeom prst=\"rect\"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val=\"000000\"/></a:solidFill><a:ln w=\"9525\"><a:solidFill><a:srgbClr val=\"000000\"/></a:solidFill><a:miter lim=\"800000\"/><a:headEnd/><a:tailEnd/></a:ln></xdr:spPr></xdr:sp></xdr:grpSp><xdr:clientData/></xdr:twoCellAnchor>"

// 中继器 R（白色沙漏/X 轮廓）
const TPL_REPEATER_R = "<xdr:twoCellAnchor><xdr:from><xdr:col>{{FROM_COL}}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>{{FROM_ROW}}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>{{TO_COL}}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>{{TO_ROW}}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:sp macro=\"\" textlink=\"\"><xdr:nvSpPr><xdr:cNvPr id=\"{{ID_0}}\" name=\"{{NAME}}\"><a:extLst><a:ext uri=\"{FF2B5EF4-FFF2-40B4-BE49-F238E27FC236}\"><a16:creationId xmlns:a16=\"http://schemas.microsoft.com/office/drawing/2014/main\" id=\"{{ID_1}}\"/></a:ext></a:extLst></xdr:cNvPr><xdr:cNvSpPr><a:spLocks/></xdr:cNvSpPr></xdr:nvSpPr><xdr:spPr bwMode=\"auto\"><a:xfrm><a:off x=\"883\" y=\"2553\"/><a:ext cx=\"97\" cy=\"60\"/></a:xfrm><a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l=\"0\" t=\"0\" r=\"196\" b=\"60\"/><a:pathLst><a:path w=\"196\" h=\"60\"><a:moveTo><a:pt x=\"0\" y=\"0\"/></a:moveTo><a:lnTo><a:pt x=\"196\" y=\"60\"/></a:lnTo><a:moveTo><a:pt x=\"196\" y=\"0\"/></a:moveTo><a:lnTo><a:pt x=\"0\" y=\"60\"/></a:lnTo><a:moveTo><a:pt x=\"0\" y=\"30\"/></a:moveTo><a:lnTo><a:pt x=\"0\" y=\"0\"/></a:lnTo><a:lnTo><a:pt x=\"98\" y=\"30\"/></a:lnTo><a:lnTo><a:pt x=\"0\" y=\"60\"/></a:lnTo><a:lnTo><a:pt x=\"0\" y=\"30\"/></a:lnTo><a:close/><a:moveTo><a:pt x=\"196\" y=\"30\"/></a:moveTo><a:lnTo><a:pt x=\"196\" y=\"0\"/></a:lnTo><a:lnTo><a:pt x=\"98\" y=\"30\"/></a:lnTo><a:lnTo><a:pt x=\"196\" y=\"60\"/></a:lnTo><a:lnTo><a:pt x=\"196\" y=\"30\"/></a:lnTo><a:close/></a:path></a:pathLst></a:custGeom><a:noFill/><a:ln w=\"9525\"><a:solidFill><a:srgbClr val=\"000000\"/></a:solidFill><a:round/><a:headEnd/><a:tailEnd/></a:ln></xdr:spPr></xdr:sp><xdr:clientData/></xdr:twoCellAnchor>"

// 终端六边形（白色内矩形 — 近岸设备：BJB/PFE/终端）
const TPL_TERM_HEX   = "<xdr:twoCellAnchor><xdr:from><xdr:col>{{FROM_COL}}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>{{FROM_ROW}}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>{{TO_COL}}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>{{TO_ROW}}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:grpSp><xdr:nvGrpSpPr><xdr:cNvPr id=\"{{ID_0}}\" name=\"{{NAME}}\"><a:extLst><a:ext uri=\"{FF2B5EF4-FFF2-40B4-BE49-F238E27FC236}\"><a16:creationId xmlns:a16=\"http://schemas.microsoft.com/office/drawing/2014/main\" id=\"{{ID_1}}\"/></a:ext></a:extLst></xdr:cNvPr><xdr:cNvGrpSpPr><a:grpSpLocks/></xdr:cNvGrpSpPr></xdr:nvGrpSpPr><xdr:grpSpPr bwMode=\"auto\"><a:xfrm><a:off x=\"1974273\" y=\"346364\"/><a:ext cx=\"658091\" cy=\"538595\"/><a:chOff x=\"883\" y=\"2553\"/><a:chExt cx=\"97\" cy=\"60\"/></a:xfrm></xdr:grpSpPr><xdr:sp macro=\"\" textlink=\"\"><xdr:nvSpPr><xdr:cNvPr id=\"{{ID_2}}\" name=\"{{NAME}}\"><a:extLst><a:ext uri=\"{FF2B5EF4-FFF2-40B4-BE49-F238E27FC236}\"><a16:creationId xmlns:a16=\"http://schemas.microsoft.com/office/drawing/2014/main\" id=\"{{ID_3}}\"/></a:ext></a:extLst></xdr:cNvPr><xdr:cNvSpPr><a:spLocks/></xdr:cNvSpPr></xdr:nvSpPr><xdr:spPr bwMode=\"auto\"><a:xfrm><a:off x=\"883\" y=\"2553\"/><a:ext cx=\"97\" cy=\"60\"/></a:xfrm><a:custGeom><a:avLst/><a:gdLst><a:gd name=\"{{NAME}}\" fmla=\"*/ 0 w 196\"/><a:gd name=\"{{NAME}}\" fmla=\"*/ 20 h 60\"/><a:gd name=\"{{NAME}}\" fmla=\"*/ 0 w 196\"/><a:gd name=\"{{NAME}}\" fmla=\"*/ 0 h 60\"/><a:gd name=\"{{NAME}}\" fmla=\"*/ 0 w 196\"/><a:gd name=\"{{NAME}}\" fmla=\"*/ 20 h 60\"/><a:gd name=\"{{NAME}}\" fmla=\"*/ 0 w 196\"/><a:gd name=\"{{NAME}}\" fmla=\"*/ 40 h 60\"/><a:gd name=\"{{NAME}}\" fmla=\"*/ 0 w 196\"/><a:gd name=\"{{NAME}}\" fmla=\"*/ 60 h 60\"/><a:gd name=\"{{NAME}}\" fmla=\"*/ 0 w 196\"/><a:gd name=\"{{NAME}}\" fmla=\"*/ 40 h 60\"/><a:gd name=\"{{NAME}}\" fmla=\"*/ 0 w 196\"/><a:gd name=\"{{NAME}}\" fmla=\"*/ 20 h 60\"/><a:gd name=\"{{NAME}}\" fmla=\"*/ 0 60000 65536\"/><a:gd name=\"{{NAME}}\" fmla=\"*/ 0 60000 65536\"/><a:gd name=\"{{NAME}}\" fmla=\"*/ 0 60000 65536\"/><a:gd name=\"{{NAME}}\" fmla=\"*/ 0 60000 65536\"/><a:gd name=\"{{NAME}}\" fmla=\"*/ 0 60000 65536\"/><a:gd name=\"{{NAME}}\" fmla=\"*/ 0 60000 65536\"/><a:gd name=\"{{NAME}}\" fmla=\"*/ 0 60000 65536\"/><a:gd name=\"{{NAME}}\" fmla=\"*/ 0 w 196\"/><a:gd name=\"{{NAME}}\" fmla=\"*/ 0 h 60\"/><a:gd name=\"{{NAME}}\" fmla=\"*/ 196 w 196\"/><a:gd name=\"{{NAME}}\" fmla=\"*/ 60 h 60\"/></a:gdLst><a:ahLst/><a:cxnLst><a:cxn ang=\"T14\"><a:pos x=\"T0\" y=\"T1\"/></a:cxn><a:cxn ang=\"T15\"><a:pos x=\"T2\" y=\"T3\"/></a:cxn><a:cxn ang=\"T16\"><a:pos x=\"T4\" y=\"T5\"/></a:cxn><a:cxn ang=\"T17\"><a:pos x=\"T6\" y=\"T7\"/></a:cxn><a:cxn ang=\"T18\"><a:pos x=\"T8\" y=\"T9\"/></a:cxn><a:cxn ang=\"T19\"><a:pos x=\"T10\" y=\"T11\"/></a:cxn><a:cxn ang=\"T20\"><a:pos x=\"T12\" y=\"T13\"/></a:cxn></a:cxnLst><a:rect l=\"T21\" t=\"T22\" r=\"T23\" b=\"T24\"/><a:pathLst><a:path w=\"196\" h=\"60\"><a:moveTo><a:pt x=\"0\" y=\"20\"/></a:moveTo><a:lnTo><a:pt x=\"98\" y=\"0\"/></a:lnTo><a:lnTo><a:pt x=\"196\" y=\"20\"/></a:lnTo><a:lnTo><a:pt x=\"196\" y=\"40\"/></a:lnTo><a:lnTo><a:pt x=\"98\" y=\"60\"/></a:lnTo><a:lnTo><a:pt x=\"0\" y=\"40\"/></a:lnTo><a:lnTo><a:pt x=\"0\" y=\"20\"/></a:lnTo><a:close/></a:path></a:pathLst></a:custGeom><a:solidFill><a:srgbClr val=\"000000\"/></a:solidFill><a:ln w=\"9525\"><a:solidFill><a:srgbClr val=\"000000\"/></a:solidFill><a:round/><a:headEnd/><a:tailEnd/></a:ln></xdr:spPr></xdr:sp><xdr:sp macro=\"\" textlink=\"\"><xdr:nvSpPr><xdr:cNvPr id=\"{{ID_4}}\" name=\"{{NAME}}\"><a:extLst><a:ext uri=\"{FF2B5EF4-FFF2-40B4-BE49-F238E27FC236}\"><a16:creationId xmlns:a16=\"http://schemas.microsoft.com/office/drawing/2014/main\" id=\"{{ID_5}}\"/></a:ext></a:extLst></xdr:cNvPr><xdr:cNvSpPr><a:spLocks noChangeArrowheads=\"1\"/></xdr:cNvSpPr></xdr:nvSpPr><xdr:spPr bwMode=\"auto\"><a:xfrm><a:off x=\"910\" y=\"2562\"/><a:ext cx=\"42\" cy=\"42\"/></a:xfrm><a:prstGeom prst=\"rect\"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:ln w=\"9525\"><a:solidFill><a:srgbClr val=\"000000\"/></a:solidFill><a:miter lim=\"800000\"/><a:headEnd/><a:tailEnd/></a:ln></xdr:spPr></xdr:sp></xdr:grpSp><xdr:clientData/></xdr:twoCellAnchor>"

// 内联设备左侧连接线
const TPL_INLINE_LINE_LEFT = "<xdr:twoCellAnchor><xdr:from><xdr:col>{{FROM_COL}}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>{{FROM_ROW}}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>{{TO_COL}}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>{{TO_ROW}}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:sp macro=\"\" textlink=\"\"><xdr:nvSpPr><xdr:cNvPr id=\"{{ID_0}}\" name=\"{{NAME}}\"><a:extLst><a:ext uri=\"{FF2B5EF4-FFF2-40B4-BE49-F238E27FC236}\"><a16:creationId xmlns:a16=\"http://schemas.microsoft.com/office/drawing/2014/main\" id=\"{{ID_1}}\"/></a:ext></a:extLst></xdr:cNvPr><xdr:cNvSpPr><a:spLocks noChangeShapeType=\"1\"/></xdr:cNvSpPr></xdr:nvSpPr><xdr:spPr bwMode=\"auto\"><a:xfrm><a:off x=\"0\" y=\"2583\"/><a:ext cx=\"18\" cy=\"0\"/></a:xfrm><a:prstGeom prst=\"line\"><a:avLst/></a:prstGeom><a:noFill/><a:ln w=\"9525\"><a:solidFill><a:srgbClr val=\"000000\"/></a:solidFill><a:round/><a:headEnd/><a:tailEnd/></a:ln></xdr:spPr></xdr:sp><xdr:clientData/></xdr:twoCellAnchor>"

// 内联设备右侧连接线
const TPL_INLINE_LINE_RIGHT = "<xdr:twoCellAnchor><xdr:from><xdr:col>{{FROM_COL}}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>{{FROM_ROW}}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>{{TO_COL}}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>{{TO_ROW}}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:sp macro=\"\" textlink=\"\"><xdr:nvSpPr><xdr:cNvPr id=\"{{ID_0}}\" name=\"{{NAME}}\"><a:extLst><a:ext uri=\"{FF2B5EF4-FFF2-40B4-BE49-F238E27FC236}\"><a16:creationId xmlns:a16=\"http://schemas.microsoft.com/office/drawing/2014/main\" id=\"{{ID_1}}\"/></a:ext></a:extLst></xdr:cNvPr><xdr:cNvSpPr><a:spLocks noChangeShapeType=\"1\"/></xdr:cNvSpPr></xdr:nvSpPr><xdr:spPr bwMode=\"auto\"><a:xfrm><a:off x=\"79\" y=\"2583\"/><a:ext cx=\"18\" cy=\"0\"/></a:xfrm><a:prstGeom prst=\"line\"><a:avLst/></a:prstGeom><a:noFill/><a:ln w=\"9525\"><a:solidFill><a:srgbClr val=\"000000\"/></a:solidFill><a:round/><a:headEnd/><a:tailEnd/></a:ln></xdr:spPr></xdr:sp><xdr:clientData/></xdr:twoCellAnchor>"

// EQ 蓝色核心块（均衡器 T）
const TPL_EQ_BLUE = "<xdr:twoCellAnchor><xdr:from><xdr:col>{{FROM_COL}}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>{{FROM_ROW}}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>{{TO_COL}}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>{{TO_ROW}}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:sp macro=\"\" textlink=\"\"><xdr:nvSpPr><xdr:cNvPr id=\"{{ID_0}}\" name=\"{{NAME}}\"><a:extLst><a:ext uri=\"{FF2B5EF4-FFF2-40B4-BE49-F238E27FC236}\"><a16:creationId xmlns:a16=\"http://schemas.microsoft.com/office/drawing/2014/main\" id=\"{{ID_1}}\"/></a:ext></a:extLst></xdr:cNvPr><xdr:cNvSpPr><a:spLocks/></xdr:cNvSpPr></xdr:nvSpPr><xdr:spPr bwMode=\"auto\"><a:xfrm><a:off x=\"18\" y=\"2553\"/><a:ext cx=\"61\" cy=\"60\"/></a:xfrm><a:prstGeom prst=\"rect\"><a:avLst/></a:prstGeom><a:pattFill prst=\"diagCross\"><a:fgClr><a:srgbClr val=\"1D4ED8\"/></a:fgClr><a:bgClr><a:srgbClr val=\"3B82F6\"/></a:bgClr></a:pattFill><a:ln w=\"9525\"><a:solidFill><a:srgbClr val=\"1D4ED8\"/></a:solidFill><a:round/><a:headEnd/><a:tailEnd/></a:ln></xdr:spPr></xdr:sp><xdr:clientData/></xdr:twoCellAnchor>"

// EQ 红色核心块（均衡器 S/F-ATT）
const TPL_EQ_RED  = "<xdr:twoCellAnchor><xdr:from><xdr:col>{{FROM_COL}}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>{{FROM_ROW}}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>{{TO_COL}}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>{{TO_ROW}}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:sp macro=\"\" textlink=\"\"><xdr:nvSpPr><xdr:cNvPr id=\"{{ID_0}}\" name=\"{{NAME}}\"><a:extLst><a:ext uri=\"{FF2B5EF4-FFF2-40B4-BE49-F238E27FC236}\"><a16:creationId xmlns:a16=\"http://schemas.microsoft.com/office/drawing/2014/main\" id=\"{{ID_1}}\"/></a:ext></a:extLst></xdr:cNvPr><xdr:cNvSpPr><a:spLocks/></xdr:cNvSpPr></xdr:nvSpPr><xdr:spPr bwMode=\"auto\"><a:xfrm><a:off x=\"18\" y=\"2553\"/><a:ext cx=\"61\" cy=\"60\"/></a:xfrm><a:prstGeom prst=\"rect\"><a:avLst/></a:prstGeom><a:pattFill prst=\"diagCross\"><a:fgClr><a:srgbClr val=\"B91C1C\"/></a:fgClr><a:bgClr><a:srgbClr val=\"EF4444\"/></a:bgClr></a:pattFill><a:ln w=\"9525\"><a:solidFill><a:srgbClr val=\"B91C1C\"/></a:solidFill><a:round/><a:headEnd/><a:tailEnd/></a:ln></xdr:spPr></xdr:sp><xdr:clientData/></xdr:twoCellAnchor>"

// 接头盒实心黑六边形（SEJB/BUJB）
const TPL_JB_SOLID_HEX = "<xdr:twoCellAnchor><xdr:from><xdr:col>{{FROM_COL}}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>{{FROM_ROW}}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>{{TO_COL}}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>{{TO_ROW}}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:sp macro=\"\" textlink=\"\"><xdr:nvSpPr><xdr:cNvPr id=\"{{ID_0}}\" name=\"{{NAME}}\"/><xdr:cNvSpPr><a:spLocks/></xdr:cNvSpPr></xdr:nvSpPr><xdr:spPr bwMode=\"auto\"><a:xfrm><a:off x=\"883\" y=\"2553\"/><a:ext cx=\"97\" cy=\"60\"/></a:xfrm><a:prstGeom prst=\"hexagon\"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val=\"000000\"/></a:solidFill><a:ln w=\"9525\"><a:solidFill><a:srgbClr val=\"000000\"/></a:solidFill><a:round/><a:headEnd/><a:tailEnd/></a:ln></xdr:spPr></xdr:sp><xdr:clientData/></xdr:twoCellAnchor>"

// 接头盒空心六边形（SJB/FJB/LIJB）
const TPL_JB_OUTLINE_HEX = "<xdr:twoCellAnchor><xdr:from><xdr:col>{{FROM_COL}}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>{{FROM_ROW}}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>{{TO_COL}}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>{{TO_ROW}}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:sp macro=\"\" textlink=\"\"><xdr:nvSpPr><xdr:cNvPr id=\"{{ID_0}}\" name=\"{{NAME}}\"/><xdr:cNvSpPr><a:spLocks/></xdr:cNvSpPr></xdr:nvSpPr><xdr:spPr bwMode=\"auto\"><a:xfrm><a:off x=\"883\" y=\"2553\"/><a:ext cx=\"97\" cy=\"60\"/></a:xfrm><a:prstGeom prst=\"hexagon\"><a:avLst/></a:prstGeom><a:noFill/><a:ln w=\"9525\"><a:solidFill><a:srgbClr val=\"000000\"/></a:solidFill><a:round/><a:headEnd/><a:tailEnd/></a:ln></xdr:spPr></xdr:sp><xdr:clientData/></xdr:twoCellAnchor>"

// 接头盒中心线（叠加在空心六边形上）
const TPL_JB_CENTER_LINE = "<xdr:twoCellAnchor><xdr:from><xdr:col>{{FROM_COL}}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>{{FROM_ROW}}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>{{TO_COL}}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>{{TO_ROW}}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:sp macro=\\\"\\\" textlink=\\\"\\\"><xdr:nvSpPr><xdr:cNvPr id=\\\"{{ID_0}}\\\" name=\\\"{{NAME}}\\\"/><xdr:cNvSpPr><a:spLocks noChangeShapeType=\\\"1\\\"/></xdr:cNvSpPr></xdr:nvSpPr><xdr:spPr bwMode=\\\"auto\\\"><a:xfrm><a:off x=\\\"932\\\" y=\\\"2593\\\"/><a:ext cx=\\\"0\\\" cy=\\\"60\\\"/></a:xfrm><a:prstGeom prst=\\\"line\\\"><a:avLst/></a:prstGeom><a:noFill/><a:ln w=\\\"9525\\\"><a:solidFill><a:srgbClr val=\\\"000000\\\"/></a:solidFill><a:round/><a:headEnd/><a:tailEnd/></a:ln></xdr:spPr></xdr:sp><xdr:clientData/></xdr:twoCellAnchor>"

// OADM 蝴蝶结图形（左半）
const TPL_BOWTIE_LEFT = "<xdr:twoCellAnchor><xdr:from><xdr:col>{{FROM_COL}}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>{{FROM_ROW}}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>{{TO_COL}}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>{{TO_ROW}}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:sp macro=\\\"\\\" textlink=\\\"\\\"><xdr:nvSpPr><xdr:cNvPr id=\\\"{{ID_0}}\\\" name=\\\"{{NAME}}\\\"/><xdr:cNvSpPr/></xdr:nvSpPr><xdr:spPr><a:xfrm rot=\\\"5400000\\\"><a:off x=\\\"883\\\" y=\\\"2553\\\"/><a:ext cx=\\\"97\\\" cy=\\\"60\\\"/></a:xfrm><a:prstGeom prst=\\\"triangle\\\"><a:avLst/></a:prstGeom><a:gradFill rotWithShape=\\\"1\\\"><a:gsLst><a:gs pos=\\\"0\\\"><a:srgbClr val=\\\"A603AB\\\"/></a:gs><a:gs pos=\\\"21001\\\"><a:srgbClr val=\\\"0819FB\\\"/></a:gs><a:gs pos=\\\"35001\\\"><a:srgbClr val=\\\"1A8D48\\\"/></a:gs><a:gs pos=\\\"52000\\\"><a:srgbClr val=\\\"FFFF00\\\"/></a:gs><a:gs pos=\\\"73000\\\"><a:srgbClr val=\\\"EE3F17\\\"/></a:gs><a:gs pos=\\\"88000\\\"><a:srgbClr val=\\\"E81766\\\"/></a:gs><a:gs pos=\\\"100000\\\"><a:srgbClr val=\\\"A603AB\\\"/></a:gs></a:gsLst><a:lin ang=\\\"16200000\\\" scaled=\\\"1\\\"/></a:gradFill></xdr:spPr></xdr:sp><xdr:clientData/></xdr:twoCellAnchor>"

// OADM 蝴蝶结图形（右半）
const TPL_BOWTIE_RIGHT = "<xdr:twoCellAnchor><xdr:from><xdr:col>{{FROM_COL}}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>{{FROM_ROW}}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>{{TO_COL}}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>{{TO_ROW}}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:sp macro=\\\"\\\" textlink=\\\"\\\"><xdr:nvSpPr><xdr:cNvPr id=\\\"{{ID_0}}\\\" name=\\\"{{NAME}}\\\"/><xdr:cNvSpPr/></xdr:nvSpPr><xdr:spPr><a:xfrm rot=\\\"16200000\\\"><a:off x=\\\"883\\\" y=\\\"2553\\\"/><a:ext cx=\\\"97\\\" cy=\\\"60\\\"/></a:xfrm><a:prstGeom prst=\\\"triangle\\\"><a:avLst/></a:prstGeom><a:gradFill rotWithShape=\\\"1\\\"><a:gsLst><a:gs pos=\\\"0\\\"><a:srgbClr val=\\\"A603AB\\\"/></a:gs><a:gs pos=\\\"21001\\\"><a:srgbClr val=\\\"0819FB\\\"/></a:gs><a:gs pos=\\\"35001\\\"><a:srgbClr val=\\\"1A8D48\\\"/></a:gs><a:gs pos=\\\"52000\\\"><a:srgbClr val=\\\"FFFF00\\\"/></a:gs><a:gs pos=\\\"73000\\\"><a:srgbClr val=\\\"EE3F17\\\"/></a:gs><a:gs pos=\\\"88000\\\"><a:srgbClr val=\\\"E81766\\\"/></a:gs><a:gs pos=\\\"100000\\\"><a:srgbClr val=\\\"A603AB\\\"/></a:gs></a:gsLst><a:lin ang=\\\"5400000\\\" scaled=\\\"1\\\"/></a:gradFill></xdr:spPr></xdr:sp><xdr:clientData/></xdr:twoCellAnchor>"

// OADM 右侧红色竖条
const TPL_OADM_BAR = "<xdr:twoCellAnchor><xdr:from><xdr:col>{{FROM_COL}}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>{{FROM_ROW}}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>{{TO_COL}}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>{{TO_ROW}}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:sp macro=\\\"\\\" textlink=\\\"\\\"><xdr:nvSpPr><xdr:cNvPr id=\\\"{{ID_0}}\\\" name=\\\"{{NAME}}\\\"/><xdr:cNvSpPr/></xdr:nvSpPr><xdr:spPr><a:xfrm><a:off x=\\\"965\\\" y=\\\"2553\\\"/><a:ext cx=\\\"10\\\" cy=\\\"60\\\"/></a:xfrm><a:prstGeom prst=\\\"rect\\\"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val=\\\"FF0000\\\"/></a:solidFill><a:ln w=\\\"12700\\\"><a:solidFill><a:srgbClr val=\\\"000000\\\"/></a:solidFill></a:ln></xdr:spPr></xdr:sp><xdr:clientData/></xdr:twoCellAnchor>"
// BU 标记栏（半透明矩形 — 分支器列标记）
const TPL_BU_MARKER  = "<xdr:twoCellAnchor><xdr:from><xdr:col>{{FROM_COL}}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>{{FROM_ROW}}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>{{TO_COL}}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>{{TO_ROW}}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:sp macro=\"\" textlink=\"\"><xdr:nvSpPr><xdr:cNvPr id=\"{{ID_0}}\" name=\"{{NAME}}\"><a:extLst><a:ext uri=\"{FF2B5EF4-FFF2-40B4-BE49-F238E27FC236}\"><a16:creationId xmlns:a16=\"http://schemas.microsoft.com/office/drawing/2014/main\" id=\"{{ID_1}}\"/></a:ext></a:extLst></xdr:cNvPr><xdr:cNvSpPr><a:spLocks noChangeArrowheads=\"1\"/></xdr:cNvSpPr></xdr:nvSpPr><xdr:spPr bwMode=\"auto\"><a:xfrm><a:off x=\"10706100\" y=\"171450\"/><a:ext cx=\"171450\" cy=\"857250\"/></a:xfrm><a:prstGeom prst=\"rect\"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val=\"333333\"><a:alpha val=\"20000\"/></a:srgbClr></a:solidFill><a:ln w=\"9525\"><a:solidFill><a:srgbClr val=\"000000\"/></a:solidFill><a:miter lim=\"800000\"/><a:headEnd/><a:tailEnd/></a:ln></xdr:spPr></xdr:sp><xdr:clientData/></xdr:twoCellAnchor>"

// BU 船形图标（复杂嵌套组 — 分支器视觉图标）
const TPL_BU_ICON    = "<xdr:twoCellAnchor><xdr:from><xdr:col>{{FROM_COL}}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>{{FROM_ROW}}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>{{TO_COL}}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>{{TO_ROW}}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:grpSp><xdr:nvGrpSpPr><xdr:cNvPr id=\"{{ID_0}}\" name=\"{{NAME}}\"><a:extLst><a:ext uri=\"{FF2B5EF4-FFF2-40B4-BE49-F238E27FC236}\"><a16:creationId xmlns:a16=\"http://schemas.microsoft.com/office/drawing/2014/main\" id=\"{{ID_1}}\"/></a:ext></a:extLst></xdr:cNvPr><xdr:cNvGrpSpPr/></xdr:nvGrpSpPr><xdr:grpSpPr><a:xfrm rot=\"5400000\"><a:off x=\"10065270\" y=\"58298\"/><a:ext cx=\"266304\" cy=\"656192\"/><a:chOff x=\"4116437\" y=\"2780928\"/><a:chExt cx=\"265325\" cy=\"732583\"/></a:xfrm><a:effectLst><a:glow rad=\"63500\"><a:srgbClr val=\"FFD200\"><a:alpha val=\"40000\"/></a:srgbClr></a:glow><a:outerShdw blurRad=\"127000\" dist=\"63500\" dir=\"2700000\" sx=\"110000\" sy=\"110000\" algn=\"tl\" rotWithShape=\"0\"><a:prstClr val=\"black\"><a:alpha val=\"50000\"/></a:prstClr></a:outerShdw></a:effectLst></xdr:grpSpPr><xdr:grpSp><xdr:nvGrpSpPr><xdr:cNvPr id=\"{{ID_2}}\" name=\"{{NAME}}\"><a:extLst><a:ext uri=\"{FF2B5EF4-FFF2-40B4-BE49-F238E27FC236}\"><a16:creationId xmlns:a16=\"http://schemas.microsoft.com/office/drawing/2014/main\" id=\"{{ID_3}}\"/></a:ext></a:extLst></xdr:cNvPr><xdr:cNvGrpSpPr/></xdr:nvGrpSpPr><xdr:grpSpPr><a:xfrm><a:off x=\"4211960\" y=\"2780928\"/><a:ext cx=\"72008\" cy=\"324036\"/><a:chOff x=\"4211960\" y=\"2780928\"/><a:chExt cx=\"72008\" cy=\"324036\"/></a:xfrm></xdr:grpSpPr><xdr:sp macro=\"\" textlink=\"\"><xdr:nvSpPr><xdr:cNvPr id=\"{{ID_4}}\" name=\"{{NAME}}\"><a:extLst><a:ext uri=\"{FF2B5EF4-FFF2-40B4-BE49-F238E27FC236}\"><a16:creationId xmlns:a16=\"http://schemas.microsoft.com/office/drawing/2014/main\" id=\"{{ID_5}}\"/></a:ext></a:extLst></xdr:cNvPr><xdr:cNvSpPr/></xdr:nvSpPr><xdr:spPr><a:xfrm><a:off x=\"4211960\" y=\"3059245\"/><a:ext cx=\"72008\" cy=\"45719\"/></a:xfrm><a:prstGeom prst=\"snip2SameRect\"><a:avLst><a:gd name=\"{{NAME}}\" fmla=\"val 19974\"/><a:gd name=\"{{NAME}}\" fmla=\"val 0\"/></a:avLst></a:prstGeom><a:gradFill rotWithShape=\"1\"><a:gsLst><a:gs pos=\"0\"><a:srgbClr val=\"FFD200\"><a:tint val=\"50000\"/><a:satMod val=\"300000\"/></a:srgbClr></a:gs><a:gs pos=\"35000\"><a:srgbClr val=\"FFD200\"><a:tint val=\"37000\"/><a:satMod val=\"300000\"/></a:srgbClr></a:gs><a:gs pos=\"100000\"><a:srgbClr val=\"FFD200\"><a:tint val=\"15000\"/><a:satMod val=\"350000\"/></a:srgbClr></a:gs></a:gsLst><a:lin ang=\"16200000\" scaled=\"1\"/></a:gradFill><a:ln w=\"9525\" cap=\"flat\" cmpd=\"sng\" algn=\"ctr\"><a:solidFill><a:srgbClr val=\"FFD200\"><a:shade val=\"95000\"/><a:satMod val=\"105000\"/></a:srgbClr></a:solidFill><a:prstDash val=\"solid\"/></a:ln><a:effectLst><a:outerShdw blurRad=\"40000\" dist=\"20000\" dir=\"5400000\" rotWithShape=\"0\"><a:srgbClr val=\"000000\"><a:alpha val=\"38000\"/></a:srgbClr></a:outerShdw></a:effectLst></xdr:spPr><xdr:style><a:lnRef idx=\"1\"><a:schemeClr val=\"accent1\"/></a:lnRef><a:fillRef idx=\"2\"><a:schemeClr val=\"accent1\"/></a:fillRef><a:effectRef idx=\"1\"><a:schemeClr val=\"accent1\"/></a:effectRef><a:fontRef idx=\"minor\"><a:schemeClr val=\"dk1\"/></a:fontRef></xdr:style><xdr:txBody><a:bodyPr wrap=\"square\" rtlCol=\"0\" anchor=\"ctr\"/><a:lstStyle><a:defPPr><a:defRPr lang=\"ja-JP\"/></a:defPPr><a:lvl1pPr algn=\"l\" rtl=\"0\" fontAlgn=\"base\"><a:spcBef><a:spcPct val=\"0\"/></a:spcBef><a:spcAft><a:spcPct val=\"0\"/></a:spcAft><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"000000\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl1pPr><a:lvl2pPr marL=\"457200\" algn=\"l\" rtl=\"0\" fontAlgn=\"base\"><a:spcBef><a:spcPct val=\"0\"/></a:spcBef><a:spcAft><a:spcPct val=\"0\"/></a:spcAft><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"000000\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl2pPr><a:lvl3pPr marL=\"914400\" algn=\"l\" rtl=\"0\" fontAlgn=\"base\"><a:spcBef><a:spcPct val=\"0\"/></a:spcBef><a:spcAft><a:spcPct val=\"0\"/></a:spcAft><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"000000\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl3pPr><a:lvl4pPr marL=\"1371600\" algn=\"l\" rtl=\"0\" fontAlgn=\"base\"><a:spcBef><a:spcPct val=\"0\"/></a:spcBef><a:spcAft><a:spcPct val=\"0\"/></a:spcAft><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"000000\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl4pPr><a:lvl5pPr marL=\"1828800\" algn=\"l\" rtl=\"0\" fontAlgn=\"base\"><a:spcBef><a:spcPct val=\"0\"/></a:spcBef><a:spcAft><a:spcPct val=\"0\"/></a:spcAft><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"000000\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl5pPr><a:lvl6pPr marL=\"2286000\" algn=\"l\" defTabSz=\"914400\" rtl=\"0\" eaLnBrk=\"1\" latinLnBrk=\"0\" hangingPunct=\"1\"><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"000000\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl6pPr><a:lvl7pPr marL=\"2743200\" algn=\"l\" defTabSz=\"914400\" rtl=\"0\" eaLnBrk=\"1\" latinLnBrk=\"0\" hangingPunct=\"1\"><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"000000\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl7pPr><a:lvl8pPr marL=\"3200400\" algn=\"l\" defTabSz=\"914400\" rtl=\"0\" eaLnBrk=\"1\" latinLnBrk=\"0\" hangingPunct=\"1\"><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"000000\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl8pPr><a:lvl9pPr marL=\"3657600\" algn=\"l\" defTabSz=\"914400\" rtl=\"0\" eaLnBrk=\"1\" latinLnBrk=\"0\" hangingPunct=\"1\"><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"000000\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl9pPr></a:lstStyle><a:p><a:pPr algn=\"ctr\"/><a:endParaRPr kumimoji=\"1\" lang=\"ja-JP\" altLang=\"en-US\"/></a:p></xdr:txBody></xdr:sp><xdr:grpSp><xdr:nvGrpSpPr><xdr:cNvPr id=\"{{ID_6}}\" name=\"{{NAME}}\"><a:extLst><a:ext uri=\"{FF2B5EF4-FFF2-40B4-BE49-F238E27FC236}\"><a16:creationId xmlns:a16=\"http://schemas.microsoft.com/office/drawing/2014/main\" id=\"{{ID_7}}\"/></a:ext></a:extLst></xdr:cNvPr><xdr:cNvGrpSpPr/></xdr:nvGrpSpPr><xdr:grpSpPr><a:xfrm><a:off x=\"4211960\" y=\"3013526\"/><a:ext cx=\"72008\" cy=\"45719\"/><a:chOff x=\"4139952\" y=\"2636912\"/><a:chExt cx=\"288032\" cy=\"301947\"/></a:xfrm></xdr:grpSpPr><xdr:sp macro=\"\" textlink=\"\"><xdr:nvSpPr><xdr:cNvPr id=\"{{ID_8}}\" name=\"{{NAME}}\"><a:extLst><a:ext uri=\"{FF2B5EF4-FFF2-40B4-BE49-F238E27FC236}\"><a16:creationId xmlns:a16=\"http://schemas.microsoft.com/office/drawing/2014/main\" id=\"{{ID_9}}\"/></a:ext></a:extLst></xdr:cNvPr><xdr:cNvSpPr/></xdr:nvSpPr><xdr:spPr><a:xfrm><a:off x=\"4139952\" y=\"2708920\"/><a:ext cx=\"288032\" cy=\"144016\"/></a:xfrm><a:prstGeom prst=\"ellipse\"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val=\"000000\"/></a:solidFill><a:ln w=\"25400\" cap=\"flat\" cmpd=\"sng\" algn=\"ctr\"><a:noFill/><a:prstDash val=\"solid\"/></a:ln><a:effectLst/></xdr:spPr><xdr:style><a:lnRef idx=\"2\"><a:schemeClr val=\"dk1\"><a:shade val=\"50000\"/></a:schemeClr></a:lnRef><a:fillRef idx=\"1\"><a:schemeClr val=\"dk1\"/></a:fillRef><a:effectRef idx=\"0\"><a:schemeClr val=\"dk1\"/></a:effectRef><a:fontRef idx=\"minor\"><a:schemeClr val=\"lt1\"/></a:fontRef></xdr:style><xdr:txBody><a:bodyPr wrap=\"square\" rtlCol=\"0\" anchor=\"ctr\"/><a:lstStyle><a:defPPr><a:defRPr lang=\"ja-JP\"/></a:defPPr><a:lvl1pPr algn=\"l\" rtl=\"0\" fontAlgn=\"base\"><a:spcBef><a:spcPct val=\"0\"/></a:spcBef><a:spcAft><a:spcPct val=\"0\"/></a:spcAft><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl1pPr><a:lvl2pPr marL=\"457200\" algn=\"l\" rtl=\"0\" fontAlgn=\"base\"><a:spcBef><a:spcPct val=\"0\"/></a:spcBef><a:spcAft><a:spcPct val=\"0\"/></a:spcAft><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl2pPr><a:lvl3pPr marL=\"914400\" algn=\"l\" rtl=\"0\" fontAlgn=\"base\"><a:spcBef><a:spcPct val=\"0\"/></a:spcBef><a:spcAft><a:spcPct val=\"0\"/></a:spcAft><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl3pPr><a:lvl4pPr marL=\"1371600\" algn=\"l\" rtl=\"0\" fontAlgn=\"base\"><a:spcBef><a:spcPct val=\"0\"/></a:spcBef><a:spcAft><a:spcPct val=\"0\"/></a:spcAft><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl4pPr><a:lvl5pPr marL=\"1828800\" algn=\"l\" rtl=\"0\" fontAlgn=\"base\"><a:spcBef><a:spcPct val=\"0\"/></a:spcBef><a:spcAft><a:spcPct val=\"0\"/></a:spcAft><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl5pPr><a:lvl6pPr marL=\"2286000\" algn=\"l\" defTabSz=\"914400\" rtl=\"0\" eaLnBrk=\"1\" latinLnBrk=\"0\" hangingPunct=\"1\"><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl6pPr><a:lvl7pPr marL=\"2743200\" algn=\"l\" defTabSz=\"914400\" rtl=\"0\" eaLnBrk=\"1\" latinLnBrk=\"0\" hangingPunct=\"1\"><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl7pPr><a:lvl8pPr marL=\"3200400\" algn=\"l\" defTabSz=\"914400\" rtl=\"0\" eaLnBrk=\"1\" latinLnBrk=\"0\" hangingPunct=\"1\"><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl8pPr><a:lvl9pPr marL=\"3657600\" algn=\"l\" defTabSz=\"914400\" rtl=\"0\" eaLnBrk=\"1\" latinLnBrk=\"0\" hangingPunct=\"1\"><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl9pPr></a:lstStyle><a:p><a:pPr algn=\"ctr\"/><a:endParaRPr kumimoji=\"1\" lang=\"ja-JP\" altLang=\"en-US\"/></a:p></xdr:txBody></xdr:sp><xdr:sp macro=\"\" textlink=\"\"><xdr:nvSpPr><xdr:cNvPr id=\"{{ID_10}}\" name=\"{{NAME}}\"><a:extLst><a:ext uri=\"{FF2B5EF4-FFF2-40B4-BE49-F238E27FC236}\"><a16:creationId xmlns:a16=\"http://schemas.microsoft.com/office/drawing/2014/main\" id=\"{{ID_11}}\"/></a:ext></a:extLst></xdr:cNvPr><xdr:cNvSpPr/></xdr:nvSpPr><xdr:spPr><a:xfrm><a:off x=\"4139952\" y=\"2794843\"/><a:ext cx=\"288032\" cy=\"144016\"/></a:xfrm><a:prstGeom prst=\"ellipse\"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val=\"000000\"/></a:solidFill><a:ln w=\"25400\" cap=\"flat\" cmpd=\"sng\" algn=\"ctr\"><a:noFill/><a:prstDash val=\"solid\"/></a:ln><a:effectLst/></xdr:spPr><xdr:style><a:lnRef idx=\"2\"><a:schemeClr val=\"dk1\"><a:shade val=\"50000\"/></a:schemeClr></a:lnRef><a:fillRef idx=\"1\"><a:schemeClr val=\"dk1\"/></a:fillRef><a:effectRef idx=\"0\"><a:schemeClr val=\"dk1\"/></a:effectRef><a:fontRef idx=\"minor\"><a:schemeClr val=\"lt1\"/></a:fontRef></xdr:style><xdr:txBody><a:bodyPr wrap=\"square\" rtlCol=\"0\" anchor=\"ctr\"/><a:lstStyle><a:defPPr><a:defRPr lang=\"ja-JP\"/></a:defPPr><a:lvl1pPr algn=\"l\" rtl=\"0\" fontAlgn=\"base\"><a:spcBef><a:spcPct val=\"0\"/></a:spcBef><a:spcAft><a:spcPct val=\"0\"/></a:spcAft><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl1pPr><a:lvl2pPr marL=\"457200\" algn=\"l\" rtl=\"0\" fontAlgn=\"base\"><a:spcBef><a:spcPct val=\"0\"/></a:spcBef><a:spcAft><a:spcPct val=\"0\"/></a:spcAft><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl2pPr><a:lvl3pPr marL=\"914400\" algn=\"l\" rtl=\"0\" fontAlgn=\"base\"><a:spcBef><a:spcPct val=\"0\"/></a:spcBef><a:spcAft><a:spcPct val=\"0\"/></a:spcAft><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl3pPr><a:lvl4pPr marL=\"1371600\" algn=\"l\" rtl=\"0\" fontAlgn=\"base\"><a:spcBef><a:spcPct val=\"0\"/></a:spcBef><a:spcAft><a:spcPct val=\"0\"/></a:spcAft><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl4pPr><a:lvl5pPr marL=\"1828800\" algn=\"l\" rtl=\"0\" fontAlgn=\"base\"><a:spcBef><a:spcPct val=\"0\"/></a:spcBef><a:spcAft><a:spcPct val=\"0\"/></a:spcAft><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl5pPr><a:lvl6pPr marL=\"2286000\" algn=\"l\" defTabSz=\"914400\" rtl=\"0\" eaLnBrk=\"1\" latinLnBrk=\"0\" hangingPunct=\"1\"><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl6pPr><a:lvl7pPr marL=\"2743200\" algn=\"l\" defTabSz=\"914400\" rtl=\"0\" eaLnBrk=\"1\" latinLnBrk=\"0\" hangingPunct=\"1\"><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl7pPr><a:lvl8pPr marL=\"3200400\" algn=\"l\" defTabSz=\"914400\" rtl=\"0\" eaLnBrk=\"1\" latinLnBrk=\"0\" hangingPunct=\"1\"><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl8pPr><a:lvl9pPr marL=\"3657600\" algn=\"l\" defTabSz=\"914400\" rtl=\"0\" eaLnBrk=\"1\" latinLnBrk=\"0\" hangingPunct=\"1\"><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl9pPr></a:lstStyle><a:p><a:pPr algn=\"ctr\"/><a:endParaRPr kumimoji=\"1\" lang=\"ja-JP\" altLang=\"en-US\"/></a:p></xdr:txBody></xdr:sp><xdr:sp macro=\"\" textlink=\"\"><xdr:nvSpPr><xdr:cNvPr id=\"{{ID_12}}\" name=\"{{NAME}}\"><a:extLst><a:ext uri=\"{FF2B5EF4-FFF2-40B4-BE49-F238E27FC236}\"><a16:creationId xmlns:a16=\"http://schemas.microsoft.com/office/drawing/2014/main\" id=\"{{ID_13}}\"/></a:ext></a:extLst></xdr:cNvPr><xdr:cNvSpPr/></xdr:nvSpPr><xdr:spPr><a:xfrm><a:off x=\"4139952\" y=\"2636912\"/><a:ext cx=\"288032\" cy=\"144016\"/></a:xfrm><a:prstGeom prst=\"ellipse\"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val=\"000000\"/></a:solidFill><a:ln w=\"25400\" cap=\"flat\" cmpd=\"sng\" algn=\"ctr\"><a:noFill/><a:prstDash val=\"solid\"/></a:ln><a:effectLst/></xdr:spPr><xdr:style><a:lnRef idx=\"2\"><a:schemeClr val=\"dk1\"><a:shade val=\"50000\"/></a:schemeClr></a:lnRef><a:fillRef idx=\"1\"><a:schemeClr val=\"dk1\"/></a:fillRef><a:effectRef idx=\"0\"><a:schemeClr val=\"dk1\"/></a:effectRef><a:fontRef idx=\"minor\"><a:schemeClr val=\"lt1\"/></a:fontRef></xdr:style><xdr:txBody><a:bodyPr wrap=\"square\" rtlCol=\"0\" anchor=\"ctr\"/><a:lstStyle><a:defPPr><a:defRPr lang=\"ja-JP\"/></a:defPPr><a:lvl1pPr algn=\"l\" rtl=\"0\" fontAlgn=\"base\"><a:spcBef><a:spcPct val=\"0\"/></a:spcBef><a:spcAft><a:spcPct val=\"0\"/></a:spcAft><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl1pPr><a:lvl2pPr marL=\"457200\" algn=\"l\" rtl=\"0\" fontAlgn=\"base\"><a:spcBef><a:spcPct val=\"0\"/></a:spcBef><a:spcAft><a:spcPct val=\"0\"/></a:spcAft><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl2pPr><a:lvl3pPr marL=\"914400\" algn=\"l\" rtl=\"0\" fontAlgn=\"base\"><a:spcBef><a:spcPct val=\"0\"/></a:spcBef><a:spcAft><a:spcPct val=\"0\"/></a:spcAft><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl3pPr><a:lvl4pPr marL=\"1371600\" algn=\"l\" rtl=\"0\" fontAlgn=\"base\"><a:spcBef><a:spcPct val=\"0\"/></a:spcBef><a:spcAft><a:spcPct val=\"0\"/></a:spcAft><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl4pPr><a:lvl5pPr marL=\"1828800\" algn=\"l\" rtl=\"0\" fontAlgn=\"base\"><a:spcBef><a:spcPct val=\"0\"/></a:spcBef><a:spcAft><a:spcPct val=\"0\"/></a:spcAft><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl5pPr><a:lvl6pPr marL=\"2286000\" algn=\"l\" defTabSz=\"914400\" rtl=\"0\" eaLnBrk=\"1\" latinLnBrk=\"0\" hangingPunct=\"1\"><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl6pPr><a:lvl7pPr marL=\"2743200\" algn=\"l\" defTabSz=\"914400\" rtl=\"0\" eaLnBrk=\"1\" latinLnBrk=\"0\" hangingPunct=\"1\"><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl7pPr><a:lvl8pPr marL=\"3200400\" algn=\"l\" defTabSz=\"914400\" rtl=\"0\" eaLnBrk=\"1\" latinLnBrk=\"0\" hangingPunct=\"1\"><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl8pPr><a:lvl9pPr marL=\"3657600\" algn=\"l\" defTabSz=\"914400\" rtl=\"0\" eaLnBrk=\"1\" latinLnBrk=\"0\" hangingPunct=\"1\"><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl9pPr></a:lstStyle><a:p><a:pPr algn=\"ctr\"/><a:endParaRPr kumimoji=\"1\" lang=\"ja-JP\" altLang=\"en-US\"/></a:p></xdr:txBody></xdr:sp></xdr:grpSp><xdr:sp macro=\"\" textlink=\"\"><xdr:nvSpPr><xdr:cNvPr id=\"{{ID_14}}\" name=\"{{NAME}}\"><a:extLst><a:ext uri=\"{FF2B5EF4-FFF2-40B4-BE49-F238E27FC236}\"><a16:creationId xmlns:a16=\"http://schemas.microsoft.com/office/drawing/2014/main\" id=\"{{ID_15}}\"/></a:ext></a:extLst></xdr:cNvPr><xdr:cNvSpPr/></xdr:nvSpPr><xdr:spPr><a:xfrm rot=\"10800000\"><a:off x=\"4211960\" y=\"2960948\"/><a:ext cx=\"72008\" cy=\"52578\"/></a:xfrm><a:prstGeom prst=\"trapezoid\"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val=\"000000\"/></a:solidFill><a:ln w=\"25400\" cap=\"flat\" cmpd=\"sng\" algn=\"ctr\"><a:noFill/><a:prstDash val=\"solid\"/></a:ln><a:effectLst/></xdr:spPr><xdr:style><a:lnRef idx=\"2\"><a:schemeClr val=\"dk1\"><a:shade val=\"50000\"/></a:schemeClr></a:lnRef><a:fillRef idx=\"1\"><a:schemeClr val=\"dk1\"/></a:fillRef><a:effectRef idx=\"0\"><a:schemeClr val=\"dk1\"/></a:effectRef><a:fontRef idx=\"minor\"><a:schemeClr val=\"lt1\"/></a:fontRef></xdr:style><xdr:txBody><a:bodyPr wrap=\"square\" rtlCol=\"0\" anchor=\"ctr\"/><a:lstStyle><a:defPPr><a:defRPr lang=\"ja-JP\"/></a:defPPr><a:lvl1pPr algn=\"l\" rtl=\"0\" fontAlgn=\"base\"><a:spcBef><a:spcPct val=\"0\"/></a:spcBef><a:spcAft><a:spcPct val=\"0\"/></a:spcAft><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl1pPr><a:lvl2pPr marL=\"457200\" algn=\"l\" rtl=\"0\" fontAlgn=\"base\"><a:spcBef><a:spcPct val=\"0\"/></a:spcBef><a:spcAft><a:spcPct val=\"0\"/></a:spcAft><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl2pPr><a:lvl3pPr marL=\"914400\" algn=\"l\" rtl=\"0\" fontAlgn=\"base\"><a:spcBef><a:spcPct val=\"0\"/></a:spcBef><a:spcAft><a:spcPct val=\"0\"/></a:spcAft><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl3pPr><a:lvl4pPr marL=\"1371600\" algn=\"l\" rtl=\"0\" fontAlgn=\"base\"><a:spcBef><a:spcPct val=\"0\"/></a:spcBef><a:spcAft><a:spcPct val=\"0\"/></a:spcAft><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl4pPr><a:lvl5pPr marL=\"1828800\" algn=\"l\" rtl=\"0\" fontAlgn=\"base\"><a:spcBef><a:spcPct val=\"0\"/></a:spcBef><a:spcAft><a:spcPct val=\"0\"/></a:spcAft><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl5pPr><a:lvl6pPr marL=\"2286000\" algn=\"l\" defTabSz=\"914400\" rtl=\"0\" eaLnBrk=\"1\" latinLnBrk=\"0\" hangingPunct=\"1\"><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl6pPr><a:lvl7pPr marL=\"2743200\" algn=\"l\" defTabSz=\"914400\" rtl=\"0\" eaLnBrk=\"1\" latinLnBrk=\"0\" hangingPunct=\"1\"><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl7pPr><a:lvl8pPr marL=\"3200400\" algn=\"l\" defTabSz=\"914400\" rtl=\"0\" eaLnBrk=\"1\" latinLnBrk=\"0\" hangingPunct=\"1\"><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl8pPr><a:lvl9pPr marL=\"3657600\" algn=\"l\" defTabSz=\"914400\" rtl=\"0\" eaLnBrk=\"1\" latinLnBrk=\"0\" hangingPunct=\"1\"><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl9pPr></a:lstStyle><a:p><a:pPr algn=\"ctr\"/><a:endParaRPr kumimoji=\"1\" lang=\"ja-JP\" altLang=\"en-US\"/></a:p></xdr:txBody></xdr:sp><xdr:sp macro=\"\" textlink=\"\"><xdr:nvSpPr><xdr:cNvPr id=\"{{ID_16}}\" name=\"{{NAME}}\"><a:extLst><a:ext uri=\"{FF2B5EF4-FFF2-40B4-BE49-F238E27FC236}\"><a16:creationId xmlns:a16=\"http://schemas.microsoft.com/office/drawing/2014/main\" id=\"{{ID_17}}\"/></a:ext></a:extLst></xdr:cNvPr><xdr:cNvSpPr/></xdr:nvSpPr><xdr:spPr><a:xfrm><a:off x=\"4211960\" y=\"2780928\"/><a:ext cx=\"72008\" cy=\"180020\"/></a:xfrm><a:prstGeom prst=\"trapezoid\"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val=\"000000\"/></a:solidFill><a:ln w=\"25400\" cap=\"flat\" cmpd=\"sng\" algn=\"ctr\"><a:noFill/><a:prstDash val=\"solid\"/></a:ln><a:effectLst/></xdr:spPr><xdr:style><a:lnRef idx=\"2\"><a:schemeClr val=\"dk1\"><a:shade val=\"50000\"/></a:schemeClr></a:lnRef><a:fillRef idx=\"1\"><a:schemeClr val=\"dk1\"/></a:fillRef><a:effectRef idx=\"0\"><a:schemeClr val=\"dk1\"/></a:effectRef><a:fontRef idx=\"minor\"><a:schemeClr val=\"lt1\"/></a:fontRef></xdr:style><xdr:txBody><a:bodyPr wrap=\"square\" rtlCol=\"0\" anchor=\"ctr\"/><a:lstStyle><a:defPPr><a:defRPr lang=\"ja-JP\"/></a:defPPr><a:lvl1pPr algn=\"l\" rtl=\"0\" fontAlgn=\"base\"><a:spcBef><a:spcPct val=\"0\"/></a:spcBef><a:spcAft><a:spcPct val=\"0\"/></a:spcAft><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl1pPr><a:lvl2pPr marL=\"457200\" algn=\"l\" rtl=\"0\" fontAlgn=\"base\"><a:spcBef><a:spcPct val=\"0\"/></a:spcBef><a:spcAft><a:spcPct val=\"0\"/></a:spcAft><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl2pPr><a:lvl3pPr marL=\"914400\" algn=\"l\" rtl=\"0\" fontAlgn=\"base\"><a:spcBef><a:spcPct val=\"0\"/></a:spcBef><a:spcAft><a:spcPct val=\"0\"/></a:spcAft><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl3pPr><a:lvl4pPr marL=\"1371600\" algn=\"l\" rtl=\"0\" fontAlgn=\"base\"><a:spcBef><a:spcPct val=\"0\"/></a:spcBef><a:spcAft><a:spcPct val=\"0\"/></a:spcAft><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl4pPr><a:lvl5pPr marL=\"1828800\" algn=\"l\" rtl=\"0\" fontAlgn=\"base\"><a:spcBef><a:spcPct val=\"0\"/></a:spcBef><a:spcAft><a:spcPct val=\"0\"/></a:spcAft><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl5pPr><a:lvl6pPr marL=\"2286000\" algn=\"l\" defTabSz=\"914400\" rtl=\"0\" eaLnBrk=\"1\" latinLnBrk=\"0\" hangingPunct=\"1\"><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl6pPr><a:lvl7pPr marL=\"2743200\" algn=\"l\" defTabSz=\"914400\" rtl=\"0\" eaLnBrk=\"1\" latinLnBrk=\"0\" hangingPunct=\"1\"><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl7pPr><a:lvl8pPr marL=\"3200400\" algn=\"l\" defTabSz=\"914400\" rtl=\"0\" eaLnBrk=\"1\" latinLnBrk=\"0\" hangingPunct=\"1\"><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl8pPr><a:lvl9pPr marL=\"3657600\" algn=\"l\" defTabSz=\"914400\" rtl=\"0\" eaLnBrk=\"1\" latinLnBrk=\"0\" hangingPunct=\"1\"><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl9pPr></a:lstStyle><a:p><a:pPr algn=\"ctr\"/><a:endParaRPr kumimoji=\"1\" lang=\"ja-JP\" altLang=\"en-US\"/></a:p></xdr:txBody></xdr:sp></xdr:grpSp><xdr:grpSp><xdr:nvGrpSpPr><xdr:cNvPr id=\"{{ID_18}}\" name=\"{{NAME}}\"><a:extLst><a:ext uri=\"{FF2B5EF4-FFF2-40B4-BE49-F238E27FC236}\"><a16:creationId xmlns:a16=\"http://schemas.microsoft.com/office/drawing/2014/main\" id=\"{{ID_19}}\"/></a:ext></a:extLst></xdr:cNvPr><xdr:cNvGrpSpPr/></xdr:nvGrpSpPr><xdr:grpSpPr><a:xfrm rot=\"9000000\"><a:off x=\"4309754\" y=\"3235194\"/><a:ext cx=\"72008\" cy=\"278317\"/><a:chOff x=\"4211960\" y=\"2780928\"/><a:chExt cx=\"72008\" cy=\"278317\"/></a:xfrm></xdr:grpSpPr><xdr:grpSp><xdr:nvGrpSpPr><xdr:cNvPr id=\"{{ID_20}}\" name=\"{{NAME}}\"><a:extLst><a:ext uri=\"{FF2B5EF4-FFF2-40B4-BE49-F238E27FC236}\"><a16:creationId xmlns:a16=\"http://schemas.microsoft.com/office/drawing/2014/main\" id=\"{{ID_21}}\"/></a:ext></a:extLst></xdr:cNvPr><xdr:cNvGrpSpPr/></xdr:nvGrpSpPr><xdr:grpSpPr><a:xfrm><a:off x=\"4211960\" y=\"3013526\"/><a:ext cx=\"72008\" cy=\"45719\"/><a:chOff x=\"4139952\" y=\"2636912\"/><a:chExt cx=\"288032\" cy=\"301947\"/></a:xfrm></xdr:grpSpPr><xdr:sp macro=\"\" textlink=\"\"><xdr:nvSpPr><xdr:cNvPr id=\"{{ID_22}}\" name=\"{{NAME}}\"><a:extLst><a:ext uri=\"{FF2B5EF4-FFF2-40B4-BE49-F238E27FC236}\"><a16:creationId xmlns:a16=\"http://schemas.microsoft.com/office/drawing/2014/main\" id=\"{{ID_23}}\"/></a:ext></a:extLst></xdr:cNvPr><xdr:cNvSpPr/></xdr:nvSpPr><xdr:spPr><a:xfrm><a:off x=\"4139952\" y=\"2708920\"/><a:ext cx=\"288032\" cy=\"144016\"/></a:xfrm><a:prstGeom prst=\"ellipse\"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val=\"000000\"/></a:solidFill><a:ln w=\"25400\" cap=\"flat\" cmpd=\"sng\" algn=\"ctr\"><a:noFill/><a:prstDash val=\"solid\"/></a:ln><a:effectLst/></xdr:spPr><xdr:style><a:lnRef idx=\"2\"><a:schemeClr val=\"dk1\"><a:shade val=\"50000\"/></a:schemeClr></a:lnRef><a:fillRef idx=\"1\"><a:schemeClr val=\"dk1\"/></a:fillRef><a:effectRef idx=\"0\"><a:schemeClr val=\"dk1\"/></a:effectRef><a:fontRef idx=\"minor\"><a:schemeClr val=\"lt1\"/></a:fontRef></xdr:style><xdr:txBody><a:bodyPr wrap=\"square\" rtlCol=\"0\" anchor=\"ctr\"/><a:lstStyle><a:defPPr><a:defRPr lang=\"ja-JP\"/></a:defPPr><a:lvl1pPr algn=\"l\" rtl=\"0\" fontAlgn=\"base\"><a:spcBef><a:spcPct val=\"0\"/></a:spcBef><a:spcAft><a:spcPct val=\"0\"/></a:spcAft><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl1pPr><a:lvl2pPr marL=\"457200\" algn=\"l\" rtl=\"0\" fontAlgn=\"base\"><a:spcBef><a:spcPct val=\"0\"/></a:spcBef><a:spcAft><a:spcPct val=\"0\"/></a:spcAft><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl2pPr><a:lvl3pPr marL=\"914400\" algn=\"l\" rtl=\"0\" fontAlgn=\"base\"><a:spcBef><a:spcPct val=\"0\"/></a:spcBef><a:spcAft><a:spcPct val=\"0\"/></a:spcAft><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl3pPr><a:lvl4pPr marL=\"1371600\" algn=\"l\" rtl=\"0\" fontAlgn=\"base\"><a:spcBef><a:spcPct val=\"0\"/></a:spcBef><a:spcAft><a:spcPct val=\"0\"/></a:spcAft><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl4pPr><a:lvl5pPr marL=\"1828800\" algn=\"l\" rtl=\"0\" fontAlgn=\"base\"><a:spcBef><a:spcPct val=\"0\"/></a:spcBef><a:spcAft><a:spcPct val=\"0\"/></a:spcAft><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl5pPr><a:lvl6pPr marL=\"2286000\" algn=\"l\" defTabSz=\"914400\" rtl=\"0\" eaLnBrk=\"1\" latinLnBrk=\"0\" hangingPunct=\"1\"><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl6pPr><a:lvl7pPr marL=\"2743200\" algn=\"l\" defTabSz=\"914400\" rtl=\"0\" eaLnBrk=\"1\" latinLnBrk=\"0\" hangingPunct=\"1\"><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl7pPr><a:lvl8pPr marL=\"3200400\" algn=\"l\" defTabSz=\"914400\" rtl=\"0\" eaLnBrk=\"1\" latinLnBrk=\"0\" hangingPunct=\"1\"><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl8pPr><a:lvl9pPr marL=\"3657600\" algn=\"l\" defTabSz=\"914400\" rtl=\"0\" eaLnBrk=\"1\" latinLnBrk=\"0\" hangingPunct=\"1\"><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl9pPr></a:lstStyle><a:p><a:pPr algn=\"ctr\"/><a:endParaRPr kumimoji=\"1\" lang=\"ja-JP\" altLang=\"en-US\"/></a:p></xdr:txBody></xdr:sp><xdr:sp macro=\"\" textlink=\"\"><xdr:nvSpPr><xdr:cNvPr id=\"{{ID_24}}\" name=\"{{NAME}}\"><a:extLst><a:ext uri=\"{FF2B5EF4-FFF2-40B4-BE49-F238E27FC236}\"><a16:creationId xmlns:a16=\"http://schemas.microsoft.com/office/drawing/2014/main\" id=\"{{ID_25}}\"/></a:ext></a:extLst></xdr:cNvPr><xdr:cNvSpPr/></xdr:nvSpPr><xdr:spPr><a:xfrm><a:off x=\"4139952\" y=\"2794843\"/><a:ext cx=\"288032\" cy=\"144016\"/></a:xfrm><a:prstGeom prst=\"ellipse\"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val=\"000000\"/></a:solidFill><a:ln w=\"25400\" cap=\"flat\" cmpd=\"sng\" algn=\"ctr\"><a:noFill/><a:prstDash val=\"solid\"/></a:ln><a:effectLst/></xdr:spPr><xdr:style><a:lnRef idx=\"2\"><a:schemeClr val=\"dk1\"><a:shade val=\"50000\"/></a:schemeClr></a:lnRef><a:fillRef idx=\"1\"><a:schemeClr val=\"dk1\"/></a:fillRef><a:effectRef idx=\"0\"><a:schemeClr val=\"dk1\"/></a:effectRef><a:fontRef idx=\"minor\"><a:schemeClr val=\"lt1\"/></a:fontRef></xdr:style><xdr:txBody><a:bodyPr wrap=\"square\" rtlCol=\"0\" anchor=\"ctr\"/><a:lstStyle><a:defPPr><a:defRPr lang=\"ja-JP\"/></a:defPPr><a:lvl1pPr algn=\"l\" rtl=\"0\" fontAlgn=\"base\"><a:spcBef><a:spcPct val=\"0\"/></a:spcBef><a:spcAft><a:spcPct val=\"0\"/></a:spcAft><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl1pPr><a:lvl2pPr marL=\"457200\" algn=\"l\" rtl=\"0\" fontAlgn=\"base\"><a:spcBef><a:spcPct val=\"0\"/></a:spcBef><a:spcAft><a:spcPct val=\"0\"/></a:spcAft><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl2pPr><a:lvl3pPr marL=\"914400\" algn=\"l\" rtl=\"0\" fontAlgn=\"base\"><a:spcBef><a:spcPct val=\"0\"/></a:spcBef><a:spcAft><a:spcPct val=\"0\"/></a:spcAft><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl3pPr><a:lvl4pPr marL=\"1371600\" algn=\"l\" rtl=\"0\" fontAlgn=\"base\"><a:spcBef><a:spcPct val=\"0\"/></a:spcBef><a:spcAft><a:spcPct val=\"0\"/></a:spcAft><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl4pPr><a:lvl5pPr marL=\"1828800\" algn=\"l\" rtl=\"0\" fontAlgn=\"base\"><a:spcBef><a:spcPct val=\"0\"/></a:spcBef><a:spcAft><a:spcPct val=\"0\"/></a:spcAft><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl5pPr><a:lvl6pPr marL=\"2286000\" algn=\"l\" defTabSz=\"914400\" rtl=\"0\" eaLnBrk=\"1\" latinLnBrk=\"0\" hangingPunct=\"1\"><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl6pPr><a:lvl7pPr marL=\"2743200\" algn=\"l\" defTabSz=\"914400\" rtl=\"0\" eaLnBrk=\"1\" latinLnBrk=\"0\" hangingPunct=\"1\"><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl7pPr><a:lvl8pPr marL=\"3200400\" algn=\"l\" defTabSz=\"914400\" rtl=\"0\" eaLnBrk=\"1\" latinLnBrk=\"0\" hangingPunct=\"1\"><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl8pPr><a:lvl9pPr marL=\"3657600\" algn=\"l\" defTabSz=\"914400\" rtl=\"0\" eaLnBrk=\"1\" latinLnBrk=\"0\" hangingPunct=\"1\"><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl9pPr></a:lstStyle><a:p><a:pPr algn=\"ctr\"/><a:endParaRPr kumimoji=\"1\" lang=\"ja-JP\" altLang=\"en-US\"/></a:p></xdr:txBody></xdr:sp><xdr:sp macro=\"\" textlink=\"\"><xdr:nvSpPr><xdr:cNvPr id=\"{{ID_26}}\" name=\"{{NAME}}\"><a:extLst><a:ext uri=\"{FF2B5EF4-FFF2-40B4-BE49-F238E27FC236}\"><a16:creationId xmlns:a16=\"http://schemas.microsoft.com/office/drawing/2014/main\" id=\"{{ID_27}}\"/></a:ext></a:extLst></xdr:cNvPr><xdr:cNvSpPr/></xdr:nvSpPr><xdr:spPr><a:xfrm><a:off x=\"4139952\" y=\"2636912\"/><a:ext cx=\"288032\" cy=\"144016\"/></a:xfrm><a:prstGeom prst=\"ellipse\"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val=\"000000\"/></a:solidFill><a:ln w=\"25400\" cap=\"flat\" cmpd=\"sng\" algn=\"ctr\"><a:noFill/><a:prstDash val=\"solid\"/></a:ln><a:effectLst/></xdr:spPr><xdr:style><a:lnRef idx=\"2\"><a:schemeClr val=\"dk1\"><a:shade val=\"50000\"/></a:schemeClr></a:lnRef><a:fillRef idx=\"1\"><a:schemeClr val=\"dk1\"/></a:fillRef><a:effectRef idx=\"0\"><a:schemeClr val=\"dk1\"/></a:effectRef><a:fontRef idx=\"minor\"><a:schemeClr val=\"lt1\"/></a:fontRef></xdr:style><xdr:txBody><a:bodyPr wrap=\"square\" rtlCol=\"0\" anchor=\"ctr\"/><a:lstStyle><a:defPPr><a:defRPr lang=\"ja-JP\"/></a:defPPr><a:lvl1pPr algn=\"l\" rtl=\"0\" fontAlgn=\"base\"><a:spcBef><a:spcPct val=\"0\"/></a:spcBef><a:spcAft><a:spcPct val=\"0\"/></a:spcAft><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl1pPr><a:lvl2pPr marL=\"457200\" algn=\"l\" rtl=\"0\" fontAlgn=\"base\"><a:spcBef><a:spcPct val=\"0\"/></a:spcBef><a:spcAft><a:spcPct val=\"0\"/></a:spcAft><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl2pPr><a:lvl3pPr marL=\"914400\" algn=\"l\" rtl=\"0\" fontAlgn=\"base\"><a:spcBef><a:spcPct val=\"0\"/></a:spcBef><a:spcAft><a:spcPct val=\"0\"/></a:spcAft><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl3pPr><a:lvl4pPr marL=\"1371600\" algn=\"l\" rtl=\"0\" fontAlgn=\"base\"><a:spcBef><a:spcPct val=\"0\"/></a:spcBef><a:spcAft><a:spcPct val=\"0\"/></a:spcAft><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl4pPr><a:lvl5pPr marL=\"1828800\" algn=\"l\" rtl=\"0\" fontAlgn=\"base\"><a:spcBef><a:spcPct val=\"0\"/></a:spcBef><a:spcAft><a:spcPct val=\"0\"/></a:spcAft><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl5pPr><a:lvl6pPr marL=\"2286000\" algn=\"l\" defTabSz=\"914400\" rtl=\"0\" eaLnBrk=\"1\" latinLnBrk=\"0\" hangingPunct=\"1\"><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl6pPr><a:lvl7pPr marL=\"2743200\" algn=\"l\" defTabSz=\"914400\" rtl=\"0\" eaLnBrk=\"1\" latinLnBrk=\"0\" hangingPunct=\"1\"><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl7pPr><a:lvl8pPr marL=\"3200400\" algn=\"l\" defTabSz=\"914400\" rtl=\"0\" eaLnBrk=\"1\" latinLnBrk=\"0\" hangingPunct=\"1\"><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl8pPr><a:lvl9pPr marL=\"3657600\" algn=\"l\" defTabSz=\"914400\" rtl=\"0\" eaLnBrk=\"1\" latinLnBrk=\"0\" hangingPunct=\"1\"><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl9pPr></a:lstStyle><a:p><a:pPr algn=\"ctr\"/><a:endParaRPr kumimoji=\"1\" lang=\"ja-JP\" altLang=\"en-US\"/></a:p></xdr:txBody></xdr:sp></xdr:grpSp><xdr:sp macro=\"\" textlink=\"\"><xdr:nvSpPr><xdr:cNvPr id=\"{{ID_28}}\" name=\"{{NAME}}\"><a:extLst><a:ext uri=\"{FF2B5EF4-FFF2-40B4-BE49-F238E27FC236}\"><a16:creationId xmlns:a16=\"http://schemas.microsoft.com/office/drawing/2014/main\" id=\"{{ID_29}}\"/></a:ext></a:extLst></xdr:cNvPr><xdr:cNvSpPr/></xdr:nvSpPr><xdr:spPr><a:xfrm rot=\"10800000\"><a:off x=\"4211960\" y=\"2960948\"/><a:ext cx=\"72008\" cy=\"52578\"/></a:xfrm><a:prstGeom prst=\"trapezoid\"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val=\"000000\"/></a:solidFill><a:ln w=\"25400\" cap=\"flat\" cmpd=\"sng\" algn=\"ctr\"><a:noFill/><a:prstDash val=\"solid\"/></a:ln><a:effectLst/></xdr:spPr><xdr:style><a:lnRef idx=\"2\"><a:schemeClr val=\"dk1\"><a:shade val=\"50000\"/></a:schemeClr></a:lnRef><a:fillRef idx=\"1\"><a:schemeClr val=\"dk1\"/></a:fillRef><a:effectRef idx=\"0\"><a:schemeClr val=\"dk1\"/></a:effectRef><a:fontRef idx=\"minor\"><a:schemeClr val=\"lt1\"/></a:fontRef></xdr:style><xdr:txBody><a:bodyPr wrap=\"square\" rtlCol=\"0\" anchor=\"ctr\"/><a:lstStyle><a:defPPr><a:defRPr lang=\"ja-JP\"/></a:defPPr><a:lvl1pPr algn=\"l\" rtl=\"0\" fontAlgn=\"base\"><a:spcBef><a:spcPct val=\"0\"/></a:spcBef><a:spcAft><a:spcPct val=\"0\"/></a:spcAft><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl1pPr><a:lvl2pPr marL=\"457200\" algn=\"l\" rtl=\"0\" fontAlgn=\"base\"><a:spcBef><a:spcPct val=\"0\"/></a:spcBef><a:spcAft><a:spcPct val=\"0\"/></a:spcAft><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl2pPr><a:lvl3pPr marL=\"914400\" algn=\"l\" rtl=\"0\" fontAlgn=\"base\"><a:spcBef><a:spcPct val=\"0\"/></a:spcBef><a:spcAft><a:spcPct val=\"0\"/></a:spcAft><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl3pPr><a:lvl4pPr marL=\"1371600\" algn=\"l\" rtl=\"0\" fontAlgn=\"base\"><a:spcBef><a:spcPct val=\"0\"/></a:spcBef><a:spcAft><a:spcPct val=\"0\"/></a:spcAft><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl4pPr><a:lvl5pPr marL=\"1828800\" algn=\"l\" rtl=\"0\" fontAlgn=\"base\"><a:spcBef><a:spcPct val=\"0\"/></a:spcBef><a:spcAft><a:spcPct val=\"0\"/></a:spcAft><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl5pPr><a:lvl6pPr marL=\"2286000\" algn=\"l\" defTabSz=\"914400\" rtl=\"0\" eaLnBrk=\"1\" latinLnBrk=\"0\" hangingPunct=\"1\"><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl6pPr><a:lvl7pPr marL=\"2743200\" algn=\"l\" defTabSz=\"914400\" rtl=\"0\" eaLnBrk=\"1\" latinLnBrk=\"0\" hangingPunct=\"1\"><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl7pPr><a:lvl8pPr marL=\"3200400\" algn=\"l\" defTabSz=\"914400\" rtl=\"0\" eaLnBrk=\"1\" latinLnBrk=\"0\" hangingPunct=\"1\"><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl8pPr><a:lvl9pPr marL=\"3657600\" algn=\"l\" defTabSz=\"914400\" rtl=\"0\" eaLnBrk=\"1\" latinLnBrk=\"0\" hangingPunct=\"1\"><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl9pPr></a:lstStyle><a:p><a:pPr algn=\"ctr\"/><a:endParaRPr kumimoji=\"1\" lang=\"ja-JP\" altLang=\"en-US\"/></a:p></xdr:txBody></xdr:sp><xdr:sp macro=\"\" textlink=\"\"><xdr:nvSpPr><xdr:cNvPr id=\"{{ID_30}}\" name=\"{{NAME}}\"><a:extLst><a:ext uri=\"{FF2B5EF4-FFF2-40B4-BE49-F238E27FC236}\"><a16:creationId xmlns:a16=\"http://schemas.microsoft.com/office/drawing/2014/main\" id=\"{{ID_31}}\"/></a:ext></a:extLst></xdr:cNvPr><xdr:cNvSpPr/></xdr:nvSpPr><xdr:spPr><a:xfrm><a:off x=\"4211960\" y=\"2780928\"/><a:ext cx=\"72008\" cy=\"180020\"/></a:xfrm><a:prstGeom prst=\"trapezoid\"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val=\"000000\"/></a:solidFill><a:ln w=\"25400\" cap=\"flat\" cmpd=\"sng\" algn=\"ctr\"><a:noFill/><a:prstDash val=\"solid\"/></a:ln><a:effectLst/></xdr:spPr><xdr:style><a:lnRef idx=\"2\"><a:schemeClr val=\"dk1\"><a:shade val=\"50000\"/></a:schemeClr></a:lnRef><a:fillRef idx=\"1\"><a:schemeClr val=\"dk1\"/></a:fillRef><a:effectRef idx=\"0\"><a:schemeClr val=\"dk1\"/></a:effectRef><a:fontRef idx=\"minor\"><a:schemeClr val=\"lt1\"/></a:fontRef></xdr:style><xdr:txBody><a:bodyPr wrap=\"square\" rtlCol=\"0\" anchor=\"ctr\"/><a:lstStyle><a:defPPr><a:defRPr lang=\"ja-JP\"/></a:defPPr><a:lvl1pPr algn=\"l\" rtl=\"0\" fontAlgn=\"base\"><a:spcBef><a:spcPct val=\"0\"/></a:spcBef><a:spcAft><a:spcPct val=\"0\"/></a:spcAft><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl1pPr><a:lvl2pPr marL=\"457200\" algn=\"l\" rtl=\"0\" fontAlgn=\"base\"><a:spcBef><a:spcPct val=\"0\"/></a:spcBef><a:spcAft><a:spcPct val=\"0\"/></a:spcAft><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl2pPr><a:lvl3pPr marL=\"914400\" algn=\"l\" rtl=\"0\" fontAlgn=\"base\"><a:spcBef><a:spcPct val=\"0\"/></a:spcBef><a:spcAft><a:spcPct val=\"0\"/></a:spcAft><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl3pPr><a:lvl4pPr marL=\"1371600\" algn=\"l\" rtl=\"0\" fontAlgn=\"base\"><a:spcBef><a:spcPct val=\"0\"/></a:spcBef><a:spcAft><a:spcPct val=\"0\"/></a:spcAft><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl4pPr><a:lvl5pPr marL=\"1828800\" algn=\"l\" rtl=\"0\" fontAlgn=\"base\"><a:spcBef><a:spcPct val=\"0\"/></a:spcBef><a:spcAft><a:spcPct val=\"0\"/></a:spcAft><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl5pPr><a:lvl6pPr marL=\"2286000\" algn=\"l\" defTabSz=\"914400\" rtl=\"0\" eaLnBrk=\"1\" latinLnBrk=\"0\" hangingPunct=\"1\"><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl6pPr><a:lvl7pPr marL=\"2743200\" algn=\"l\" defTabSz=\"914400\" rtl=\"0\" eaLnBrk=\"1\" latinLnBrk=\"0\" hangingPunct=\"1\"><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl7pPr><a:lvl8pPr marL=\"3200400\" algn=\"l\" defTabSz=\"914400\" rtl=\"0\" eaLnBrk=\"1\" latinLnBrk=\"0\" hangingPunct=\"1\"><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl8pPr><a:lvl9pPr marL=\"3657600\" algn=\"l\" defTabSz=\"914400\" rtl=\"0\" eaLnBrk=\"1\" latinLnBrk=\"0\" hangingPunct=\"1\"><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl9pPr></a:lstStyle><a:p><a:pPr algn=\"ctr\"/><a:endParaRPr kumimoji=\"1\" lang=\"ja-JP\" altLang=\"en-US\"/></a:p></xdr:txBody></xdr:sp></xdr:grpSp><xdr:grpSp><xdr:nvGrpSpPr><xdr:cNvPr id=\"{{ID_32}}\" name=\"{{NAME}}\"><a:extLst><a:ext uri=\"{FF2B5EF4-FFF2-40B4-BE49-F238E27FC236}\"><a16:creationId xmlns:a16=\"http://schemas.microsoft.com/office/drawing/2014/main\" id=\"{{ID_33}}\"/></a:ext></a:extLst></xdr:cNvPr><xdr:cNvGrpSpPr/></xdr:nvGrpSpPr><xdr:grpSpPr><a:xfrm rot=\"12600000\"><a:off x=\"4116437\" y=\"3235194\"/><a:ext cx=\"72008\" cy=\"278317\"/><a:chOff x=\"4211960\" y=\"2780928\"/><a:chExt cx=\"72008\" cy=\"278317\"/></a:xfrm></xdr:grpSpPr><xdr:grpSp><xdr:nvGrpSpPr><xdr:cNvPr id=\"{{ID_34}}\" name=\"{{NAME}}\"><a:extLst><a:ext uri=\"{FF2B5EF4-FFF2-40B4-BE49-F238E27FC236}\"><a16:creationId xmlns:a16=\"http://schemas.microsoft.com/office/drawing/2014/main\" id=\"{{ID_35}}\"/></a:ext></a:extLst></xdr:cNvPr><xdr:cNvGrpSpPr/></xdr:nvGrpSpPr><xdr:grpSpPr><a:xfrm><a:off x=\"4211960\" y=\"3013526\"/><a:ext cx=\"72008\" cy=\"45719\"/><a:chOff x=\"4139952\" y=\"2636912\"/><a:chExt cx=\"288032\" cy=\"301947\"/></a:xfrm></xdr:grpSpPr><xdr:sp macro=\"\" textlink=\"\"><xdr:nvSpPr><xdr:cNvPr id=\"{{ID_36}}\" name=\"{{NAME}}\"><a:extLst><a:ext uri=\"{FF2B5EF4-FFF2-40B4-BE49-F238E27FC236}\"><a16:creationId xmlns:a16=\"http://schemas.microsoft.com/office/drawing/2014/main\" id=\"{{ID_37}}\"/></a:ext></a:extLst></xdr:cNvPr><xdr:cNvSpPr/></xdr:nvSpPr><xdr:spPr><a:xfrm><a:off x=\"4139952\" y=\"2708920\"/><a:ext cx=\"288032\" cy=\"144016\"/></a:xfrm><a:prstGeom prst=\"ellipse\"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val=\"000000\"/></a:solidFill><a:ln w=\"25400\" cap=\"flat\" cmpd=\"sng\" algn=\"ctr\"><a:noFill/><a:prstDash val=\"solid\"/></a:ln><a:effectLst/></xdr:spPr><xdr:style><a:lnRef idx=\"2\"><a:schemeClr val=\"dk1\"><a:shade val=\"50000\"/></a:schemeClr></a:lnRef><a:fillRef idx=\"1\"><a:schemeClr val=\"dk1\"/></a:fillRef><a:effectRef idx=\"0\"><a:schemeClr val=\"dk1\"/></a:effectRef><a:fontRef idx=\"minor\"><a:schemeClr val=\"lt1\"/></a:fontRef></xdr:style><xdr:txBody><a:bodyPr wrap=\"square\" rtlCol=\"0\" anchor=\"ctr\"/><a:lstStyle><a:defPPr><a:defRPr lang=\"ja-JP\"/></a:defPPr><a:lvl1pPr algn=\"l\" rtl=\"0\" fontAlgn=\"base\"><a:spcBef><a:spcPct val=\"0\"/></a:spcBef><a:spcAft><a:spcPct val=\"0\"/></a:spcAft><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl1pPr><a:lvl2pPr marL=\"457200\" algn=\"l\" rtl=\"0\" fontAlgn=\"base\"><a:spcBef><a:spcPct val=\"0\"/></a:spcBef><a:spcAft><a:spcPct val=\"0\"/></a:spcAft><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl2pPr><a:lvl3pPr marL=\"914400\" algn=\"l\" rtl=\"0\" fontAlgn=\"base\"><a:spcBef><a:spcPct val=\"0\"/></a:spcBef><a:spcAft><a:spcPct val=\"0\"/></a:spcAft><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl3pPr><a:lvl4pPr marL=\"1371600\" algn=\"l\" rtl=\"0\" fontAlgn=\"base\"><a:spcBef><a:spcPct val=\"0\"/></a:spcBef><a:spcAft><a:spcPct val=\"0\"/></a:spcAft><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl4pPr><a:lvl5pPr marL=\"1828800\" algn=\"l\" rtl=\"0\" fontAlgn=\"base\"><a:spcBef><a:spcPct val=\"0\"/></a:spcBef><a:spcAft><a:spcPct val=\"0\"/></a:spcAft><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl5pPr><a:lvl6pPr marL=\"2286000\" algn=\"l\" defTabSz=\"914400\" rtl=\"0\" eaLnBrk=\"1\" latinLnBrk=\"0\" hangingPunct=\"1\"><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl6pPr><a:lvl7pPr marL=\"2743200\" algn=\"l\" defTabSz=\"914400\" rtl=\"0\" eaLnBrk=\"1\" latinLnBrk=\"0\" hangingPunct=\"1\"><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl7pPr><a:lvl8pPr marL=\"3200400\" algn=\"l\" defTabSz=\"914400\" rtl=\"0\" eaLnBrk=\"1\" latinLnBrk=\"0\" hangingPunct=\"1\"><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl8pPr><a:lvl9pPr marL=\"3657600\" algn=\"l\" defTabSz=\"914400\" rtl=\"0\" eaLnBrk=\"1\" latinLnBrk=\"0\" hangingPunct=\"1\"><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl9pPr></a:lstStyle><a:p><a:pPr algn=\"ctr\"/><a:endParaRPr kumimoji=\"1\" lang=\"ja-JP\" altLang=\"en-US\"/></a:p></xdr:txBody></xdr:sp><xdr:sp macro=\"\" textlink=\"\"><xdr:nvSpPr><xdr:cNvPr id=\"{{ID_38}}\" name=\"{{NAME}}\"><a:extLst><a:ext uri=\"{FF2B5EF4-FFF2-40B4-BE49-F238E27FC236}\"><a16:creationId xmlns:a16=\"http://schemas.microsoft.com/office/drawing/2014/main\" id=\"{{ID_39}}\"/></a:ext></a:extLst></xdr:cNvPr><xdr:cNvSpPr/></xdr:nvSpPr><xdr:spPr><a:xfrm><a:off x=\"4139952\" y=\"2794843\"/><a:ext cx=\"288032\" cy=\"144016\"/></a:xfrm><a:prstGeom prst=\"ellipse\"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val=\"000000\"/></a:solidFill><a:ln w=\"25400\" cap=\"flat\" cmpd=\"sng\" algn=\"ctr\"><a:noFill/><a:prstDash val=\"solid\"/></a:ln><a:effectLst/></xdr:spPr><xdr:style><a:lnRef idx=\"2\"><a:schemeClr val=\"dk1\"><a:shade val=\"50000\"/></a:schemeClr></a:lnRef><a:fillRef idx=\"1\"><a:schemeClr val=\"dk1\"/></a:fillRef><a:effectRef idx=\"0\"><a:schemeClr val=\"dk1\"/></a:effectRef><a:fontRef idx=\"minor\"><a:schemeClr val=\"lt1\"/></a:fontRef></xdr:style><xdr:txBody><a:bodyPr wrap=\"square\" rtlCol=\"0\" anchor=\"ctr\"/><a:lstStyle><a:defPPr><a:defRPr lang=\"ja-JP\"/></a:defPPr><a:lvl1pPr algn=\"l\" rtl=\"0\" fontAlgn=\"base\"><a:spcBef><a:spcPct val=\"0\"/></a:spcBef><a:spcAft><a:spcPct val=\"0\"/></a:spcAft><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl1pPr><a:lvl2pPr marL=\"457200\" algn=\"l\" rtl=\"0\" fontAlgn=\"base\"><a:spcBef><a:spcPct val=\"0\"/></a:spcBef><a:spcAft><a:spcPct val=\"0\"/></a:spcAft><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl2pPr><a:lvl3pPr marL=\"914400\" algn=\"l\" rtl=\"0\" fontAlgn=\"base\"><a:spcBef><a:spcPct val=\"0\"/></a:spcBef><a:spcAft><a:spcPct val=\"0\"/></a:spcAft><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl3pPr><a:lvl4pPr marL=\"1371600\" algn=\"l\" rtl=\"0\" fontAlgn=\"base\"><a:spcBef><a:spcPct val=\"0\"/></a:spcBef><a:spcAft><a:spcPct val=\"0\"/></a:spcAft><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl4pPr><a:lvl5pPr marL=\"1828800\" algn=\"l\" rtl=\"0\" fontAlgn=\"base\"><a:spcBef><a:spcPct val=\"0\"/></a:spcBef><a:spcAft><a:spcPct val=\"0\"/></a:spcAft><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl5pPr><a:lvl6pPr marL=\"2286000\" algn=\"l\" defTabSz=\"914400\" rtl=\"0\" eaLnBrk=\"1\" latinLnBrk=\"0\" hangingPunct=\"1\"><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl6pPr><a:lvl7pPr marL=\"2743200\" algn=\"l\" defTabSz=\"914400\" rtl=\"0\" eaLnBrk=\"1\" latinLnBrk=\"0\" hangingPunct=\"1\"><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl7pPr><a:lvl8pPr marL=\"3200400\" algn=\"l\" defTabSz=\"914400\" rtl=\"0\" eaLnBrk=\"1\" latinLnBrk=\"0\" hangingPunct=\"1\"><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl8pPr><a:lvl9pPr marL=\"3657600\" algn=\"l\" defTabSz=\"914400\" rtl=\"0\" eaLnBrk=\"1\" latinLnBrk=\"0\" hangingPunct=\"1\"><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl9pPr></a:lstStyle><a:p><a:pPr algn=\"ctr\"/><a:endParaRPr kumimoji=\"1\" lang=\"ja-JP\" altLang=\"en-US\"/></a:p></xdr:txBody></xdr:sp><xdr:sp macro=\"\" textlink=\"\"><xdr:nvSpPr><xdr:cNvPr id=\"{{ID_40}}\" name=\"{{NAME}}\"><a:extLst><a:ext uri=\"{FF2B5EF4-FFF2-40B4-BE49-F238E27FC236}\"><a16:creationId xmlns:a16=\"http://schemas.microsoft.com/office/drawing/2014/main\" id=\"{{ID_41}}\"/></a:ext></a:extLst></xdr:cNvPr><xdr:cNvSpPr/></xdr:nvSpPr><xdr:spPr><a:xfrm><a:off x=\"4139952\" y=\"2636912\"/><a:ext cx=\"288032\" cy=\"144016\"/></a:xfrm><a:prstGeom prst=\"ellipse\"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val=\"000000\"/></a:solidFill><a:ln w=\"25400\" cap=\"flat\" cmpd=\"sng\" algn=\"ctr\"><a:noFill/><a:prstDash val=\"solid\"/></a:ln><a:effectLst/></xdr:spPr><xdr:style><a:lnRef idx=\"2\"><a:schemeClr val=\"dk1\"><a:shade val=\"50000\"/></a:schemeClr></a:lnRef><a:fillRef idx=\"1\"><a:schemeClr val=\"dk1\"/></a:fillRef><a:effectRef idx=\"0\"><a:schemeClr val=\"dk1\"/></a:effectRef><a:fontRef idx=\"minor\"><a:schemeClr val=\"lt1\"/></a:fontRef></xdr:style><xdr:txBody><a:bodyPr wrap=\"square\" rtlCol=\"0\" anchor=\"ctr\"/><a:lstStyle><a:defPPr><a:defRPr lang=\"ja-JP\"/></a:defPPr><a:lvl1pPr algn=\"l\" rtl=\"0\" fontAlgn=\"base\"><a:spcBef><a:spcPct val=\"0\"/></a:spcBef><a:spcAft><a:spcPct val=\"0\"/></a:spcAft><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl1pPr><a:lvl2pPr marL=\"457200\" algn=\"l\" rtl=\"0\" fontAlgn=\"base\"><a:spcBef><a:spcPct val=\"0\"/></a:spcBef><a:spcAft><a:spcPct val=\"0\"/></a:spcAft><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl2pPr><a:lvl3pPr marL=\"914400\" algn=\"l\" rtl=\"0\" fontAlgn=\"base\"><a:spcBef><a:spcPct val=\"0\"/></a:spcBef><a:spcAft><a:spcPct val=\"0\"/></a:spcAft><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl3pPr><a:lvl4pPr marL=\"1371600\" algn=\"l\" rtl=\"0\" fontAlgn=\"base\"><a:spcBef><a:spcPct val=\"0\"/></a:spcBef><a:spcAft><a:spcPct val=\"0\"/></a:spcAft><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl4pPr><a:lvl5pPr marL=\"1828800\" algn=\"l\" rtl=\"0\" fontAlgn=\"base\"><a:spcBef><a:spcPct val=\"0\"/></a:spcBef><a:spcAft><a:spcPct val=\"0\"/></a:spcAft><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl5pPr><a:lvl6pPr marL=\"2286000\" algn=\"l\" defTabSz=\"914400\" rtl=\"0\" eaLnBrk=\"1\" latinLnBrk=\"0\" hangingPunct=\"1\"><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl6pPr><a:lvl7pPr marL=\"2743200\" algn=\"l\" defTabSz=\"914400\" rtl=\"0\" eaLnBrk=\"1\" latinLnBrk=\"0\" hangingPunct=\"1\"><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl7pPr><a:lvl8pPr marL=\"3200400\" algn=\"l\" defTabSz=\"914400\" rtl=\"0\" eaLnBrk=\"1\" latinLnBrk=\"0\" hangingPunct=\"1\"><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl8pPr><a:lvl9pPr marL=\"3657600\" algn=\"l\" defTabSz=\"914400\" rtl=\"0\" eaLnBrk=\"1\" latinLnBrk=\"0\" hangingPunct=\"1\"><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl9pPr></a:lstStyle><a:p><a:pPr algn=\"ctr\"/><a:endParaRPr kumimoji=\"1\" lang=\"ja-JP\" altLang=\"en-US\"/></a:p></xdr:txBody></xdr:sp></xdr:grpSp><xdr:sp macro=\"\" textlink=\"\"><xdr:nvSpPr><xdr:cNvPr id=\"{{ID_42}}\" name=\"{{NAME}}\"><a:extLst><a:ext uri=\"{FF2B5EF4-FFF2-40B4-BE49-F238E27FC236}\"><a16:creationId xmlns:a16=\"http://schemas.microsoft.com/office/drawing/2014/main\" id=\"{{ID_43}}\"/></a:ext></a:extLst></xdr:cNvPr><xdr:cNvSpPr/></xdr:nvSpPr><xdr:spPr><a:xfrm rot=\"10800000\"><a:off x=\"4211960\" y=\"2960948\"/><a:ext cx=\"72008\" cy=\"52578\"/></a:xfrm><a:prstGeom prst=\"trapezoid\"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val=\"000000\"/></a:solidFill><a:ln w=\"25400\" cap=\"flat\" cmpd=\"sng\" algn=\"ctr\"><a:noFill/><a:prstDash val=\"solid\"/></a:ln><a:effectLst/></xdr:spPr><xdr:style><a:lnRef idx=\"2\"><a:schemeClr val=\"dk1\"><a:shade val=\"50000\"/></a:schemeClr></a:lnRef><a:fillRef idx=\"1\"><a:schemeClr val=\"dk1\"/></a:fillRef><a:effectRef idx=\"0\"><a:schemeClr val=\"dk1\"/></a:effectRef><a:fontRef idx=\"minor\"><a:schemeClr val=\"lt1\"/></a:fontRef></xdr:style><xdr:txBody><a:bodyPr wrap=\"square\" rtlCol=\"0\" anchor=\"ctr\"/><a:lstStyle><a:defPPr><a:defRPr lang=\"ja-JP\"/></a:defPPr><a:lvl1pPr algn=\"l\" rtl=\"0\" fontAlgn=\"base\"><a:spcBef><a:spcPct val=\"0\"/></a:spcBef><a:spcAft><a:spcPct val=\"0\"/></a:spcAft><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl1pPr><a:lvl2pPr marL=\"457200\" algn=\"l\" rtl=\"0\" fontAlgn=\"base\"><a:spcBef><a:spcPct val=\"0\"/></a:spcBef><a:spcAft><a:spcPct val=\"0\"/></a:spcAft><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl2pPr><a:lvl3pPr marL=\"914400\" algn=\"l\" rtl=\"0\" fontAlgn=\"base\"><a:spcBef><a:spcPct val=\"0\"/></a:spcBef><a:spcAft><a:spcPct val=\"0\"/></a:spcAft><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl3pPr><a:lvl4pPr marL=\"1371600\" algn=\"l\" rtl=\"0\" fontAlgn=\"base\"><a:spcBef><a:spcPct val=\"0\"/></a:spcBef><a:spcAft><a:spcPct val=\"0\"/></a:spcAft><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl4pPr><a:lvl5pPr marL=\"1828800\" algn=\"l\" rtl=\"0\" fontAlgn=\"base\"><a:spcBef><a:spcPct val=\"0\"/></a:spcBef><a:spcAft><a:spcPct val=\"0\"/></a:spcAft><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl5pPr><a:lvl6pPr marL=\"2286000\" algn=\"l\" defTabSz=\"914400\" rtl=\"0\" eaLnBrk=\"1\" latinLnBrk=\"0\" hangingPunct=\"1\"><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl6pPr><a:lvl7pPr marL=\"2743200\" algn=\"l\" defTabSz=\"914400\" rtl=\"0\" eaLnBrk=\"1\" latinLnBrk=\"0\" hangingPunct=\"1\"><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl7pPr><a:lvl8pPr marL=\"3200400\" algn=\"l\" defTabSz=\"914400\" rtl=\"0\" eaLnBrk=\"1\" latinLnBrk=\"0\" hangingPunct=\"1\"><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl8pPr><a:lvl9pPr marL=\"3657600\" algn=\"l\" defTabSz=\"914400\" rtl=\"0\" eaLnBrk=\"1\" latinLnBrk=\"0\" hangingPunct=\"1\"><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl9pPr></a:lstStyle><a:p><a:pPr algn=\"ctr\"/><a:endParaRPr kumimoji=\"1\" lang=\"ja-JP\" altLang=\"en-US\"/></a:p></xdr:txBody></xdr:sp><xdr:sp macro=\"\" textlink=\"\"><xdr:nvSpPr><xdr:cNvPr id=\"{{ID_44}}\" name=\"{{NAME}}\"><a:extLst><a:ext uri=\"{FF2B5EF4-FFF2-40B4-BE49-F238E27FC236}\"><a16:creationId xmlns:a16=\"http://schemas.microsoft.com/office/drawing/2014/main\" id=\"{{ID_45}}\"/></a:ext></a:extLst></xdr:cNvPr><xdr:cNvSpPr/></xdr:nvSpPr><xdr:spPr><a:xfrm><a:off x=\"4211960\" y=\"2780928\"/><a:ext cx=\"72008\" cy=\"180020\"/></a:xfrm><a:prstGeom prst=\"trapezoid\"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val=\"000000\"/></a:solidFill><a:ln w=\"25400\" cap=\"flat\" cmpd=\"sng\" algn=\"ctr\"><a:noFill/><a:prstDash val=\"solid\"/></a:ln><a:effectLst/></xdr:spPr><xdr:style><a:lnRef idx=\"2\"><a:schemeClr val=\"dk1\"><a:shade val=\"50000\"/></a:schemeClr></a:lnRef><a:fillRef idx=\"1\"><a:schemeClr val=\"dk1\"/></a:fillRef><a:effectRef idx=\"0\"><a:schemeClr val=\"dk1\"/></a:effectRef><a:fontRef idx=\"minor\"><a:schemeClr val=\"lt1\"/></a:fontRef></xdr:style><xdr:txBody><a:bodyPr wrap=\"square\" rtlCol=\"0\" anchor=\"ctr\"/><a:lstStyle><a:defPPr><a:defRPr lang=\"ja-JP\"/></a:defPPr><a:lvl1pPr algn=\"l\" rtl=\"0\" fontAlgn=\"base\"><a:spcBef><a:spcPct val=\"0\"/></a:spcBef><a:spcAft><a:spcPct val=\"0\"/></a:spcAft><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl1pPr><a:lvl2pPr marL=\"457200\" algn=\"l\" rtl=\"0\" fontAlgn=\"base\"><a:spcBef><a:spcPct val=\"0\"/></a:spcBef><a:spcAft><a:spcPct val=\"0\"/></a:spcAft><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl2pPr><a:lvl3pPr marL=\"914400\" algn=\"l\" rtl=\"0\" fontAlgn=\"base\"><a:spcBef><a:spcPct val=\"0\"/></a:spcBef><a:spcAft><a:spcPct val=\"0\"/></a:spcAft><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl3pPr><a:lvl4pPr marL=\"1371600\" algn=\"l\" rtl=\"0\" fontAlgn=\"base\"><a:spcBef><a:spcPct val=\"0\"/></a:spcBef><a:spcAft><a:spcPct val=\"0\"/></a:spcAft><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl4pPr><a:lvl5pPr marL=\"1828800\" algn=\"l\" rtl=\"0\" fontAlgn=\"base\"><a:spcBef><a:spcPct val=\"0\"/></a:spcBef><a:spcAft><a:spcPct val=\"0\"/></a:spcAft><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl5pPr><a:lvl6pPr marL=\"2286000\" algn=\"l\" defTabSz=\"914400\" rtl=\"0\" eaLnBrk=\"1\" latinLnBrk=\"0\" hangingPunct=\"1\"><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl6pPr><a:lvl7pPr marL=\"2743200\" algn=\"l\" defTabSz=\"914400\" rtl=\"0\" eaLnBrk=\"1\" latinLnBrk=\"0\" hangingPunct=\"1\"><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl7pPr><a:lvl8pPr marL=\"3200400\" algn=\"l\" defTabSz=\"914400\" rtl=\"0\" eaLnBrk=\"1\" latinLnBrk=\"0\" hangingPunct=\"1\"><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl8pPr><a:lvl9pPr marL=\"3657600\" algn=\"l\" defTabSz=\"914400\" rtl=\"0\" eaLnBrk=\"1\" latinLnBrk=\"0\" hangingPunct=\"1\"><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl9pPr></a:lstStyle><a:p><a:pPr algn=\"ctr\"/><a:endParaRPr kumimoji=\"1\" lang=\"ja-JP\" altLang=\"en-US\"/></a:p></xdr:txBody></xdr:sp></xdr:grpSp><xdr:sp macro=\"\" textlink=\"\"><xdr:nvSpPr><xdr:cNvPr id=\"{{ID_46}}\" name=\"{{NAME}}\"><a:extLst><a:ext uri=\"{FF2B5EF4-FFF2-40B4-BE49-F238E27FC236}\"><a16:creationId xmlns:a16=\"http://schemas.microsoft.com/office/drawing/2014/main\" id=\"{{ID_47}}\"/></a:ext></a:extLst></xdr:cNvPr><xdr:cNvSpPr/></xdr:nvSpPr><xdr:spPr><a:xfrm><a:off x=\"4211960\" y=\"3104964\"/><a:ext cx=\"72008\" cy=\"108012\"/></a:xfrm><a:prstGeom prst=\"rect\"><a:avLst/></a:prstGeom><a:gradFill rotWithShape=\"1\"><a:gsLst><a:gs pos=\"0\"><a:srgbClr val=\"FFD200\"><a:tint val=\"50000\"/><a:satMod val=\"300000\"/></a:srgbClr></a:gs><a:gs pos=\"35000\"><a:srgbClr val=\"FFD200\"><a:tint val=\"37000\"/><a:satMod val=\"300000\"/></a:srgbClr></a:gs><a:gs pos=\"100000\"><a:srgbClr val=\"FFD200\"><a:tint val=\"15000\"/><a:satMod val=\"350000\"/></a:srgbClr></a:gs></a:gsLst><a:lin ang=\"16200000\" scaled=\"1\"/></a:gradFill><a:ln w=\"9525\" cap=\"flat\" cmpd=\"sng\" algn=\"ctr\"><a:solidFill><a:srgbClr val=\"FFD200\"><a:shade val=\"95000\"/><a:satMod val=\"105000\"/></a:srgbClr></a:solidFill><a:prstDash val=\"solid\"/></a:ln><a:effectLst><a:outerShdw blurRad=\"40000\" dist=\"20000\" dir=\"5400000\" rotWithShape=\"0\"><a:srgbClr val=\"000000\"><a:alpha val=\"38000\"/></a:srgbClr></a:outerShdw></a:effectLst></xdr:spPr><xdr:style><a:lnRef idx=\"1\"><a:schemeClr val=\"accent1\"/></a:lnRef><a:fillRef idx=\"2\"><a:schemeClr val=\"accent1\"/></a:fillRef><a:effectRef idx=\"1\"><a:schemeClr val=\"accent1\"/></a:effectRef><a:fontRef idx=\"minor\"><a:schemeClr val=\"dk1\"/></a:fontRef></xdr:style><xdr:txBody><a:bodyPr wrap=\"square\" rtlCol=\"0\" anchor=\"ctr\"/><a:lstStyle><a:defPPr><a:defRPr lang=\"ja-JP\"/></a:defPPr><a:lvl1pPr algn=\"l\" rtl=\"0\" fontAlgn=\"base\"><a:spcBef><a:spcPct val=\"0\"/></a:spcBef><a:spcAft><a:spcPct val=\"0\"/></a:spcAft><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"000000\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl1pPr><a:lvl2pPr marL=\"457200\" algn=\"l\" rtl=\"0\" fontAlgn=\"base\"><a:spcBef><a:spcPct val=\"0\"/></a:spcBef><a:spcAft><a:spcPct val=\"0\"/></a:spcAft><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"000000\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl2pPr><a:lvl3pPr marL=\"914400\" algn=\"l\" rtl=\"0\" fontAlgn=\"base\"><a:spcBef><a:spcPct val=\"0\"/></a:spcBef><a:spcAft><a:spcPct val=\"0\"/></a:spcAft><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"000000\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl3pPr><a:lvl4pPr marL=\"1371600\" algn=\"l\" rtl=\"0\" fontAlgn=\"base\"><a:spcBef><a:spcPct val=\"0\"/></a:spcBef><a:spcAft><a:spcPct val=\"0\"/></a:spcAft><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"000000\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl4pPr><a:lvl5pPr marL=\"1828800\" algn=\"l\" rtl=\"0\" fontAlgn=\"base\"><a:spcBef><a:spcPct val=\"0\"/></a:spcBef><a:spcAft><a:spcPct val=\"0\"/></a:spcAft><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"000000\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl5pPr><a:lvl6pPr marL=\"2286000\" algn=\"l\" defTabSz=\"914400\" rtl=\"0\" eaLnBrk=\"1\" latinLnBrk=\"0\" hangingPunct=\"1\"><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"000000\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl6pPr><a:lvl7pPr marL=\"2743200\" algn=\"l\" defTabSz=\"914400\" rtl=\"0\" eaLnBrk=\"1\" latinLnBrk=\"0\" hangingPunct=\"1\"><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"000000\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl7pPr><a:lvl8pPr marL=\"3200400\" algn=\"l\" defTabSz=\"914400\" rtl=\"0\" eaLnBrk=\"1\" latinLnBrk=\"0\" hangingPunct=\"1\"><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"000000\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl8pPr><a:lvl9pPr marL=\"3657600\" algn=\"l\" defTabSz=\"914400\" rtl=\"0\" eaLnBrk=\"1\" latinLnBrk=\"0\" hangingPunct=\"1\"><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"000000\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl9pPr></a:lstStyle><a:p><a:pPr algn=\"ctr\"/><a:endParaRPr kumimoji=\"1\" lang=\"ja-JP\" altLang=\"en-US\"/></a:p></xdr:txBody></xdr:sp><xdr:sp macro=\"\" textlink=\"\"><xdr:nvSpPr><xdr:cNvPr id=\"{{ID_48}}\" name=\"{{NAME}}\"><a:extLst><a:ext uri=\"{FF2B5EF4-FFF2-40B4-BE49-F238E27FC236}\"><a16:creationId xmlns:a16=\"http://schemas.microsoft.com/office/drawing/2014/main\" id=\"{{ID_49}}\"/></a:ext></a:extLst></xdr:cNvPr><xdr:cNvSpPr/></xdr:nvSpPr><xdr:spPr><a:xfrm rot=\"10800000\"><a:off x=\"4211960\" y=\"3212976\"/><a:ext cx=\"72008\" cy=\"45719\"/></a:xfrm><a:prstGeom prst=\"snip2SameRect\"><a:avLst><a:gd name=\"{{NAME}}\" fmla=\"val 19974\"/><a:gd name=\"{{NAME}}\" fmla=\"val 0\"/></a:avLst></a:prstGeom><a:gradFill rotWithShape=\"1\"><a:gsLst><a:gs pos=\"0\"><a:srgbClr val=\"FFD200\"><a:tint val=\"50000\"/><a:satMod val=\"300000\"/></a:srgbClr></a:gs><a:gs pos=\"35000\"><a:srgbClr val=\"FFD200\"><a:tint val=\"37000\"/><a:satMod val=\"300000\"/></a:srgbClr></a:gs><a:gs pos=\"100000\"><a:srgbClr val=\"FFD200\"><a:tint val=\"15000\"/><a:satMod val=\"350000\"/></a:srgbClr></a:gs></a:gsLst><a:lin ang=\"16200000\" scaled=\"1\"/></a:gradFill><a:ln w=\"9525\" cap=\"flat\" cmpd=\"sng\" algn=\"ctr\"><a:solidFill><a:srgbClr val=\"FFD200\"><a:shade val=\"95000\"/><a:satMod val=\"105000\"/></a:srgbClr></a:solidFill><a:prstDash val=\"solid\"/></a:ln><a:effectLst><a:outerShdw blurRad=\"40000\" dist=\"20000\" dir=\"5400000\" rotWithShape=\"0\"><a:srgbClr val=\"000000\"><a:alpha val=\"38000\"/></a:srgbClr></a:outerShdw></a:effectLst></xdr:spPr><xdr:style><a:lnRef idx=\"1\"><a:schemeClr val=\"accent1\"/></a:lnRef><a:fillRef idx=\"2\"><a:schemeClr val=\"accent1\"/></a:fillRef><a:effectRef idx=\"1\"><a:schemeClr val=\"accent1\"/></a:effectRef><a:fontRef idx=\"minor\"><a:schemeClr val=\"dk1\"/></a:fontRef></xdr:style><xdr:txBody><a:bodyPr wrap=\"square\" rtlCol=\"0\" anchor=\"ctr\"/><a:lstStyle><a:defPPr><a:defRPr lang=\"ja-JP\"/></a:defPPr><a:lvl1pPr algn=\"l\" rtl=\"0\" fontAlgn=\"base\"><a:spcBef><a:spcPct val=\"0\"/></a:spcBef><a:spcAft><a:spcPct val=\"0\"/></a:spcAft><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"000000\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl1pPr><a:lvl2pPr marL=\"457200\" algn=\"l\" rtl=\"0\" fontAlgn=\"base\"><a:spcBef><a:spcPct val=\"0\"/></a:spcBef><a:spcAft><a:spcPct val=\"0\"/></a:spcAft><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"000000\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl2pPr><a:lvl3pPr marL=\"914400\" algn=\"l\" rtl=\"0\" fontAlgn=\"base\"><a:spcBef><a:spcPct val=\"0\"/></a:spcBef><a:spcAft><a:spcPct val=\"0\"/></a:spcAft><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"000000\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl3pPr><a:lvl4pPr marL=\"1371600\" algn=\"l\" rtl=\"0\" fontAlgn=\"base\"><a:spcBef><a:spcPct val=\"0\"/></a:spcBef><a:spcAft><a:spcPct val=\"0\"/></a:spcAft><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"000000\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl4pPr><a:lvl5pPr marL=\"1828800\" algn=\"l\" rtl=\"0\" fontAlgn=\"base\"><a:spcBef><a:spcPct val=\"0\"/></a:spcBef><a:spcAft><a:spcPct val=\"0\"/></a:spcAft><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"000000\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl5pPr><a:lvl6pPr marL=\"2286000\" algn=\"l\" defTabSz=\"914400\" rtl=\"0\" eaLnBrk=\"1\" latinLnBrk=\"0\" hangingPunct=\"1\"><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"000000\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl6pPr><a:lvl7pPr marL=\"2743200\" algn=\"l\" defTabSz=\"914400\" rtl=\"0\" eaLnBrk=\"1\" latinLnBrk=\"0\" hangingPunct=\"1\"><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"000000\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl7pPr><a:lvl8pPr marL=\"3200400\" algn=\"l\" defTabSz=\"914400\" rtl=\"0\" eaLnBrk=\"1\" latinLnBrk=\"0\" hangingPunct=\"1\"><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"000000\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl8pPr><a:lvl9pPr marL=\"3657600\" algn=\"l\" defTabSz=\"914400\" rtl=\"0\" eaLnBrk=\"1\" latinLnBrk=\"0\" hangingPunct=\"1\"><a:defRPr kumimoji=\"1\" kern=\"1200\"><a:solidFill><a:srgbClr val=\"000000\"/></a:solidFill><a:latin typeface=\"Arial\"/><a:ea typeface=\"HGP創英角ｺﾞｼｯｸUB\"/></a:defRPr></a:lvl9pPr></a:lstStyle><a:p><a:pPr algn=\"ctr\"/><a:endParaRPr kumimoji=\"1\" lang=\"ja-JP\" altLang=\"en-US\"/></a:p></xdr:txBody></xdr:sp></xdr:grpSp><xdr:clientData/></xdr:twoCellAnchor>"

// ═══════════════════════════════════════════════════
// 布局类型
// ═══════════════════════════════════════════════════

type ColKind =
  | 'term' | 'approach' | 'bjb'
  | 'first-span' | 'span' | 'equip' | 'bu'

interface ColDef {
  kind:       ColKind
  col:        number            // 1-based Excel 列号
  equipment?: SLDEquipment
  segment?:   SLDFiberSegment
  letter?:    string
  polarity?:  '+' | '-'
  mergeNext?: boolean
}

// ═══════════════════════════════════════════════════
// 列布局构建
// ═══════════════════════════════════════════════════

function buildLayout(table: SLDTable): ColDef[] {
  const equips = [...table.equipments].sort((a, b) => a.sequence - b.sequence)
  const segs   = [...table.fiberSegments].sort((a, b) => a.sequence - b.sequence)

  const segTo = (eq: SLDEquipment) =>
    segs.find(s => s.toEquipmentId === eq.id || s.toName === eq.name)
  const segBetween = (from: SLDEquipment, to: SLDEquipment) =>
    segs.find(s =>
      (s.fromEquipmentId === from.id || s.fromName === from.name) &&
      (s.toEquipmentId   === to.id   || s.toName   === to.name)
    )

  const cols: ColDef[] = []
  let ci = 1
  const push = (d: Omit<ColDef, 'col'>) => cols.push({ ...d, col: ++ci })
  const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  let termCount = 0
  let firstDeepSpanDone = false

  for (let i = 0; i < equips.length; i++) {
    const eq   = equips[i]
    const prev = equips[i - 1]

    if (i === 0 && eq.type === 'TE') {
      push({ kind: 'term', equipment: eq, letter: LETTERS[termCount++], polarity: '+' })
      if (equips[i + 1]?.type === 'PFE') {
        const pfe = equips[i + 1]
        const s   = segBetween(eq, pfe)
        if (s) push({ kind: 'approach', segment: s })
        push({ kind: 'bjb', equipment: pfe })
        i++; firstDeepSpanDone = false
      }
      continue
    }
    if (eq.type === 'TE' && i === equips.length - 1) {
      const s = segTo(eq)
      if (s) push({ kind: 'approach', segment: s })
      push({ kind: 'term', equipment: eq, letter: LETTERS[termCount++], polarity: '-' })
      continue
    }
    if (eq.type === 'PFE' && i === equips.length - 2) {
      const inSeg = segTo(eq)
      if (inSeg) { push({ kind: 'span', segment: inSeg, mergeNext: false }); push({ kind: 'equip', equipment: eq }) }
      else push({ kind: 'bjb', equipment: eq })
      continue
    }
    if (eq.type === 'BU') {
      const s = segTo(eq)
      if (s) push({ kind: 'span', segment: s, mergeNext: false })
      push({ kind: 'bu', equipment: eq })
      firstDeepSpanDone = true
      continue
    }
    const s = segTo(eq)
    if (s) {
      if (!firstDeepSpanDone && prev && (prev.type === 'TE' || prev.type === 'PFE')) {
        push({ kind: 'first-span', segment: s }); firstDeepSpanDone = true
      } else {
        push({ kind: 'span', segment: s, mergeNext: false })
      }
    }
    push({ kind: 'equip', equipment: eq })
  }
  return cols
}

// ═══════════════════════════════════════════════════
// 单元格写入
// ═══════════════════════════════════════════════════

const THIN   = { style: 'thin'   as const }
const MEDIUM = { style: 'medium' as const }
const DOUBLE = { style: 'double' as const }

function getBorder(bdr?: string) {
  if (!bdr) return undefined
  switch (bdr) {
    case 'thin':     return { top: THIN, bottom: THIN, left: THIN, right: THIN }
    case 'thinDL':   return { top: THIN, bottom: THIN, left: DOUBLE, right: THIN }
    case 'mLR':      return { left: MEDIUM, right: MEDIUM }
    case 'mTLR':     return { top: MEDIUM, left: MEDIUM, right: MEDIUM }
    case 'mBLR':     return { bottom: MEDIUM, left: MEDIUM, right: MEDIUM }
    default: return undefined
  }
}

function setCell(
  ws: ExcelJS.Worksheet, row: number, col: number, value: ExcelJS.CellValue,
  opts: { font?: Partial<ExcelJS.Font>; border?: Partial<ExcelJS.Borders> } = {}
) {
  const cell = ws.getCell(row, col)
  cell.value = value
  cell.font  = { name: 'Calibri', size: 9, ...opts.font }
  cell.alignment = { horizontal: 'center', vertical: 'middle' }
  if (opts.border) cell.border = opts.border
}

function writeSheet(ws: ExcelJS.Worksheet, cols: ColDef[], table: SLDTable, startRow = 1) {
  const totalCols = cols.length > 0 ? Math.max(...cols.map(c => c.col)) + 2 : 20
  for (let c = 1; c <= totalCols; c++) ws.getColumn(c).width = COL_WIDTH
  for (let r = startRow; r <= startRow + SECTION_ROWS - 1; r++) ws.getRow(r).height = ROW_HEIGHT

  const F_BOLD = { bold: true }
  const F_FP   = { size: 11 }

  // 预填默认字体
  for (let rOff = 0; rOff <= 6; rOff++) {
    const rn = startRow + rOff
    const sz = (rOff === R_FP || rOff === R_SEC) ? 11 : 9
    for (let c = 2; c <= totalCols; c++) {
      const cell = ws.getCell(rn, c)
      if (!cell.value) { cell.font = { name: 'Calibri', size: sz }; cell.alignment = { horizontal: 'center', vertical: 'middle' } }
    }
  }

  const fpLabel = (seg?: SLDFiberSegment) => seg?.fiberPairs ? `${seg.fiberPairs}FP` : ''
  const cableType = (seg?: SLDFiberSegment) => (seg?.cableType || '').toUpperCase() || 'SA'

  const slaveMap = new Map<string, ColDef>()
  cols.forEach(c => { /* for future use */ })

  for (const c of cols) {
    const r   = (off: number) => startRow + off
    const col = c.col
    switch (c.kind) {
      case 'term': {
        setCell(ws, r(R_FP),   col, null, { font: F_FP })
        setCell(ws, r(R_LAND), col, 'LAND', { font: { name: 'Calibri', size: 9 }, border: getBorder('mTLR') })
        setCell(ws, r(R_TYPE), col, c.letter ?? '', { border: getBorder('mLR') })
        setCell(ws, r(R_DIST), col, null, { border: getBorder('mLR') })
        setCell(ws, r(R_ID),   col, c.polarity ? `(${c.polarity})` : '', { border: getBorder('mLR') })
        setCell(ws, r(R_EQUIP),col, c.equipment?.name ?? '', { font: F_BOLD, border: getBorder('mBLR') })
        setCell(ws, r(R_SEC),  col, null, { font: F_FP })
        break
      }
      case 'approach': {
        const seg = c.segment!
        setCell(ws, r(R_LAND), col, 'LAND')
        setCell(ws, r(R_TYPE), col, null)
        setCell(ws, r(R_DIST), col, seg.length, { font: F_BOLD, border: getBorder('thin') })
        setCell(ws, r(R_ID),   col, null)
        break
      }
      case 'bjb':
        setCell(ws, r(R_EQUIP), col, sldResolveSldDisplayName(c.equipment), { font: F_BOLD })
        break
      case 'first-span': {
        const seg = c.segment!
        const cableId1 = seg.remarks || `C${String(seg.sequence).padStart(2, '0')}`
        setCell(ws, r(R_FP),   col, fpLabel(seg), { font: F_FP })
        setCell(ws, r(R_TYPE), col, `${cableType(seg)}(S/E)`, { font: F_BOLD })
        setCell(ws, r(R_DIST), col, seg.length, { font: F_BOLD, border: getBorder('thin') })
        setCell(ws, r(R_ID),   col, cableId1, { font: F_BOLD })
        break
      }
      case 'span': {
        const seg = c.segment!
        const cableId2 = seg.remarks || `C${String(seg.sequence).padStart(2, '0')}`
        setCell(ws, r(R_FP),   col, fpLabel(seg), { font: F_FP })
        setCell(ws, r(R_TYPE), col, cableType(seg), { font: F_BOLD })
        setCell(ws, r(R_DIST), col, seg.length, { font: F_BOLD, border: getBorder('thin') })
        setCell(ws, r(R_ID),   col, cableId2, { font: F_BOLD })
        break
      }
      case 'equip': {
        const isEq = c.equipment?.type === 'EQ'
        setCell(ws, r(R_TYPE), col, isEq ? sldResolveEqualizerRole(c.equipment) : null, { border: { left: DOUBLE, right: THIN } })
        setCell(ws, r(R_DIST), col, null, { border: { left: DOUBLE, right: THIN } })
        setCell(ws, r(R_ID),   col, null, { border: { left: DOUBLE, right: THIN } })
        setCell(ws, r(R_EQUIP),col, sldResolveSldDisplayName(c.equipment), { font: F_BOLD })
        if (isEq && sldIsFixedEqualizer(c.equipment)) {
          setCell(ws, r(R_SEC), col, 'F-ATT', { font: F_FP })
        }
        break
      }
      case 'bu': {
        const buName = sldResolveSldDisplayName(c.equipment) || c.equipment?.name || 'BU'
        setCell(ws, r(R_DIST), col, buName, { font: F_BOLD, border: getBorder('mLR') })
        setCell(ws, r(R_EQUIP),col, buName, { font: F_BOLD })
        break
      }
    }
  }
}

// ═══════════════════════════════════════════════════
// 动态 Drawing XML 生成
// ═══════════════════════════════════════════════════

/**
 * 用模板 + 新位置生成一个 twoCellAnchor XML 块
 * excelCol: 1-indexed Excel 列
 * sectionStartRow: 0-indexed 行偏移（section 起始行）
 * idBase: 形状 ID 起始值（每个 anchor 独立递增）
 */
function fillTemplate(
  tmpl: string,
  fromCol0: number, fromRow0: number,
  toCol0:   number, toRow0:   number,
  idBase:   number,
  name:     string,
): string {
  let result = tmpl.replace(/\\+"/g, '"')
  result = result.replace(/\{\{FROM_COL\}\}/g, String(fromCol0))
  result = result.replace(/\{\{FROM_ROW\}\}/g, String(fromRow0))
  result = result.replace(/\{\{TO_COL\}\}/g,   String(toCol0))
  result = result.replace(/\{\{TO_ROW\}\}/g,   String(toRow0))

  // 仅替换图形描述节点名称，避免把几何变量名误替换成设备名导致图形畸形
  const safeName = name
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')

  // 1) 先恢复 a:gd 变量名
  if (result.includes('prst="snip2SameRect"')) {
    // BU 图标模板中的预设变量名
    let adjIndex = 0
    result = result.replace(/<a:gd name="\{\{NAME\}\}"/g, () => {
      const varName = adjIndex === 0 ? 'adj1' : 'adj2'
      adjIndex += 1
      return `<a:gd name="${varName}"`
    })
  } else {
    // 六边形等模板中的 T0..Tn 变量名
    let gdIndex = 0
    result = result.replace(/<a:gd name="\{\{NAME\}\}"/g, () => {
      const varName = `T${gdIndex}`
      gdIndex += 1
      return `<a:gd name="${varName}"`
    })
  }

  // 2) 再替换 cNvPr 的 name 占位符
  result = result.replace(
    /(<xdr:cNvPr[^>]*\bname=")\{\{NAME\}\}("[^>]*>)/g,
    `$1${safeName}$2`,
  )
  let idCtr = idBase
  result = result.replace(/\{\{ID_\d+\}\}/g, () => String(idCtr++))
  return result
}

function fillSingleColumnTemplate(
  tmpl: string,
  col0: number,
  fromRow0: number,
  toRow0: number,
  idBase: number,
  name: string,
  fromColOff = 1,
  toColOff = 716017,
  fromRowOff = 0,
  toRowOff = 0,
): string {
  let result = fillTemplate(tmpl, col0, fromRow0, col0, toRow0, idBase, name)
  result = result.replace(
    /(<xdr:from><xdr:col>\d+<\/xdr:col><xdr:colOff>)0(<\/xdr:colOff>)/,
    `$1${fromColOff}$2`,
  )
  result = result.replace(
    /(<xdr:from><xdr:col>\d+<\/xdr:col><xdr:colOff>\d+<\/xdr:colOff><xdr:row>\d+<\/xdr:row><xdr:rowOff>)0(<\/xdr:rowOff>)/,
    `$1${fromRowOff}$2`,
  )
  result = result.replace(
    /(<xdr:to><xdr:col>\d+<\/xdr:col><xdr:colOff>)0(<\/xdr:colOff>)/,
    `$1${toColOff}$2`,
  )
  result = result.replace(
    /(<xdr:to><xdr:col>\d+<\/xdr:col><xdr:colOff>\d+<\/xdr:colOff><xdr:row>\d+<\/xdr:row><xdr:rowOff>)0(<\/xdr:rowOff>)/,
    `$1${toRowOff}$2`,
  )
  return result
}

/**
 * 将完整 layout 按 MAX_SECTION_COLS 分段，各段 col 值重映射为从 2 开始
 */
function splitIntoSections(layout: ColDef[]): ColDef[][] {
  if (layout.length === 0) return []
  const sections: ColDef[][] = []
  let i = 0
  while (i < layout.length) {
    const chunk = layout.slice(i, i + MAX_SECTION_COLS)
    const colOffset = chunk[0].col - 2  // 让每段从 col=2 开始
    const remapped = chunk.map(c => ({ ...c, col: c.col - colOffset }))
    sections.push(remapped)
    i += MAX_SECTION_COLS
  }
  return sections
}

/**
 * 为单个 section 生成图形 XML 片段（不含外层 wsDr 标签）
 */
function generateSectionShapes(
  layout: ColDef[],
  sectionStartRow: number,
  idBaseStart: number
): { xml: string; nextIdBase: number } {
  const shapes: string[] = []
  let idBase = idBaseStart
  for (const c of layout) {
    const excelCol = c.col
    const col0     = excelCol - 1
    const shapeFromCol = col0 - 1
    const shapeTo      = col0
    const singleCol    = col0
    const shapeFromRow = sectionStartRow + R_TYPE
    const shapeToRow   = sectionStartRow + R_EQUIP

    switch (c.kind) {
      case 'bjb': {
        shapes.push(fillSingleColumnTemplate(TPL_TERM_HEX, singleCol, shapeFromRow, shapeToRow, idBase, c.equipment?.name ?? 'bjb'))
        idBase += 10
        break
      }
      case 'equip': {
        const eq = c.equipment
        if (!eq) break

        if (sldResolveSldSymbolCode(eq) === 'LAND') {
          shapes.push(fillSingleColumnTemplate(TPL_TERM_HEX, singleCol, shapeFromRow, shapeToRow, idBase, eq.name))
          idBase += 10
          break
        }

        if (eq.type === 'JOINT') {
          const jst = sldResolveJointSubType(eq)
          if (jst === 'SEJB' || jst === 'BUJB') {
            // 可扩展/分支单元接头盒：实心黑六边形
            shapes.push(fillSingleColumnTemplate(TPL_JB_SOLID_HEX, singleCol, shapeFromRow, shapeToRow, idBase, eq.name))
            idBase += 5
          } else if (jst === 'SJB' || jst === 'FJB' || jst === 'LIJB') {
            // 海底/光纤/线路接入接头盒：空心六边形 + 中线
            shapes.push(fillSingleColumnTemplate(TPL_JB_OUTLINE_HEX, singleCol, shapeFromRow, shapeToRow, idBase, eq.name))
            idBase += 5
            shapes.push(fillSingleColumnTemplate(TPL_JB_CENTER_LINE, singleCol, shapeFromRow, shapeToRow, idBase, `${eq.name}_line`))
            idBase += 5
          } else {
            // BJB 或未设置
            shapes.push(fillSingleColumnTemplate(TPL_TERM_HEX, singleCol, shapeFromRow, shapeToRow, idBase, eq.name))
            idBase += 10
          }
          break
        }

        if (eq.type === 'OADM') {
          const buSubType = sldResolveSldSymbolCode(eq) === 'ROADM' ? 'ROADM' : 'OADM'
          if (buSubType === 'ROADM') {
            // ROADM 走分支器风格（标记栏 + 船形图标）
            const markerFromRow = sectionStartRow + R_LAND
            const markerToRow   = sectionStartRow + R_EQUIP
            shapes.push(fillSingleColumnTemplate(TPL_BU_MARKER, singleCol, markerFromRow, markerToRow, idBase, `${eq.name}_MARKER`))
            idBase += 5
            const iconFromRow = sectionStartRow + R_FP
            const iconToRow   = sectionStartRow + R_TYPE
            shapes.push(fillSingleColumnTemplate(TPL_BU_ICON, singleCol, iconFromRow, iconToRow + 1, idBase, `${eq.name}_ICON`))
            idBase += 50
          } else {
            // OADM：蝴蝶结 + 红色竖条
            shapes.push(fillSingleColumnTemplate(TPL_BOWTIE_LEFT, singleCol, shapeFromRow, shapeToRow, idBase, `${eq.name}_L`))
            idBase += 5
            shapes.push(fillSingleColumnTemplate(TPL_BOWTIE_RIGHT, singleCol, shapeFromRow, shapeToRow, idBase, `${eq.name}_R`))
            idBase += 5
            shapes.push(fillSingleColumnTemplate(TPL_OADM_BAR, singleCol, shapeFromRow, shapeToRow, idBase, `${eq.name}_BAR`))
            idBase += 5
          }
          break
        }

        if (eq.type === 'EQ') {
          const tpl = sldResolveEqualizerRole(eq) === 'S' ? TPL_EQ_RED : TPL_EQ_BLUE
          shapes.push(fillSingleColumnTemplate(tpl, singleCol, shapeFromRow, shapeToRow, idBase, eq.name))
          idBase += 5
          break
        }

        if (eq.type === 'REP') {
          shapes.push(fillSingleColumnTemplate(TPL_REPEATER_R, singleCol, shapeFromRow, shapeToRow, idBase, eq.name))
          idBase += 5
          break
        }

        // 默认其他深海设备
        shapes.push(fillTemplate(TPL_REP_HEX, shapeFromCol, shapeFromRow, shapeTo, shapeToRow, idBase, eq.name))
        idBase += 10
        break
      }
      case 'bu': {
        const markerFromRow = sectionStartRow + R_LAND
        const markerToRow   = sectionStartRow + R_EQUIP
        shapes.push(fillTemplate(TPL_BU_MARKER, shapeFromCol, markerFromRow, shapeTo, markerToRow, idBase, c.equipment?.name ?? 'BU_MARKER'))
        idBase += 5
        const iconFromRow = sectionStartRow + R_FP
        const iconToRow   = sectionStartRow + R_TYPE
        shapes.push(fillTemplate(TPL_BU_ICON, shapeFromCol, iconFromRow, shapeTo + 1, iconToRow + 1, idBase, c.equipment?.name ?? 'BU_ICON'))
        idBase += 50
        break
      }
      default:
        break
    }
  }

  return { xml: shapes.join('\n'), nextIdBase: idBase }
}

/**
 * 根据 layout 生成 drawing1.xml (Trunk sheet) 内容（单段，向后兼容）
 */
function generateDrawingXml(layout: ColDef[], sectionStartRow = 0): string {
  const { xml: shapes } = generateSectionShapes(layout, sectionStartRow, 100)
  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">',
    shapes,
    '</xdr:wsDr>',
  ].join('\n')
}

// ═══════════════════════════════════════════════════
// jszip 合并：把 ExcelJS xlsx + drawing XML 合成输出
// ═══════════════════════════════════════════════════

/**
 * 向 ExcelJS 生成的 xlsx 注入 drawing XML
 * 需要：
 *  1. 在 xl/drawings/ 目录放入 drawing1.xml
 *  2. 在 xl/drawings/_rels/ 放入 drawing1.xml.rels（空关系）
 *  3. 在 xl/worksheets/_rels/sheet1.xml.rels 添加 drawing 关系
 *  4. 更新 [Content_Types].xml 加入 drawing 类型
 */
async function injectDrawing(xlsxBuf: ArrayBuffer, drawingXml: string): Promise<ArrayBuffer> {
  const zip = await JSZip.loadAsync(xlsxBuf)

  // 1. 写入 drawing1.xml
  zip.file('xl/drawings/drawing1.xml', drawingXml)

  // 2. 写入 drawing1.xml.rels（无子关系）
  zip.file('xl/drawings/_rels/drawing1.xml.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>'
  )

  // 3. 修改 sheet1.xml.rels，加入 drawing 关系
  const relsPath = 'xl/worksheets/_rels/sheet1.xml.rels'
  let relsXml = ''
  try { relsXml = await zip.file(relsPath)!.async('string') } catch { /* new file */ }
  if (!relsXml || relsXml.trim() === '') {
    relsXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>'
  }
  const drawingRelId = 'rId_drawing1'
  if (!relsXml.includes(drawingRelId)) {
    relsXml = relsXml.replace(
      '</Relationships>',
      `<Relationship Id="${drawingRelId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>`
    )
    zip.file(relsPath, relsXml)
  }

  // 4. 在 sheet1.xml 中添加 <drawing r:id="..."/> 引用（如尚未存在）
  const sheetPath = 'xl/worksheets/sheet1.xml'
  let sheetXml = await zip.file(sheetPath)!.async('string')
  if (!sheetXml.includes('<drawing')) {
    sheetXml = sheetXml.replace(
      '</worksheet>',
      `<drawing r:id="${drawingRelId}"/></worksheet>`
    )
    zip.file(sheetPath, sheetXml)
  }

  // 5. 更新 [Content_Types].xml
  const ctPath = '[Content_Types].xml'
  let ctXml = await zip.file(ctPath)!.async('string')
  const drawingContentType = 'application/vnd.openxmlformats-officedocument.drawing+xml'
  if (!ctXml.includes(drawingContentType)) {
    ctXml = ctXml.replace(
      '</Types>',
      `<Override PartName="/xl/drawings/drawing1.xml" ContentType="${drawingContentType}"/></Types>`
    )
    zip.file(ctPath, ctXml)
  }

  const buf = await zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' })
  return buf
}

// ═══════════════════════════════════════════════════
// 主导出函数
// ═══════════════════════════════════════════════════

export function buildSLDExcelDrawingXml(table: SLDTable): string {
  // 构建完整列布局，然后分段（每段 MAX_SECTION_COLS 个元素）
  const layout   = buildLayout(table)
  const sections = splitIntoSections(layout)
  const sectionSpacing = SECTION_ROWS + SECTION_GAP
  const allShapeXml: string[] = []
  let idBase = 100

  sections.forEach((sectionCols, idx) => {
    const row0Offset  = idx * sectionSpacing
    const result = generateSectionShapes(sectionCols, row0Offset, idBase)
    if (result.xml) allShapeXml.push(result.xml)
    idBase = result.nextIdBase
  })

  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">',
    ...allShapeXml,
    '</xdr:wsDr>',
  ].join('\n')
}

export async function exportSLDToExcel(table: SLDTable): Promise<void> {
  // 1. 构建完整列布局，然后分段（每段 MAX_SECTION_COLS 个元素）
  const layout   = buildLayout(table)
  const sections = splitIntoSections(layout)
  const sectionSpacing = SECTION_ROWS + SECTION_GAP  // 16 行/段（与示例一致）

  // 2. ExcelJS 初始化工作簿
  const wb = new ExcelJS.Workbook()
  wb.creator = 'SLD Export'
  wb.created = new Date()
  const ws = wb.addWorksheet('Trunk', { pageSetup: { orientation: 'landscape' } })

  // 固定列宽（所有段共享同一列范围）
  const totalCols = MAX_SECTION_COLS + 4
  for (let c = 1; c <= totalCols; c++) ws.getColumn(c).width = COL_WIDTH

  // 3. 按段写入单元格数据
  sections.forEach((sectionCols, idx) => {
    const startRow = 1 + idx * sectionSpacing
    writeSheet(ws, sectionCols, table, startRow)
  })

  // 4. 合并所有段的图形 XML
  const drawingXml = buildSLDExcelDrawingXml(table)

  // 5. ExcelJS → ArrayBuffer
  const xlsxBuf = await wb.xlsx.writeBuffer() as ArrayBuffer

  // 6. jszip 注入 drawing XML
  const finalBuf = await injectDrawing(xlsxBuf, drawingXml)

  // 7. 下载
  const blob = new Blob([finalBuf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url  = URL.createObjectURL(blob)
  const link = document.createElement('a')
  const ts   = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const version = (table.metadata.exportTemplateVersion || DEFAULT_SLD_EXPORT_TEMPLATE_VERSION)
    .replace(/[^a-zA-Z0-9._-]/g, '_')
  link.href     = url
  link.download = `SLD_${table.name.replace(/[^\w\u4e00-\u9fa5]/g, '_')}_${version}_${ts}.xlsx`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
