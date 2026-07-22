/**
 * USE 文件格式类型定义
 * 完全符合 use文件架构.md 文档规范
 * 
 * USE 文件底层为 ZIP 格式，包含：
 * - project_data.json: 核心逻辑数据（六大模块）
 * - cache/: 缓存目录（可选，存放风险成本热力图、仿真图表数据等）
 */

import type { PlanConfigSnapshot, PlatformPlanningResults } from '@/services/platform/types'

// ==================== 1. 元数据模块 (metadata) ====================

/** 显示设置 */
export interface DisplaySettings {
  crs: string                    // 坐标参考系统，如 "EPSG:4326"
  units: {
    length: string               // 长度单位，如 "km"
    depth: string                // 深度单位，如 "m"
  }
}

/** 元数据模块 */
export interface USEMetadata {
  file_format_version: string    // 文件协议版本，如 "2.0"
  project_uuid: string           // 项目唯一标识符
  project_name: string           // 项目名称
  creator_user_id: string        // 创建用户ID
  resource_root_dir: string      // 本地资源根目录
  allow_other_users: boolean     // 是否允许其他用户打开
  created_at: string             // 创建时间 (ISO 8601)
  updated_at: string             // 更新时间 (ISO 8601)
  display_settings: DisplaySettings
}

// ==================== 1.5 工程设置模块 (project_settings) ====================

/** 规划模式 */
export type PlanningMode = 'point-to-point' | 'multi-point'

/** 坐标点 */
export interface CoordPoint {
  lon: number                    // 经度
  lat: number                    // 纬度
}

/** 规划范围 */
export interface PlanningRange {
  northwest: CoordPoint          // 西北角坐标
  southeast: CoordPoint          // 东南角坐标
}

/** 路径规划配置 */
export interface RoutePlanningSettings {
  mode: PlanningMode             // 规划模式
  start_point: CoordPoint        // 起点坐标
  end_point: CoordPoint          // 终点坐标
  planning_range: PlanningRange  // 规划范围
}

/** 成本参数 */
export interface CostSettings {
  // 系统规划成本参数
  cable_cost_per_km: number      // 电缆每公里成本
  installation_cost_per_km: number  // 安装每公里成本
  repeater_cost: number          // 放大器单价
  branching_unit_cost: number    // 分支器单价
  equalizer_cost?: number        // 均衡器单价
  landing_station_cost: number   // 登陆站成本
  currency: string               // 货币类型
  // 路径规划成本参数
  light_cable_cost?: number      // 轻型海缆单价 (千元/公里)
  heavy_cable_cost?: number      // 重型海缆单价 (千元/公里)
  max_construction_cost?: number // 施工成本极大值 (千元/公里)
  depth_threshold?: number       // 深浅分界值 (米)
}

/** 仿真模型配置 */
export interface SimulationSettings {
  fiber_model: 'GN' | 'EGN'      // 光纤仿真模型
  edfa_model: string             // EDFA 模型
  calculation_models: string[]   // 启用的计算模型
}

/** 工程设置模块 */
export interface USEProjectSettings {
  route_planning: RoutePlanningSettings
  cost_settings: CostSettings
  simulation_settings: SimulationSettings
}

// ==================== 2. 环境上下文模块 (environment_context) ====================

/** 数据完整性校验 */
export interface LayerIntegrity {
  checksum: string               // SHA256 哈希值，格式 "sha256:xxx"
  size_bytes: number             // 文件字节大小
}

/** 图层内容类型 */
export type LayerContentType = 
  | 'BATHYMETRY'    // 高程/水深图
  | 'FISHING'       // 渔区
  | 'SHIPPING'      // 航道
  | 'VOLCANO'       // 火山
  | 'EARTHQUAKE'    // 地震
  | 'RESTRICTED'    // 禁区（不可通行，如军事禁区）

/** 图层注册项 */
export interface LayerRegistryItem {
  layer_id: string               // 图层唯一标识符
  name: string                   // 图层显示名称
  file_format: string            // 物理文件格式，如 "GeoTIFF", "Shapefile", "GeoJSON"
  relative_path: string          // 资源相对路径
  content_type: LayerContentType // 图层内容类型
  integrity: LayerIntegrity      // 数据完整性校验
}

/** 登陆站点属性 */
export interface LandingPointProperties {
  country?: string               // 国家代码
  owner?: string                 // 所有者
  [key: string]: unknown          // 扩展属性
}

/** 导入的登陆站点 */
export interface ImportedLandingPoint {
  id: string                     // 站点唯一ID
  name: string                   // 站点显示名称
  coords: [number, number]       // 经纬度坐标 [Lon, Lat]
  properties: LandingPointProperties
}

/** 导入的 BU 节点 (仅多点网络模式) */
export interface ImportedBUNode {
  id: string                     // BU 唯一标识符
  name: string                   // BU 节点显示名称
  coords: [number, number]       // 经纬度坐标 [Lon, Lat]
  max_ports: number              // 该 BU 节点最大允许的端口数上限
}

/** 规划模式 - USE规范 */
export type USEPlanningMode = 'POINT_TO_POINT' | 'MULTI_NODE_NETWORK'

/** 成本约束方式 */
export type CostConstraintMode = 'ABSOLUTE' | 'PREMIUM_RATIO'

/** 绝对成本上限 */
export interface AbsoluteCostLimit {
  value: number                  // 成本上限值
  unit: string                   // 成本单位，如 "万元"
}

/** 溢价比例配置 */
export interface PremiumRatioConfig {
  ratio: number                  // 溢价比例，如 0.25 表示 25%
}

