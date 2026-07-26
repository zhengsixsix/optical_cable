export type Id = number | string

export interface PagedSearch {
  pageSize?: number
  pageNumber?: number
  [key: string]: unknown
}

export interface PcAuthInfo {
  userId?: number | string
  username?: string
  loginTime?: string
  realName?: string
  roles?: Record<string, string>
  menus?: Record<string, string>
  token?: string
  accessToken?: string
  jwt?: string
  authorization?: string
}

export interface PlatformUser {
  id?: number | string
  userId?: number | string
  username?: string
  realName?: string
  tele?: string
  approvalCd?: string
  approvalName?: string
  approvalDesc?: string
  approvalTime?: string
  approvalReqTime?: string
  remarks?: string
  isValidCd?: string
  isValidName?: string
  roles?: unknown[]
  menus?: unknown[]
}

export interface PlatformRole {
  id?: number | string
  code?: string
  name?: string
  description?: string
  isValidCd?: string
  sortNum?: number
  isSys?: number
  userCount?: number
  permission?: string
  users?: unknown[]
  menus?: unknown[]
}

export interface PlatformMenu {
  id?: number | string
  name?: string
  parentId?: number | string
  parentName?: string
  sortNum?: number
  url?: string
  typeCode?: string
  code?: string
  children?: PlatformMenu[]
  funcList?: PlatformMenu[]
}

export interface PlatformDictionary {
  id?: string
  code?: string
  name?: string
  detail?: string
  parentId?: string
  parentName?: string
  sortNum?: number
  isValidCd?: string
  type?: string
  editable?: number | null
  menderName?: string
  modifyTime?: string
}

export interface PlanProject {
  id?: Id
  name?: string
  desc?: string
  remarks?: string
  isPublic?: 0 | 1 | string | null
  pointList?: PlanPoint[]
}

export interface PlanRouteResult {
  pointList?: PlanPoint[] | null
  'FMM_path_result.json'?: unknown[] | string | null
  'segment_result_base_FixSpacing.json'?: Record<string, unknown> | string | null
  'segment_result_base_Risk.json'?: Record<string, unknown> | string | null
  'cost.txt'?: string | null
  'risk.txt'?: string | null
}

/** 可由系统规划流程实际选择的物理仿真模式。 */
export type PlanSimulationMode = 'fixed' | 'optimized'

/** Swagger 还枚举了生成器占位值；保留在 wire 类型中用于契约兼容。 */
export type PlanSimulationWireMode = PlanSimulationMode | 'LAYOUT_API_MODE'

export interface PlanSimulationPayload {
  id?: Id | null
  mode?: PlanSimulationWireMode | null
}

export interface PlanFmmPathResult {
  trace?: number[][]
  real_trace?: number[][]
  total_cost?: number
  total_risk?: number
  length?: number
}

export interface PlanResultSegment {
  segment_id?: number
  start_node_id?: number
  end_node_id?: number
  cable_type?: string
  length_km?: number
}

export interface PlanResultRiskLevel {
  level?: number
  risk_min?: number
  risk_max?: number
}

export interface PlanSegmentResultBase {
  route_index?: number
  segment_nodes?: number[][]
  segments?: PlanResultSegment[]
}

export interface PlanSegmentResultBaseRisk extends PlanSegmentResultBase {
  risk_level?: PlanResultRiskLevel[]
}

/** `/plan/project/saveResult` 保存手动调整后的路由规划结果。 */
export interface PlanProjectSaveResultPayload {
  id?: Id | null
  'cost.txt'?: string
  'risk.txt'?: string
  'FMM_path_result.json'?: PlanFmmPathResult[]
  'segment_result_base_FixSpacing.json'?: PlanSegmentResultBase
  'segment_result_base_Risk.json'?: PlanSegmentResultBaseRisk
}
/** 算法布局和物理仿真的内部结果仍由各算法定义。 */
export type PlanCalculationResult = unknown

/** 固定模式和优化模式共享的布局生成响应。 */
export interface PlanLayoutCalculationResponse {
  layoutResult: PlanCalculationResult
  deviceEntityList: PlanDeviceEntity[]
}

