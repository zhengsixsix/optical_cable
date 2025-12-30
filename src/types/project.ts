// 项目文件类型定义 (.ucp / .use)
// 海底光缆路由规划系统项目配置文件格式

// ==================== 通用类型 ====================

/** 坐标点 */
export interface Coordinate {
  lng: number  // 经度
  lat: number  // 纬度
}

/** 文件类型 */
export type ProjectFileType = 'ucp' | 'use'

// ==================== 图层配置 ====================

/** 图层设置 */
export interface LayerSettings {
  oceanElevation: boolean      // 海洋高程图
  oceanVolcano: boolean        // 海洋火山分布
  oceanFishingZone: boolean    // 海洋渔区分布
  oceanSlope: boolean          // 海洋坡度图
  oceanEarthquake: boolean     // 海洋地震分布
  oceanRoute: boolean          // 海洋航道图
}

/** 图层设置默认值 */
export const defaultLayerSettings: LayerSettings = {
  oceanElevation: true,
  oceanVolcano: false,
  oceanFishingZone: false,
  oceanSlope: false,
  oceanEarthquake: false,
  oceanRoute: false,
}

// ==================== 器件库配置 ====================

/** 器件库配置 */
export interface DeviceLibraryConfig {
  currentLibrary: string  // 当前器件库名称/路径
}

// ==================== 路径规划配置 ====================

/** 路径规划模式 */
export type PathPlanningMode = 'shortest' | 'safest' | 'economic' | 'custom'

/** 路径规划配置 */
export interface PathPlanningConfig {
  mode: PathPlanningMode       // 规划模式
  startPoint: Coordinate | null  // 起点坐标
  endPoint: Coordinate | null    // 终点坐标
  multiPointFile: string | null  // 多点文件路径
}

// ==================== 传输系统配置 ====================

/** 计算模型类型 */
export type CalculationModel = 'standard' | 'advanced' | 'custom'

/** 传输系统配置 */
export interface TransmissionSystemConfig {
  channelCount: number          // 波道数量
  centerWavelength: number      // 中心波长 (nm)
  channelBandwidth: number      // 信道带宽 (GHz)
  calculationModel: CalculationModel  // 计算模型
}

/** 传输系统配置默认值 */
export const defaultTransmissionConfig: TransmissionSystemConfig = {
  channelCount: 80,
  centerWavelength: 1550.0,
  channelBandwidth: 50.0,
  calculationModel: 'standard',
}

// ==================== 监控系统配置 ====================

/** 数据源类型 */
export type DataSourceType = 'realtime' | 'historical' | 'simulation'

/** 监控系统配置 */
export interface MonitoringSystemConfig {
  dataSourceType: DataSourceType    // 数据源类型
  connectionAddress: string         // 连接地址
  opticalPowerThreshold: number     // 光功率阈值 (dBm)
  temperatureThreshold: number      // 温度阈值 (°C)
  berThreshold: number              // BER阈值 (误码率)
}

/** 监控系统配置默认值 */
export const defaultMonitoringConfig: MonitoringSystemConfig = {
  dataSourceType: 'realtime',
  connectionAddress: '',
  opticalPowerThreshold: -20.0,
  temperatureThreshold: 45.0,
  berThreshold: 1e-9,
}

// ==================== RPL/SLD 文件引用 ====================

/** RPL文件引用 (用于 .ucp) */
export interface RplFileRef {
  path: string  // RPL文件路径
}

/** SLD文件引用 */
export interface SldFileRef {
  path: string  // SLD文件路径
}

/** RPL文件引用 (用于 .use，包含关联的SLD文件) */
export interface RplFileRefWithSld {
  path: string           // RPL文件路径
  sldFiles: SldFileRef[] // 关联的SLD文件列表
}

// ==================== 项目基础信息 ====================

/** 项目基础信息 */
export interface ProjectInfo {
  name: string            // 项目名称
  creatorId: string       // 创建用户ID（手机号）
  serverPath: string      // 项目在服务器目录
  allowOthersOpen: boolean // 是否允许其他用户打开
}

// ==================== UCP 项目文件 ====================

/** UCP 项目文件结构 */
export interface UCPProject {
  fileType: 'ucp'
  version: string
  project: ProjectInfo
  rplFiles: RplFileRef[]
  layers: LayerSettings
  deviceLibrary: DeviceLibraryConfig
  pathPlanning: PathPlanningConfig
  transmissionSystem: TransmissionSystemConfig
  monitoringSystem: MonitoringSystemConfig
}

// ==================== USE 项目文件 ====================

/** USE 项目文件结构 (比UCP多了SLD文件关联) */
export interface USEProject {
  fileType: 'use'
  version: string
  project: ProjectInfo
  rplFiles: RplFileRefWithSld[]
  layers: LayerSettings
  deviceLibrary: DeviceLibraryConfig
  pathPlanning: PathPlanningConfig
  transmissionSystem: TransmissionSystemConfig
  monitoringSystem: MonitoringSystemConfig
}

// ==================== 联合类型 ====================

/** 项目文件联合类型 */
export type ProjectFile = UCPProject | USEProject

// ==================== 工厂函数 ====================

/** 创建默认 UCP 项目 */
export function createDefaultUCPProject(name: string, creatorId: string): UCPProject {
  return {
    fileType: 'ucp',
    version: '1.0',
    project: {
      name,
      creatorId,
      serverPath: '',
      allowOthersOpen: false,
    },
    rplFiles: [],
    layers: { ...defaultLayerSettings },
    deviceLibrary: { currentLibrary: 'default' },
    pathPlanning: {
      mode: 'shortest',
      startPoint: null,
      endPoint: null,
      multiPointFile: null,
    },
    transmissionSystem: { ...defaultTransmissionConfig },
    monitoringSystem: { ...defaultMonitoringConfig },
  }
}

/** 创建默认 USE 项目 */
export function createDefaultUSEProject(name: string, creatorId: string): USEProject {
  return {
    fileType: 'use',
    version: '1.0',
    project: {
      name,
      creatorId,
      serverPath: '',
      allowOthersOpen: false,
    },
    rplFiles: [],
    layers: { ...defaultLayerSettings },
    deviceLibrary: { currentLibrary: 'default' },
    pathPlanning: {
      mode: 'shortest',
      startPoint: null,
      endPoint: null,
      multiPointFile: null,
    },
    transmissionSystem: { ...defaultTransmissionConfig },
    monitoringSystem: { ...defaultMonitoringConfig },
  }
}

// ==================== 类型守卫 ====================

/** 判断是否为 UCP 项目 */
export function isUCPProject(project: ProjectFile): project is UCPProject {
  return project.fileType === 'ucp'
}

/** 判断是否为 USE 项目 */
export function isUSEProject(project: ProjectFile): project is USEProject {
  return project.fileType === 'use'
}