/** 冗余策略配置 (仅多点网络模式) */
export interface RedundancyConfig {
  enabled: boolean               // 是否启用冗余
  cost_constraint_mode?: CostConstraintMode  // 成本约束方式
  absolute_cost_limit?: AbsoluteCostLimit    // 绝对成本上限
  premium_ratio?: PremiumRatioConfig         // 溢价比例配置
}

/** 风险等级铠装映射项 */
export interface RiskArmorMappingItem {
  threshold: number              // 风险值下限阈值
  cable_type_ref: string         // 引用 libraries.cable_types 中的缆型 ID
}

/** 海缆铠装映射规则 */
export interface CableArmorMapping {
  high_risk: RiskArmorMappingItem    // 高风险映射配置
  medium_risk: RiskArmorMappingItem  // 中风险映射配置
  low_risk: RiskArmorMappingItem     // 低风险映射配置
}

/** 规划范围配置 */
export interface PlanningBoundsConfig {
  mode: 'AUTO' | 'MANUAL'        // 范围设置方式
  manual_bounds?: {              // 手动框选时的边界坐标
    northwest: [number, number]  // 西北角坐标 [经度, 纬度]
    southeast: [number, number]  // 东南角坐标 [经度, 纬度]
  }
}

/** 算法配置 */
export interface AlgorithmConfig {
  planning_bounds: PlanningBoundsConfig  // 规划范围配置
  grid_resolution_m: number              // 栅格分辨率，单位米
}

/** 路由规划参数设置 - 甲方规范 */
export interface USERoutePlanningSettings {
  cable_armor_mapping: CableArmorMapping  // 风险等级与缆型的映射规则
  algorithm_config: AlgorithmConfig       // 路由算法配置参数
}

/** 环境上下文模块 - 甲方规范完整版 */
export interface USEEnvironmentContext {
  layer_registry: LayerRegistryItem[]
  planning_mode: USEPlanningMode           // 网络规划模式
  redundancy_config?: RedundancyConfig     // 冗余策略配置 (多点模式)
  imported_landing_points: ImportedLandingPoint[]
  imported_bu_nodes: ImportedBUNode[]      // BU 节点列表 (多点模式)
  route_planning_settings: USERoutePlanningSettings  // 路由规划参数设置
}

// ==================== 3. 静态资源库模块 (libraries) ====================

// ---------- 3.1 计算模型库 (libraries.models) ----------

/** 模型输入参数定义 */
export interface ModelInput {
  param_id: string               // 参数唯一 ID，作为算法接口的参数名
  label: string                  // 前端显示标签
  unit: string                   // 参数单位（如 "dB/km", "W"）
  type: 'float' | 'int' | 'string' | 'array'  // 数据类型
  required: boolean              // 是否必填
  default?: number | string | unknown[]  // 默认值（当 required=false 时生效）
  source_hint?: string           // 系统自动取值路径提示（如 "fiber.attributes.attenuation"）
}

/** 模型输出参数定义 */
export interface ModelOutput {
  param_id: string               // 输出参数 ID
  label: string                  // 前端显示标签
  unit: string                   // 参数单位
  type: 'float' | 'int' | 'string' | 'array'  // 数据类型
}

/** 参数约束条件 */
export interface ModelConstraint {
  param_id: string               // 约束的参数 ID
  min?: number                   // 最小值
  max?: number                   // 最大值
}

/** 模型适用领域 */
export type ModelDomain = 'FIBER' | 'EDFA' | 'BU' | 'SYSTEM'

/** 模型角色 */
export type ModelRole = 'propagation' | 'auxiliary'

/** 模型状态量定义（接口契约中的输入/输出状态） */
export interface ModelStateIO {
  param_id: string               // 状态量 ID
  data_type: 'float' | 'int' | 'string' | 'array' | 'matrix'  // 数据类型
  description: string            // 状态量描述
}

/** 模型接口契约 */
export interface ModelInterfaceContract {
  state_inputs: ModelStateIO[]   // 模型所需的状态输入
  state_outputs: ModelStateIO[]  // 模型产生的状态输出
}

/** 模型兼容性声明 */
export interface ModelCompatibility {
  requires: string[]             // 依赖的其他模型 ID
  provides: string[]             // 本模型提供的能力标识
  incompatible_with: string[]    // 与本模型互斥的模型 ID
}

/** 计算模型完整定义 */
export interface ModelDefinition {
  model_id: string               // 模型唯一标识符，系统稳定 ID
  version: string                // 模型版本号
  domain: ModelDomain            // 模型适用领域
  role: ModelRole                // 模型角色（传播计算/辅助工具）
  display_name: string           // 前端显示名称
  description: string            // 模型功能描述
  entry_point: string            // 代码入口，格式为 "文件名:函数名"
  language: string               // 实现语言（如 "python", "cpp"）
  inputs: ModelInput[]           // 输入参数定义
  outputs: ModelOutput[]         // 输出参数定义
  constraints?: ModelConstraint[] // 参数约束条件（可选）
  interface_contract: ModelInterfaceContract  // 接口契约
  compatibility: ModelCompatibility           // 兼容性声明
}

// ---------- 3.2 光纤参数库 (libraries.fibers) ----------

/** 光纤物理参数 */
export interface FiberAttributes {
  attenuation: number            // 衰减系数 dB/km
  A_eff: number                  // 有效面积 μm²
  dispersion: number             // 色散系数 s/m²
  dispersion_slope: number       // 色散斜率 s/m³
  n2: number                     // 非线性折射率系数 1e-20 m²/W
}

/** 光纤模型参数配置 */
export interface FiberModelParamsConfig {
  is_configured: boolean         // 该模型的参数是否已完整配置
  params: Record<string, unknown>    // 具体参数键值对，与 models[].inputs 的 param_id 对应
}

