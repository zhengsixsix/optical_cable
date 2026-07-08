export type Id = number | string

export interface PagedSearch {
  pageSize?: number
  pageNumber?: number
  [key: string]: unknown
}

export interface LongKeyCondition {
  id: number
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

export interface PlanPointSaveListPayload {
  projectId?: Id | null
  pointList?: PlanPoint[] | null
}

export interface PlanConfigScope {
  projectId?: Id | null
  topLeftLng?: number | null
  topLeftLat?: number | null
  bottomRightLng?: number | null
  bottomRightLat?: number | null
}

export interface PlanConfigGridResolution {
  projectId?: Id | null
  gridResolution?: number | null
}

export interface PlanConfigRedundancy {
  projectId?: Id | null
  enableRedundancy?: boolean | null
}

export type PlanLayerTypeDic =
  | 'LAYER_TYPE'
  | 'BATHY'
  | 'SLOPE'
  | 'VOLCANO'
  | 'CWCORAL'
  | 'SEISMIC'
  | 'FISHZONE'
  | 'SHIPLANE'

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

export interface PlatformIconSize {
  width?: number | null
  height?: number | null
}

export interface PlatformBindFunc {
  name?: string
  isDefault?: 0 | 1 | number | null
  defaultInputParams?: Record<string, unknown>
}

export type PlanDeviceDataType = 'DATA_TYPE' | 'NUMBER' | 'STRING' | 'BOOLEAN' | 'DATETIME'

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

export interface PlanDeviceValue {
  id?: Id
  deviceTypeCd?: string | null
  deviceTypeName?: string | null
  configCode?: string | null
  deviceLibraryId?: Id | null
  deviceLibraryName?: string | null
  deviceEntityId?: Id | null
  deviceEntityName?: string | null
  value?: string | null
}

export interface PlanDeviceValueSearch extends PagedSearch {
  id?: Id | null
  deviceTypeCd?: string | null
  configCode?: string | null
  deviceLibraryId?: Id | null
  deviceEntityId?: Id | null
  entityIsNull?: boolean | null
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
  deviceValueList?: Array<PlanDeviceValueSave | PlanDeviceValueSimple> | null
}

export interface PlanDeviceEntitySearch extends PagedSearch {
  id?: Id | null
  name?: string | null
  deviceTypeCd?: string | null
  libraryId?: Id | null
  longitude?: number | null
  latitude?: number | null
  projectId?: Id | null
}

export interface EndpointDefinition {
  key: string
  group: string
  name: string
  path: string
  defaultPayload: unknown
  authRequired?: boolean
  encryptPasswordFields?: string[]
  methods?: string[]
  callable?: boolean
  description?: string
}