export interface PlatformPlanningResults {
  fixed: PlanCalculationResult | null
  optimized: PlanCalculationResult | null
  simulation: PlanCalculationResult | null
  errors: string[]
}

type PlanProjectDetailNumber = number | string | null
type PlanProjectDetailBoolean = boolean | number | string | null

export interface PlanProjectDetailScope {
  topLeftLng?: PlanProjectDetailNumber
  topLeftLat?: PlanProjectDetailNumber
  bottomRightLng?: PlanProjectDetailNumber
  bottomRightLat?: PlanProjectDetailNumber
}

export interface PlanProjectDetailChannel {
  channelCount?: PlanProjectDetailNumber
  baudRateGbaud?: PlanProjectDetailNumber
  modulationFormat?: string | null
  launchPowerDbm?: Array<number | string> | string | null
  channelFrequenciesThz?: Array<number | string> | string | null
  initialAseNoiseDbm?: PlanProjectDetailNumber
  initialNliNoiseDbm?: PlanProjectDetailNumber
  centerFrequencyThz?: PlanProjectDetailNumber
  channelSpacingGhz?: PlanProjectDetailNumber
}

export interface PlanProjectDetailOptimization {
  targetGsnrDb?: PlanProjectDetailNumber
  targetOsnrDb?: PlanProjectDetailNumber
  osnrMarginDb?: PlanProjectDetailNumber
  spanMinKm?: PlanProjectDetailNumber
  spanMaxKm?: PlanProjectDetailNumber
  spanStepKm?: PlanProjectDetailNumber
  minSpanLimitKm?: PlanProjectDetailNumber
  maxSpanLimitKm?: PlanProjectDetailNumber
  optimizationTarget?: string | null
}

export interface PlanProjectResult {
  id?: Id
  projectId?: Id
  routeResult?: unknown
  fixed?: PlanCalculationResult | null
  fixedResult?: PlanCalculationResult | null
  optimized?: PlanCalculationResult | null
  optimizedResult?: PlanCalculationResult | null
  simulation?: PlanCalculationResult | null
  simulationResult?: PlanCalculationResult | null
  [key: string]: unknown
}

/**
 * `/plan/project/detail` returns the project and its persisted planning configuration.
 * Numeric and boolean values are strings in the current backend response.
 */
export interface PlanProjectDetail extends PlanProject {
  scope?: PlanProjectDetailScope | null
  gridResolution?: PlanProjectDetailNumber
  enableRedundancy?: PlanProjectDetailBoolean
  channelConfig?: PlanProjectDetailChannel | null
  optimization?: PlanProjectDetailOptimization | null
  spanKm?: PlanProjectDetailNumber
  planResult?: PlanProjectResult | string | null
}

export interface PlanPoint {
  id?: Id
  projectId?: Id
  projectName?: string
  name?: string
  longitude?: number | string | null
  latitude?: number | string | null
  sortNum?: number | string | null
  coordinate?: {
    x?: number | string | null
    y?: number | string | null
  }
}

export interface PlanPointSearch extends PagedSearch {
  id?: Id
  projectId?: Id | null
  name?: string | null
}

export interface PlanPointSavePayload {
  id?: Id
  projectId?: Id | null
  name?: string | null
  longitude?: number | null
  latitude?: number | null
  sortNum?: number | null
}

export interface PlanPointSaveListItem {
  id?: Id
  name?: string | null
  longitude?: number | null
  latitude?: number | null
  sortNum?: number | null
}

export interface PlanPointSaveListPayload {
  projectId: Id | null
  pointList?: PlanPointSaveListItem[] | null
}

export interface PlanConfigScope {
  projectId: Id
  topLeftLng?: number | null
  topLeftLat?: number | null
  bottomRightLng?: number | null
  bottomRightLat?: number | null
}

export interface PlanConfigGridResolution {
  projectId: Id
  gridResolution?: number | null
}

export interface PlanConfigRedundancy {
  projectId: Id
  enableRedundancy?: boolean | null
}

