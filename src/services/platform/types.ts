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
}

export interface PlanProject {
  id?: number
  name?: string
  desc?: string
  remarks?: string
  isPublic?: 0 | 1
}

export interface PlanPoint {
  id?: number
  projectId?: number
  projectName?: string
  name?: string
  longitude?: number
  latitude?: number
  sortNum?: number
  coordinate?: {
    x?: number
    y?: number
  }
}

export interface PlanPointSaveListPayload {
  projectId?: number | null
  pointList?: PlanPoint[] | null
}

export interface PlanConfigScope {
  projectId?: number | null
  topLeftLng?: number | null
  topLeftLat?: number | null
  bottomRightLng?: number | null
  bottomRightLat?: number | null
}

export interface PlanConfigGridResolution {
  projectId?: number | null
  gridResolution?: number | null
}

export interface PlanConfigRedundancy {
  projectId?: number | null
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
  id?: number
  name?: string | null
  filename?: string | null
  fileSize?: number | null
  attachmentName?: string | null
  remarks?: string | null
  isPublic?: 0 | 1 | null
  isDefault?: 0 | 1 | null
  attachmentId?: number | null
  typeDic?: PlanLayerTypeDic | null
}

export interface PlanLayerUploadCompletePayload {
  uploadUrl: string
  bizId?: number | null
  typeDic: string
}

export interface PlatformIconSize {
  width?: number | null
  height?: number | null
}

export interface PlatformBindFunc {
  name?: string
  defaultInputParams?: Record<string, unknown>
}

export interface PlanDeviceLibrary {
  id?: Id
  name?: string | null
  typeCd?: string | null
  typeName?: string | null
  iconId?: Id | null
  iconName?: string | null
  iconSize?: PlatformIconSize | null
  dialogWindowId?: string | null
  dialogWindowName?: string | null
  bindFuncList?: PlatformBindFunc[] | null
}

export interface PlanDeviceLibrarySearch extends PagedSearch {
  id?: Id | null
  name?: string | null
  typeCd?: string | null
  dialogWindowId?: string | null
}

export interface PlanDeviceEntity {
  id?: Id
  name?: string | null
  typeCd?: string | null
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
}

export interface PlanDeviceEntitySearch extends PagedSearch {
  id?: Id | null
  name?: string | null
  typeCd?: string | null
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