/** 光纤规格 */
export interface FiberSpec {
  id: string                     // 数据库内部唯一标识符
  fiber_type_id: string          // 标准光纤类型名称，如 "G.654.E"
  attributes: FiberAttributes    // 物理仿真核心参数
  supported_models: string[]     // 支持的计算模型 ID 列表
  model_params: Record<string, FiberModelParamsConfig>  // 以模型 ID 为 key 的参数配置
}

// ---------- 3.3 海缆铠装类型库 (libraries.cable_types) ----------

/** 海缆成本参数 */
export interface CableCommercialParams {
  price_per_km: number           // 每公里单价
  currency: string               // 货币类型，如 "USD"
}

/** 海缆铠装类型 */
export interface CableTypeSpec {
  id: string                     // 唯一索引
  name: string                   // 海缆名称
  type: string                   // 海缆类型，如 "SA", "LW", "DA"
  commercial_params: CableCommercialParams
}

// ---------- 3.4 器件规格库 (libraries.components) ----------

/** 器件类型 */
export type ComponentType = 'EDFA' | 'BU'

/** EDFA 光放大器规格 */
export interface EDFASpecs {
  gain_db: number                // 额定小信号增益
  bandwidth_nm: number           // 工作带宽
  noise_figure_db: number        // 噪声系数 (NF)
  max_output_power_dbm: number   // 饱和输出功率
  gain_flatness_db: number       // 增益平坦度
}

/** BU 分支器规格 */
export interface BUSpecs {
  port_count: number             // 端口数量 (3 或 4)
  matrix: number[][]             // N×N 连通矩阵，1代表连通，0代表不通
  thru_pair: [number, number]    // 主干直通路径端口对
  loss_vals: {
    thru: number                 // 直通路径插损 (典型值 0.8dB)
    branch: number               // 分支路径插损 (典型值 3.5dB)
  }
}

/** 器件模型参数配置 */
export interface ComponentModelParamsConfig {
  is_configured: boolean         // 该模型的参数是否已完整配置
  params: Record<string, unknown>    // 具体参数键值对
}

/** 器件规格（通用） */
export interface ComponentSpec {
  id: string                     // 器件规格唯一索引
  name: string                   // 器件显示名称
  type: ComponentType            // 器件类型
  specs: EDFASpecs | BUSpecs     // 具体规格参数
  supported_models: string[]     // 支持的计算模型 ID 列表
  model_params: Record<string, ComponentModelParamsConfig>  // 以模型 ID 为 key 的参数配置
  commercial_params: {
    unit_price: number           // 单价
    currency: string             // 货币种类
  }
}

/** 静态资源库模块 */
export interface USELibraries {
  fibers: FiberSpec[]
  cable_types: CableTypeSpec[]
  components: ComponentSpec[]
  models: ModelDefinition[]      // 计算模型库
}

// ==================== 4. 路由工程模块 (route_engineering) ====================

/** 几何点 [经度, 纬度, 水深(m), 累计表面距离(km)] */
export type GeometryPoint = [number, number, number, number]

/** 事件点类型 */
export type KeyEventType = 'LandStation' | 'EDFA' | 'BU'

/** 关键事件点 */
export interface KeyEvent {
  event_id: string               // 事件点唯一标识
  type: KeyEventType             // 点位类型
  geo_index: number              // 在 geometry_pool 中的索引（物理锚点）
  component_ref_id?: string      // 引用 libraries.components 中的器件规格 ID
  name?: string                  // 站点名称（用于 LandStation）
}

/** 路由状态信息 - 甲方规范 */
export interface RouteStatus {
  is_segmented: boolean          // 是否已完成海缆段划分
  is_adjusted: boolean           // 是否经过人工调整
  last_modified: string          // 最后修改时间 (ISO 8601)
}

/** 分段方式 */
export type SegmentationMethod = 'FIXED_LENGTH' | 'RISK_BASED'

/** 风险等级分段参数 */
export interface RiskBasedSegmentConfig {
  min_length_km: number          // 最小段长约束 (km)
  max_length_km: number          // 最大段长约束 (km)
}

/** 分段配置 - 甲方规范 */
export interface SegmentationConfig {
  method: SegmentationMethod     // 分段方式
  fixed_length_km?: number       // 固定长度分段时的目标段长 (km)
  risk_based?: RiskBasedSegmentConfig  // 风险等级分段参数
}

/** 几何范围信息 - 甲方规范对象格式 */
export interface SegmentGeometryRange {
  start_index: number            // 起点在 geometry_pool 中的索引
  end_index: number              // 终点在 geometry_pool 中的索引
  start_km: number               // 起点里程 (km)
  end_km: number                 // 终点里程 (km)
  length_km: number              // 该段几何长度 (km)
}

/** 风险等级 */
export type RiskLevel = 'HIGH' | 'MEDIUM' | 'LOW'

/** 风险信息 - 甲方规范 */
export interface SegmentRiskInfo {
  risk_level: RiskLevel          // 风险等级
  average_risk_value: number     // 该段平均风险值
}

/** 海缆分段（工程级设计对象）- 甲方规范完整版 */
export interface RouteSegment {
  segment_id: string             // 分段唯一标识
  geometry_range: SegmentGeometryRange  // 几何范围信息 (对象格式)
  risk_info: SegmentRiskInfo     // 风险信息
  cable_type_ref: string         // 引用 libraries.cable_types 中的 ID
  slack_percent: number          // 敷设余量百分比（如 2.5 代表增加 2.5%）
  burial_depth_m: number         // 设计埋深（米）
  is_locked: boolean             // 锁定标记，若为 true 自动规划算法不可覆盖
}