export interface PlanConfigChannel {
  projectId: Id
  channelCount?: number | null
  baudRateGbaud?: number | null
  modulationFormat?: string | null
  launchPowerDbm?: number[] | null
  channelFrequenciesThz?: number[] | null
  initialAseNoiseDbm?: number | null
  initialNliNoiseDbm?: number | null
  centerFrequencyThz?: number | null
  channelSpacingGhz?: number | null
}

export interface PlanConfigOptimization {
  projectId: Id
  targetGsnrDb?: number | null
  targetOsnrDb?: number | null
  osnrMarginDb?: number | null
  spanMinKm?: number | null
  spanMaxKm?: number | null
  spanStepKm?: number | null
  minSpanLimitKm?: number | null
  maxSpanLimitKm?: number | null
  optimizationTarget?: 'max_gsnr' | 'min_amp' | string | null
}

/** Swagger 的优化配置请求/响应将数值字段编码为 string。 */
export interface PlanConfigOptimizationWire {
  projectId: Id
  targetGsnrDb?: string | null
  targetOsnrDb?: string | null
  osnrMarginDb?: string | null
  spanMinKm?: string | null
  spanMaxKm?: string | null
  spanStepKm?: string | null
  minSpanLimitKm?: string | null
  maxSpanLimitKm?: string | null
  optimizationTarget?: 'max_gsnr' | 'min_amp' | string | null
}

export interface PlanConfigSpanKm {
  projectId: Id
  spanKm?: number | null
}

/** 系统规划向导的本地表单快照；平台接口不接收这些扩展字段。 */
export interface SystemPlanningFormSnapshot {
  routeId: string
  fiberModel: string
  amplifierModel: string
  fiberTypeId: string
  amplifierTypeId: string
  fiberDeviceValues?: Record<string, string>
  amplifierDeviceValues?: Record<string, string>
  fiberParams: Record<string, number>
  amplifierParams: Record<string, number>
  ssfmParams: {
    stepSize: number
    samplePoints: number
    maxIterations: number
  }
  spanStrategy: 'auto' | 'fixed'
  spanKm: number
  spanScanConfig: {
    min: number
    max: number
    step: number
  }
  optimizationTarget: 'min_amplifiers' | 'max_gsnr'
  constraints: {
    maxSpanLength: number
    minSpanLength: number
    osnrMargin: number
  }
  launchPowerMode: 'uniform' | 'grouped' | 'per_channel' | 'import'
  launchPowerGroups: {
    lower: number
    center: number
    upper: number
  }
  buConfigs?: Array<{
    connectorId: string
    componentRefId: string
    trunkLoss: number
    branchLoss: number
    nextHopUpstream: string
    nextHopDownstream: string
    nextHopBranch1: string
    nextHopBranch2?: string
    nextHopBranch3?: string
  }>
  equalizers?: Array<{
    connectorId?: string
    name: string
    kp: number
    componentRefId: string
    equalizerRole: 'T' | 'S'
    attenuationMode: 'adjustable' | 'fixed'
    attenuationDb: number
    specifications: string
    remarks: string
  }>
  savedAt: string
}

export interface PlanConfigSnapshot {
  scope: Omit<PlanConfigScope, 'projectId'> | null
  gridResolution: number | null
  enableRedundancy: boolean | null
  channelConfig: Omit<PlanConfigChannel, 'projectId'> | null
  optimization: Omit<PlanConfigOptimization, 'projectId'> | null
  spanKm: number | null
  errors: string[]
  form?: SystemPlanningFormSnapshot | null
}

export type PlanLayerTypeDic = string

export interface PlanLayer {
  id?: Id
  name?: string | null
  filename?: string | null
  fileSize?: number | null
  attachmentName?: string | null
  remarks?: string | null
  isPublic?: 0 | 1 | null
  isDefault?: 0 | 1 | null
  attachmentId?: Id | null
  projectId?: Id | null
  typeDic?: PlanLayerTypeDic | null
}

export interface PlanLayerUploadCompletePayload {
  uploadUrl: string
  bizId?: Id | null
  typeDic: string
}

interface PlatformIconSize {
  width?: number | null
  height?: number | null
}

