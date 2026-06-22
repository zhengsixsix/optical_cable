import { PLATFORM_API_BASE_URL } from '@/config/api'

export interface RespVO<T> {
  flag: number
  code: string
  msg: string
  page?: PageModel | null
  data: T
}

export interface PageModel {
  pageSize?: number
  dataTotal?: number
  pageTotal?: number
  pageNumber?: number
  startNumber?: number
  hasPrePage?: boolean
  hasNextPage?: boolean
}

export class PlatformApiError extends Error {
  readonly code: string
  readonly status?: number

  constructor(message: string, code: string, status?: number) {
    super(message)
    this.name = 'PlatformApiError'
    this.code = code
    this.status = status
  }
}

export const PLATFORM_TOKEN_KEY = 'platform.auth.token'
export const PLATFORM_USER_KEY = 'platform.auth.user'

export interface PlatformUnauthorizedEvent {
  code: string
  message: string
  path: string
  status?: number
}

type PlatformUnauthorizedListener = (event: PlatformUnauthorizedEvent) => void

const unauthorizedListeners = new Set<PlatformUnauthorizedListener>()

export function onPlatformUnauthorized(listener: PlatformUnauthorizedListener): () => void {
  unauthorizedListeners.add(listener)
  return () => unauthorizedListeners.delete(listener)
}

export function getPlatformToken(): string | null {
  return localStorage.getItem(PLATFORM_TOKEN_KEY)
}

export function setPlatformToken(token: string | null): void {
  if (token) {
    localStorage.setItem(PLATFORM_TOKEN_KEY, token)
  } else {
    localStorage.removeItem(PLATFORM_TOKEN_KEY)
  }
}

function clearPlatformSession(): void {
  localStorage.removeItem(PLATFORM_TOKEN_KEY)
  localStorage.removeItem(PLATFORM_USER_KEY)
}

function isUnauthorizedResponse(code: string | undefined, status: number | undefined): boolean {
  return code === '401' || status === 401
}

function notifyUnauthorized(event: PlatformUnauthorizedEvent): void {
  clearPlatformSession()
  for (const listener of unauthorizedListeners) {
    listener(event)
  }
}

function isRespVO<T>(payload: unknown): payload is RespVO<T> {
  return Boolean(
    payload
    && typeof payload === 'object'
    && 'flag' in payload
    && 'code' in payload
  )
}

export function createPlatformClient(baseUrl = PLATFORM_API_BASE_URL) {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, '')

  async function requestJson(path: string, body?: unknown): Promise<{ payload: unknown; headers: Headers; response: Response }> {
    const token = getPlatformToken()
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (token) headers.Authorization = token.startsWith('Bearer ') ? token : `Bearer ${token}`

    let response: Response
    try {
      response = await fetch(`${normalizedBaseUrl}${path}`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify(body ?? {}),
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : '网络异常'
      throw new PlatformApiError(`${detail}`, 'NETWORK_ERROR')
    }

    let payload: unknown = null
    try {
      payload = await response.json()
    } catch {
      throw new PlatformApiError(response.statusText || '接口返回格式错误', String(response.status), response.status)
    }

    return { payload, headers: response.headers, response }
  }

  async function request<T>(path: string, body?: unknown): Promise<{ payload: RespVO<T>; headers: Headers }> {
    const { payload, headers, response } = await requestJson(path, body)
    const responsePayload = payload as RespVO<T> | null

    if (!response.ok) {
      const code = responsePayload?.code || String(response.status)
      const message = responsePayload?.msg || response.statusText || '接口请求失败'
      if (isUnauthorizedResponse(code, response.status)) {
        notifyUnauthorized({ code, message, path, status: response.status })
      }
      throw new PlatformApiError(message, code, response.status)
    }

    if (!responsePayload || Number(responsePayload.flag) !== 1 || responsePayload.code !== '200') {
      const code = responsePayload?.code || '500'
      const message = responsePayload?.msg || '接口处理失败'
      if (isUnauthorizedResponse(code, response.status)) {
        notifyUnauthorized({ code, message, path, status: response.status })
      }
      throw new PlatformApiError(message, code, response.status)
    }

    return { payload: responsePayload, headers }
  }

  async function post<T>(path: string, body?: unknown): Promise<T> {
    const { payload } = await request<T>(path, body)
    return payload.data
  }

  async function postWithPage<T>(path: string, body?: unknown): Promise<RespVO<T>> {
    const { payload } = await request<T>(path, body)
    return payload
  }

  async function postJson<T>(path: string, body?: unknown): Promise<T> {
    const { payload, response } = await requestJson(path, body)

    if (!response.ok) {
      const errorPayload = payload as Partial<RespVO<unknown>> | null
      const code = errorPayload?.code || String(response.status)
      const message = errorPayload?.msg || response.statusText || '接口请求失败'
      if (isUnauthorizedResponse(code, response.status)) {
        notifyUnauthorized({ code, message, path, status: response.status })
      }
      throw new PlatformApiError(message, code, response.status)
    }

    if (isRespVO<T>(payload)) {
      if (Number(payload.flag) !== 1 || payload.code !== '200') {
        const code = payload.code || '500'
        const message = payload.msg || '接口处理失败'
        if (isUnauthorizedResponse(code, response.status)) {
          notifyUnauthorized({ code, message, path, status: response.status })
        }
        throw new PlatformApiError(message, code, response.status)
      }
      return payload.data
    }

    return payload as T
  }

  return {
    post,
    postJson,
    postWithPage,
    request,
  }
}

export const platformClient = createPlatformClient()