/** 海缆分段 - 兼容旧格式 (数组形式的 geometry_range) */
export interface RouteSegmentLegacy {
  segment_id: string
  geometry_range: [number, number]  // 旧格式: [start_index, end_index]
  cable_struct_ref: string       // 旧字段名
  slack_percent: number
  burial_depth_m: number
  is_locked: boolean
}

/** Span 光学性能指标 */
export interface SpanOpticalMetrics {
  span_length_km: number         // span 光学长度（含 slack 后）
  total_loss_db: number          // span 总损耗
  osnr_db: number                // 光信噪比
  q_factor: number               // Q 因子
}

/** 系统光学传输跨段 (Span) */
export interface Span {
  span_id: string                // span 唯一标识
  from_event_id: string          // span 起点设备的 Event ID
  from_port_index: number        // 起点设备的端口号
  to_event_id: string            // span 终点设备的 Event ID
  to_port_index: number          // 终点设备的端口号
  geometry_range: [number, number]  // 指向 geometry_pool 的索引区间
  fiber_spec_ref: string         // 引用 libraries.fibers 中的光纤型号 ID
  optical_metrics: SpanOpticalMetrics | null  // 系统评估计算结果（可缓存）
  is_locked: boolean             // 系统设计冻结标记
}

/** 路由工程模块 - 甲方规范完整版 */
export interface USERouteEngineering {
  route_status: RouteStatus      // 路由状态信息
  segmentation_config: SegmentationConfig  // 分段配置
  geometry_pool: GeometryPoint[] // 采样点的扁平数组
  key_events: KeyEvent[]         // 关键事件点列表
  segments: RouteSegment[]       // 海缆分段列表（工程对象）
  spans: Span[]                  // 光学传输跨段列表（系统对象）
}

// ==================== 5. 系统工程模块 (system_engineering) ====================

/** 星座图统计矩 */
export interface ShapingMoments {
  moment4: number                // 四阶矩
  moment6: number                // 六阶矩
}

/** WDM 配置 */
export interface WDMConfig {
  channel_count: number          // 传输总波道数量（如 64, 96）
  center_freq_thz: number        // 系统中心频率 THz（如 193.1）
  channel_spacing_ghz: number    // 通道间隔 GHz（如 50.0 或 100.0）
  baud_rate_gbaud: number        // 信号波特率 Gbaud（如 64.0）
  launch_power_vector: number[]  // 单波入纤功率数组 dBm，长度等于 channel_count
  initial_ase_vector: number[]   // 各信道初始 ASE 噪声数组 dBm
  initial_nli_vector: number[]   // 各信道初始非线性噪声数组 dBm
  modulation: string             // 调制格式名称，如 "16QAM"
  shaping_moments: ShapingMoments
}

// ---------- 5.1 链路仿真缓存 (simulation_cache) ----------

/** 链路标识 */
export interface RouteRef {
  from_station: string           // 起点站 event_id
  to_station: string             // 终点站 event_id
  route_hash: string             // 链路拓扑的哈希值
}

/** 模型选择 */
export interface ModelSelection {
  fiber_model_id: string         // 光纤传输计算模型 ID
  edfa_model_id: string          // EDFA 计算模型 ID
  bu_model_id: string | null     // BU 计算模型 ID，无 BU 时为 null
}

/** 仿真结果指标集合（矩阵式） */
export interface SimulationMetricsMatrix {
  gsnr_matrix_db: number[][]     // 广义信噪比矩阵 [span_count × channel_count]
  osnr_matrix_db: number[][]     // 光信噪比矩阵
  snr_ase_matrix_db: number[][]  // 线性信噪比矩阵
  snr_nli_matrix_db: number[][]  // 非线性信噪比矩阵
  signal_power_matrix_dbm?: number[][]  // 可选：信号功率矩阵
  ase_noise_power_matrix_dbm?: number[][]  // 可选：ASE 噪声功率矩阵
  nli_noise_power_matrix_dbm?: number[][]  // 可选：NLI 噪声功率矩阵
}

/** 终端 GSNR 统计 */
export interface FinalGsnrStats {
  avg_db: number                 // 平均 GSNR (dB)
  min_db: number                 // 最差 GSNR (dB)
  max_db: number                 // 最佳 GSNR (dB)
  worst_channel: string          // 最差信道编号
  best_channel: string           // 最佳信道编号
}

/** 终端 OSNR 统计 */
export interface FinalOsnrStats {
  avg_db: number                 // 平均 OSNR (dB)
  min_db: number                 // 最差 OSNR (dB)
}

/** 链路性能汇总 */
export interface SimulationSummary {
  total_length_km: number        // 链路总长度 (km)
  total_span_count: number       // Span 总数
  final_gsnr: FinalGsnrStats     // 终端 GSNR 统计
  final_osnr: FinalOsnrStats     // 终端 OSNR 统计
  system_capacity_tbps: number   // 系统总容量 (Tbps)
  // 兼容旧字段
  final_gsnr_avg_db: number
  final_gsnr_min_db: number
  final_osnr_avg_db: number
}

/** 仿真位置维度 */
export interface SimulationPositions {
  count: number                  // 测量位置点数量
  names: string[]                // 位置名称 ["Tx", "AMP-1", ...]
  distances_km: number[]         // 各位置距离 (km)
  span_ids: string[]             // Span ID 序列
}

/** 仿真信道维度 */
export interface SimulationChannels {
  count: number                  // 信道数量
  ids: string[]                  // 信道编号 ["Ch1", "Ch2", ...]
  frequencies_thz: number[]      // 各信道中心频率 (THz)
}