export interface PlatformBindFunc {
  name?: string
  isDefault?: 0 | 1 | number | null
  defaultInputParams?: Record<string, unknown>
}

type PlanDeviceDataType = 'DATA_TYPE' | 'NUMBER' | 'STRING' | 'BOOLEAN' | 'DATETIME'

export interface PlanDeviceConfig {
  id?: Id
  deviceTypeCd?: string | null
  deviceTypeName?: string | null
  name?: string | null
  code?: string | null
  dataTypeCd?: PlanDeviceDataType | string | null
  dataTypeName?: string | null
  dataFormat?: number | null
  dicCode?: string | null
  defaultValue?: string | null
  description?: string | null
  jsonField?: string | null
  unit?: string | null
  groupCode?: string | null
  groupName?: string | null
}

export interface PlanDeviceConfigSearch extends PagedSearch {
  deviceTypeCd: string
  name?: string | null
  code?: string | null
  dataTypeCd?: PlanDeviceDataType | string | null
  dicCode?: string | null
  defaultValue?: string | null
  description?: string | null
  jsonField?: string | null
  unit?: string | null
  groupCode?: string | null
  groupName?: string | null
}

export interface PlanDeviceConfigSave {
  id?: Id | null
  deviceTypeCd: string
  name?: string | null
  code: string
  dataTypeCd?: PlanDeviceDataType | string | null
  dataFormat?: number | null
  dicCode?: string | null
  defaultValue?: string | null
  description?: string | null
  jsonField?: string | null
  unit?: string | null
  groupCode?: string | null
  groupName?: string | null
}

export interface PlanDeviceValueSave {
  id?: Id | null
  configCode?: string | null
  value?: string | null
}

export interface PlanDeviceValueSimple {
  deviceTypeCd?: string | null
  deviceTypeName?: string | null
  configName?: string | null
  configCode?: string | null
  dataTypeCd?: PlanDeviceDataType | string | null
  dataFormat?: number | null
  dicCode?: string | null
  defaultValue?: string | null
  jsonField?: string | null
  unit?: string | null
  groupCode?: string | null
  groupName?: string | null
  value?: string | null
}

export interface PlanDeviceLibrary {
  id?: Id
  projectId?: Id | null
  name?: string | null
  deviceTypeCd?: string | null
  typeName?: string | null
  iconId?: Id | null
  iconName?: string | null
  iconSize?: PlatformIconSize | null
  dialogWindowId?: string | null
  dialogWindowName?: string | null
  bindFuncList?: PlatformBindFunc[] | null
  deviceValueList?: Array<PlanDeviceValueSave | PlanDeviceValueSimple> | null
  isDefault?: 0 | 1 | number | null
}

export interface PlanDeviceLibrarySearch extends PagedSearch {
  id?: Id | null
  projectId?: Id | null
  name?: string | null
  deviceTypeCd?: string | null
  dialogWindowId?: string | null
  isDefault?: 0 | 1 | number | null
}

export interface PlanDeviceLibrarySaveDefaultPayload {
  id: Id
  deviceTypeCd: string
}

export interface PlanDeviceEntity {
  id?: Id
  name?: string | null
  deviceTypeCd?: string | null
  typeName?: string | null
  iconId?: Id | null
  iconName?: string | null
  iconSize?: PlatformIconSize | null
  dialogWindowId?: string | null
  dialogWindowName?: string | null
  bindFuncList?: PlatformBindFunc[] | null
  libraryId?: Id | null
  libraryName?: string | null
  longitude?: number | null
  latitude?: number | null
  projectId?: Id | null
  sortNum?: number | null
  description?: string | null
  nodeId?: Id | null
  positionKm?: number | string | null
  mode?: string | null
  deviceValueList?: Array<PlanDeviceValueSave | PlanDeviceValueSimple> | null
  defaultBindFunc?: PlatformBindFunc | null
}

export interface PlanDeviceEntitySearch extends PagedSearch {
  id?: Id | null
  name?: string | null
  deviceTypeCd?: string | null
  libraryId?: Id | null
  longitude?: number | null
  latitude?: number | null
  projectId?: Id | null
  description?: string | null
}