/** 仿真结果缓存 */
export interface SimulationCache {
  is_valid: boolean              // 缓存有效性标识
  timestamp: string              // 仿真完成的时间戳 (ISO 8601)
  route_ref: RouteRef            // 本次仿真对应的链路标识
  model_selection: ModelSelection  // 本次仿真使用的计算模型
  positions: SimulationPositions  // 位置维度信息
  channels: SimulationChannels   // 信道维度信息
  metrics: SimulationMetricsMatrix  // 仿真结果指标集合（矩阵）
  summary: SimulationSummary     // 链路性能汇总
  // 兼容旧字段
  span_sequence?: string[]
  channel_count?: number
}

// ---------- 5.2 系统规划缓存 (system_planning_cache) ----------

/** 器件选择 */
export interface DeviceSelection {
  fiber_spec_id: string          // 选用的光纤规格 ID
  edfa_spec_id: string           // 选用的 EDFA 规格 ID
  bu_spec_id: string | null      // 选用的 BU 规格 ID，无 BU 时为 null
}

/** Span 扫描配置 */
export interface SweepConfig {
  span_length_min_km: number     // Span 扫描范围下限 (km)
  span_length_max_km: number     // Span 扫描范围上限 (km)
  span_step_km: number           // Span 扫描步长 (km)
  target_gsnr_db: number         // 目标 GSNR 性能门限 (dB)
}

/** Span 扫描结果 */
export interface SweepResults {
  span_lengths_km: number[]      // Span 长度序列 (km)
  gsnr_per_span_db: number[][]   // 各 Span 配置下的 GSNR 值（按信道）
  osnr_per_span_db: number[][]   // 各 Span 配置下的 OSNR 值（按信道）
  feasible_range_km: [number, number]  // 满足目标 GSNR 的可行 Span 区间
  recommended_span_km: number    // 系统推荐的最优 Span 长度 (km)
}

/** 用户决策记录 */
export interface UserDecision {
  selected_span_km: number       // 用户选定的 Span 长度 (km)
  edfa_count: number             // 对应的 EDFA 数量
  decision_time: string          // 用户确认时间戳 (ISO 8601)
}

// ---------- 5.3 最终规划缓存 (final_plan_cache) ----------

/** 节点元数据 */
export interface NodeMetadataItem {
  event_id: string               // 对应 key_events 中的事件 ID
  type: KeyEventType             // 节点类型
  geo_index: number              // geometry_pool 索引
  component_ref_id: string       // 引用的器件规格 ID
  kp_km: number                  // 里程 (km)
  name: string                   // 节点名称
}

/** Span 性能指标行 */
export interface SpanPerformanceRow {
  span_id: string                // Span ID
  length_km: number              // Span 长度 (km)
  loss_db: number                // 总损耗 (dB)
  gsnr_db: number                // GSNR (dB)
  osnr_db: number                // OSNR (dB)
}

/** Span 布放详情 */
export interface SpanPlacementDetail {
  span_id: string                // Span ID
  from_event_id: string          // 起点设备 Event ID
  to_event_id: string            // 终点设备 Event ID
  length_km: number              // Span 长度 (km)
  fiber_ref: string              // 光纤规格引用 ID
}

/** 放大器布放算法结果 */
export interface AmplifierPlacementResult {
  strategy: string               // 布放策略（如 'equal_spacing', 'optimized'）
  total_edfa_count: number       // EDFA 总数
  total_bu_count: number         // BU 总数
  span_details: SpanPlacementDetail[]  // 每段布放详情
}

/** 最终规划缓存 */
export interface FinalPlanCache {
  is_valid: boolean              // 缓存有效性标识
  timestamp: string              // 规划完成时间戳 (ISO 8601)
  node_metadata: NodeMetadataItem[]        // 各节点元数据
  performance_matrices: SpanPerformanceRow[]  // 各 Span 性能矩阵
  amplifier_placement: AmplifierPlacementResult  // 放大器布放结果
}

/** 系统规划缓存 */
export interface SystemPlanningCache {
  is_valid: boolean              // 缓存有效性标识
  timestamp: string              // 规划完成的时间戳 (ISO 8601)
  route_ref: RouteRef            // 本次规划对应的链路标识
  config_hash: string            // wdm_config + device_selection + model_selection 的组合哈希值
  device_selection: DeviceSelection  // 本次规划选择的器件
  model_selection: ModelSelection    // 本次规划使用的计算模型
  sweep_config: SweepConfig      // Span 扫描配置参数
  sweep_results: SweepResults    // Span 扫描计算结果
  user_decision: UserDecision | null  // 用户最终决策记录
  final_plan_cache: FinalPlanCache | null  // 最终规划缓存
}

/** 系统工程模块 */
export interface USESystemEngineering {
  wdm_config: WDMConfig
  simulation_cache: SimulationCache | null
  system_planning_cache: SystemPlanningCache | null
}

// ==================== 6. 健康度监控模块 (health_monitoring) ====================

/** 采集器连接参数 */
export interface CollectorConnectionParams {
  base_url: string               // API 基础 URL
  method: string                 // HTTP 方法
  response_format: string        // 响应格式
  ssl_verify: string             // SSL 验证
  [key: string]: string | undefined // 扩展参数
}

/** 采集器配置 */
export interface CollectorConfig {
  gateway_name: string           // 网关/网管显示名称
  driver_id: string              // 采集驱动标识
  polling_interval: number       // 自动轮询周期（秒）
  connection_params: CollectorConnectionParams
}

/** 设备映射项 */
export interface DeviceMapping {
  event_id: string               // 对应 key_events 中的事件 ID
  external_index: string         // 外部索引键
}

/** 告警过滤级别 */
export type AlarmSeverity = 'ALL' | 'WARNING' | 'ERROR'

/** 视图过滤器设置 */
export interface ViewFilters {
  visible_types: string[]        // 可见设备类型
  min_alarm_severity: AlarmSeverity
}

/** 视图设置 */
export interface ViewSettings {
  node_positions: Record<string, [number, number]>  // 节点坐标
  filters: ViewFilters
}

/** 健康度监控模块 */
export interface USEHealthMonitoring {
  collector_config: CollectorConfig | null
  device_mapping: DeviceMapping[]
  view_settings: ViewSettings
}

// ==================== 应用扩展数据结构 ====================

/** 路由规划扩展数据 (保存原始 RPL 表格) */
export interface RouteplanningExtension {
  rplTables: Record<string, unknown>[]  // 原始 RPL 表格数据
  routes?: Record<string, unknown>[]    // 路由数据
  planningConfig?: Record<string, unknown>
  cableTypeDatabase?: Record<string, unknown>[]  // 缆型数据库（包含用户新建的缆型）
}

/** 传输规划扩展数据 (保存原始 SLD 表格) */
export interface TransmissionPlanningExtension {
  sldTables: Record<string, unknown>[]  // 原始 SLD 表格数据
  transmissionConfig?: Record<string, unknown>
  repeaterConfigs?: Record<string, unknown>[]
}

/** 监控扩展数据 */
export interface MonitorExtension {
  devices: Record<string, unknown>[]         // 监控设备数据
  alarmHistory?: Record<string, unknown>[]   // 告警历史
}

/** 图层设置扩展数据 */
export interface LayerSettingsExtension {
  oceanElevation?: boolean
  volcanoDistribution?: boolean
  fishingAreaDistribution?: boolean
  slopeMap?: boolean
  earthquakeDistribution?: boolean
  shippingLanes?: boolean
}

/** 设计视图缓存（链路成本 + 性能指标） */
export interface DesignCacheExtension {
  linkCalcSummary?: {
    linkName: string
    metrics: {
      osnr: { min: number; max: number; avg: number }
      gsnr: { min: number; max: number; avg: number }
      power: { min: number; max: number; avg: number }
      nli: { min: number; max: number; avg: number }
      qFactor: { min: number; max: number; avg: number }
    }
    systemConfig: {
      amplifierCount: number
      avgSpanLength: number
      buCount: number
      totalBuLoss: number
      equalizerCount: number
      totalEqualizerLoss: number
      channelCount: number
      modulation: string
    }
    margin: {
      targetOsnr: number
      worstMargin: number
      avgMargin: number
      meetsRequirement: boolean
    }
    costData: {
      cableCost: number
      amplifierCost: number
      buCost: number
      totalCost: number
      costItems: Array<{ category: string; model: string; quantity: number | string; unit: string; unitPrice: number; subtotal: number }>
    }
  } | null
  platformPlanningResults?: PlatformPlanningResults | null
  platformPlanConfigSnapshot?: PlanConfigSnapshot | null
}

/** 应用扩展数据包 (非规范模块，统一归集) */
export interface USEAppExtensions {
  project_settings?: USEProjectSettings          // 工程设置
  routePlanning?: RouteplanningExtension         // RPL 原始数据
  transmissionPlanning?: TransmissionPlanningExtension  // SLD 原始数据
  connectorTables?: Record<string, unknown>[]    // 接线元表格数据
  monitorData?: MonitorExtension                 // 监控数据
  cableSegments?: Record<string, unknown>        // 海缆段数据
  layerSettings?: LayerSettingsExtension         // 图层设置
  designCache?: DesignCacheExtension             // 设计视图缓存
  equalizerTypes?: Record<string, unknown>[]     // 均衡器型号库
  jointBoxTypes?: Record<string, unknown>[]      // 接头盒型号库
}

/** USE 项目数据 (project_data.json 内容) */
export interface USEProjectData {
  // ===== 规范六大模块 =====
  metadata: USEMetadata
  environment_context: USEEnvironmentContext
  libraries: USELibraries
  route_engineering: USERouteEngineering
  system_engineering: USESystemEngineering
  health_monitoring: USEHealthMonitoring
  // ===== 应用扩展 =====
  _app_extensions?: USEAppExtensions
}

// ==================== 链路器件参数获取流程 ====================

/** 链路元素类型 */
export type LinkElementType = 'SPAN' | 'EDFA' | 'BU'

/** 链路元素参数 */
export interface LinkElementParams {
  index: number                  // 元素在链路中的序号
  element_type: LinkElementType  // 元素类型
  model_id: string               // 使用的计算模型 ID
  params: Record<string, unknown>    // 参数键值对
}

/** 链路参数组装结果 */
export interface LinkParamsResult {
  model_selection: {
    SPAN: string                 // Span 使用的模型 ID
    EDFA: string                 // EDFA 使用的模型 ID
    BU: string | null            // BU 使用的模型 ID
  }
  link_params: LinkElementParams[]  // 有序的链路参数列表
}

// ==================== 工具函数 ====================

/** 生成 UUID */
export function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}

/** 生成哈希值 */
export function generateHash(data: string): string {
  let hash = 0
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return Math.abs(hash).toString(16).padStart(8, '0')
}

/** 创建默认的 WDM 配置 */
export function createDefaultWDMConfig(channelCount: number = 96): WDMConfig {
  return {
    channel_count: channelCount,
    center_freq_thz: 193.1,
    channel_spacing_ghz: 50.0,
    baud_rate_gbaud: 64.0,
    launch_power_vector: new Array(channelCount).fill(-20.0),
    initial_ase_vector: new Array(channelCount).fill(-60.0),
    initial_nli_vector: new Array(channelCount).fill(-200.0),
    modulation: '16QAM',
    shaping_moments: { moment4: 1.32, moment6: 1.90 }
  }
}

/** 创建默认的 USE 项目数据 */
export function createDefaultUSEProjectData(
  projectName: string,
  creatorUserId: string
): USEProjectData {
  const now = new Date().toISOString()
  
  return {
    metadata: {
      file_format_version: '2.0',
      project_uuid: generateUUID(),
      project_name: projectName,
      creator_user_id: creatorUserId,
      resource_root_dir: '',
      allow_other_users: false,
      created_at: now,
      updated_at: now,
      display_settings: {
        crs: 'EPSG:4326',
        units: { length: 'km', depth: 'm' }
      }
    },
    environment_context: {
      layer_registry: [],
      planning_mode: 'POINT_TO_POINT',
      redundancy_config: {
        enabled: false
      },
      imported_landing_points: [],
      imported_bu_nodes: [],
      route_planning_settings: {
        cable_armor_mapping: {
          high_risk: { threshold: 3.0, cable_type_ref: 'struct_da_01' },
          medium_risk: { threshold: 2.0, cable_type_ref: 'struct_sa_01' },
          low_risk: { threshold: 0, cable_type_ref: 'struct_lw_01' }
        },
        algorithm_config: {
          planning_bounds: { mode: 'AUTO' },
          grid_resolution_m: 500
        }
      }
    },
    libraries: {
      fibers: [],
      cable_types: [],
      components: [],
      models: []
    },
    route_engineering: {
      route_status: {
        is_segmented: false,
        is_adjusted: false,
        last_modified: now
      },
      segmentation_config: {
        method: 'RISK_BASED',
        fixed_length_km: 2.0,
        risk_based: {
          min_length_km: 1.0,
          max_length_km: 5.0
        }
      },
      geometry_pool: [],
      key_events: [],
      segments: [],
      spans: []
    },
    system_engineering: {
      wdm_config: createDefaultWDMConfig(),
      simulation_cache: null,
      system_planning_cache: null
    },
    health_monitoring: {
      collector_config: null,
      device_mapping: [],
      view_settings: {
        node_positions: {},
        filters: {
          visible_types: ['EDFA', 'BU', 'LandStation'],
          min_alarm_severity: 'ALL'
        }
      }
    }
  }
}

/** 创建默认的光纤规格 */
export function createDefaultFiberSpec(id: string, name: string): FiberSpec {
  return {
    id,
    fiber_type_id: name,
    attributes: {
      attenuation: 0.16,
      A_eff: 80,
      dispersion: 2.1e-5,
      dispersion_slope: 60.0,
      n2: 2.6
    },
    supported_models: ['fiber_gn_model', 'fiber_egn_model'],
    model_params: {
      fiber_gn_model: {
        is_configured: true,
        params: {
          coherence_factor: 1.0,
          noise_bandwidth_ghz: 12.5
        }
      },
      fiber_egn_model: {
        is_configured: false,
        params: {}
      }
    }
  }
}

/** 创建默认的 EDFA 规格 */
export function createDefaultEDFASpec(id: string, name: string): ComponentSpec {
  return {
    id,
    name,
    type: 'EDFA',
    specs: {
      gain_db: 20.0,
      bandwidth_nm: 35.0,
      noise_figure_db: 5.0,
      max_output_power_dbm: 20.0,
      gain_flatness_db: 0.5
    },
    supported_models: ['edfa_gain_model'],
    model_params: {
      edfa_gain_model: {
        is_configured: true,
        params: {
          gain_tilt_db_per_nm: 0.01
        }
      }
    },
    commercial_params: {
      unit_price: 250000,
      currency: 'USD'
    }
  }
}

/** 创建默认的 BU 规格 */
export function createDefaultBUSpec(id: string, name: string, portCount: 3 | 4 = 3): ComponentSpec {
  const matrix = portCount === 3
    ? [[0, 1, 1], [1, 0, 1], [1, 1, 0]]
    : [[0, 1, 1, 1], [1, 0, 1, 1], [1, 1, 0, 1], [1, 1, 1, 0]]

  return {
    id,
    name,
    type: 'BU',
    specs: {
      port_count: portCount,
      matrix,
      thru_pair: [1, 2],
      loss_vals: {
        thru: 0.8,
        branch: 3.5
      }
    },
    supported_models: ['bu_loss_model'],
    model_params: {
      bu_loss_model: {
        is_configured: true,
        params: {}
      }
    },
    commercial_params: {
      unit_price: portCount === 3 ? 180000 : 220000,
      currency: 'USD'
    }
  }
}

/** 创建默认的计算模型定义 */
export function createDefaultModels(): ModelDefinition[] {
  return [
    // 光纤线性损耗模型
    {
      model_id: 'fiber_linear_loss',
      version: '1.0.0',
      domain: 'FIBER',
      role: 'propagation',
      display_name: 'Fiber Linear Loss Model',
      description: 'Calculate linear attenuation loss for optical fiber span',
      entry_point: 'fiber_loss.py:calculate_linear_loss',
      language: 'python',
      inputs: [
        { param_id: 'attenuation', label: 'Attenuation Coefficient', unit: 'dB/km', type: 'float', required: true, source_hint: 'fiber.attributes.attenuation' },
        { param_id: 'length', label: 'Fiber Length', unit: 'km', type: 'float', required: true, source_hint: 'span.length_km' }
      ],
      outputs: [
        { param_id: 'total_loss_db', label: 'Total Loss', unit: 'dB', type: 'float' }
      ],
      constraints: [
        { param_id: 'length', min: 0, max: 500 }
      ],
      interface_contract: {
        state_inputs: [
          { param_id: 'power_spectrum_dbm', data_type: 'array', description: '入纤光功率谱 (dBm)' }
        ],
        state_outputs: [
          { param_id: 'power_spectrum_dbm', data_type: 'array', description: '出纤光功率谱 (dBm)' }
        ]
      },
      compatibility: {
        requires: [],
        provides: ['fiber_loss'],
        incompatible_with: []
      }
    },
    // GN 模型
    {
      model_id: 'fiber_gn_model',
      version: '1.0.0',
      domain: 'FIBER',
      role: 'propagation',
      display_name: 'GN Model',
      description: 'Gaussian Noise model for fiber nonlinear interference calculation',
      entry_point: 'gn_model.py:calculate_gn',
      language: 'python',
      inputs: [
        { param_id: 'attenuation', label: 'Attenuation', unit: 'dB/km', type: 'float', required: true, source_hint: 'fiber.attributes.attenuation' },
        { param_id: 'length', label: 'Length', unit: 'km', type: 'float', required: true, source_hint: 'span.length_km' },
        { param_id: 'A_eff', label: 'Effective Area', unit: 'μm²', type: 'float', required: true, source_hint: 'fiber.attributes.A_eff' },
        { param_id: 'n2', label: 'Nonlinear Index', unit: '1e-20 m²/W', type: 'float', required: true, source_hint: 'fiber.attributes.n2' },
        { param_id: 'dispersion', label: 'Dispersion', unit: 's/m²', type: 'float', required: true, source_hint: 'fiber.attributes.dispersion' }
      ],
      outputs: [
        { param_id: 'nli_power', label: 'NLI Power', unit: 'dBm', type: 'float' },
        { param_id: 'gsnr', label: 'GSNR', unit: 'dB', type: 'float' }
      ],
      interface_contract: {
        state_inputs: [
          { param_id: 'power_spectrum_dbm', data_type: 'array', description: '入纤光功率谱 (dBm)' },
          { param_id: 'ase_spectrum_dbm', data_type: 'array', description: 'ASE 噪声谱 (dBm)' },
          { param_id: 'nli_spectrum_dbm', data_type: 'array', description: 'NLI 噪声谱 (dBm)' }
        ],
        state_outputs: [
          { param_id: 'power_spectrum_dbm', data_type: 'array', description: '出纤光功率谱 (dBm)' },
          { param_id: 'nli_spectrum_dbm', data_type: 'array', description: '累积 NLI 噪声谱 (dBm)' },
          { param_id: 'gsnr_spectrum_db', data_type: 'array', description: 'GSNR 频谱 (dB)' }
        ]
      },
      compatibility: {
        requires: [],
        provides: ['fiber_nli', 'fiber_loss'],
        incompatible_with: ['fiber_egn_model']
      }
    },
    // EDFA 增益模型
    {
      model_id: 'edfa_gain_model',
      version: '1.0.0',
      domain: 'EDFA',
      role: 'propagation',
      display_name: 'EDFA Gain Model',
      description: 'Calculate EDFA output power considering saturation',
      entry_point: 'edfa_model.py:calculate_gain',
      language: 'python',
      inputs: [
        { param_id: 'input_power_dbm', label: 'Input Power', unit: 'dBm', type: 'float', required: true, source_hint: 'link.input_power_dbm' },
        { param_id: 'gain_db', label: 'Nominal Gain', unit: 'dB', type: 'float', required: true, source_hint: 'component.specs.gain_db' },
        { param_id: 'max_output_power_dbm', label: 'Saturation Power', unit: 'dBm', type: 'float', required: true, source_hint: 'component.specs.max_output_power_dbm' }
      ],
      outputs: [
        { param_id: 'output_power_dbm', label: 'Output Power', unit: 'dBm', type: 'float' },
        { param_id: 'actual_gain_db', label: 'Actual Gain', unit: 'dB', type: 'float' }
      ],
      interface_contract: {
        state_inputs: [
          { param_id: 'power_spectrum_dbm', data_type: 'array', description: '入纤光功率谱 (dBm)' },
          { param_id: 'ase_spectrum_dbm', data_type: 'array', description: 'ASE 噪声谱 (dBm)' }
        ],
        state_outputs: [
          { param_id: 'power_spectrum_dbm', data_type: 'array', description: '放大后光功率谱 (dBm)' },
          { param_id: 'ase_spectrum_dbm', data_type: 'array', description: '累积 ASE 噪声谱 (dBm)' }
        ]
      },
      compatibility: {
        requires: [],
        provides: ['edfa_gain', 'edfa_ase'],
        incompatible_with: []
      }
    },
    // BU 损耗模型
    {
      model_id: 'bu_loss_model',
      version: '1.0.0',
      domain: 'BU',
      role: 'propagation',
      display_name: 'BU Loss Model',
      description: 'Calculate BU insertion loss based on port configuration',
      entry_point: 'bu_model.py:calculate_loss',
      language: 'python',
      inputs: [
        { param_id: 'input_port', label: 'Input Port', unit: '', type: 'int', required: true },
        { param_id: 'output_port', label: 'Output Port', unit: '', type: 'int', required: true },
        { param_id: 'thru_loss', label: 'Thru Loss', unit: 'dB', type: 'float', required: true, source_hint: 'component.specs.loss_vals.thru' },
        { param_id: 'branch_loss', label: 'Branch Loss', unit: 'dB', type: 'float', required: true, source_hint: 'component.specs.loss_vals.branch' }
      ],
      outputs: [
        { param_id: 'loss_db', label: 'Insertion Loss', unit: 'dB', type: 'float' },
        { param_id: 'mode', label: 'Mode', unit: '', type: 'string' }
      ],
      interface_contract: {
        state_inputs: [
          { param_id: 'power_spectrum_dbm', data_type: 'array', description: '入端光功率谱 (dBm)' }
        ],
        state_outputs: [
          { param_id: 'power_spectrum_dbm', data_type: 'array', description: '出端光功率谱 (dBm)' }
        ]
      },
      compatibility: {
        requires: [],
        provides: ['bu_loss'],
        incompatible_with: []
      }
    }
  ]
}
