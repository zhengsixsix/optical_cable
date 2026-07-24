import { Uppy } from '@uppy/core'
import Tus from '@uppy/tus'
import { PLATFORM_API_BASE_URL } from '@/config/api'
import { getPlatformToken } from './client'

export interface UppyUploadProgress {
  percent: number
  bytesUploaded: number
  bytesTotal: number
}

export interface UppyTusUploadResult {
  uploadUrl: string
  fileName: string
  fileSize: number
}

interface UppyUploadFile {
  name?: string
  size?: number | null
  uploadURL?: string
  response?: {
    uploadURL?: string
  }
  tus?: {
    uploadUrl?: string
  }
}

interface UppyUploadResult {
  successful?: UppyUploadFile[]
  failed?: unknown[]
}

interface UppyLike {
  use(plugin: unknown, options: Record<string, unknown>): UppyLike
  addFile(file: { name: string; type: string; data: File; meta: Record<string, string> }): string
  on(event: string, handler: (...args: any[]) => void): UppyLike
  upload(): Promise<UppyUploadResult | undefined>
  destroy?: () => void
}

type CreateUppy = (options: {
  autoProceed: boolean
  restrictions: { maxNumberOfFiles: number }
}) => UppyLike

export interface UploadFileWithUppyTusOptions {
  endpoint?: string
  chunkSize?: number
  createUppy?: CreateUppy
  onProgress?: (progress: UppyUploadProgress) => void
}

const DEFAULT_TUS_CHUNK_SIZE = 64 * 1024 * 1024

interface TusHttpResponse {
  getStatus(): number
  getHeader(header: string): string | undefined
  getBody(): string
  getUnderlyingObject(): XMLHttpRequest
}

interface TusHttpRequest {
  getMethod(): string
  getURL(): string
  setHeader(header: string, value: string): void
  getHeader(header: string): string | undefined
  setProgressHandler(handler: (bytesSent: number) => void): void
  send(body?: XMLHttpRequestBodyInit | null): Promise<TusHttpResponse>
  abort(): Promise<void>
  getUnderlyingObject(): XMLHttpRequest
}

class PlatformTusHttpResponse implements TusHttpResponse {
  constructor(
    private readonly xhr: XMLHttpRequest,
    private readonly endpoint: string,
  ) {}

  getStatus(): number {
    return this.xhr.status
  }

  getHeader(header: string): string | undefined {
    const value = this.xhr.getResponseHeader(header) ?? undefined
    if (header.toLowerCase() === 'location') {
      return normalizeTusLocationHeader(value, this.endpoint)
    }
    return value
  }

  getBody(): string {
    return this.xhr.responseText
  }

  getUnderlyingObject(): XMLHttpRequest {
    return this.xhr
  }
}

class PlatformTusHttpRequest implements TusHttpRequest {
  private readonly xhr = new XMLHttpRequest()
  private readonly headers: Record<string, string> = {}
  private readonly requestUrl: string

  constructor(
    private readonly method: string,
    url: string,
    private readonly endpoint: string,
  ) {
    this.requestUrl = normalizeTusUploadUrl(url, endpoint) ?? url
    this.xhr.open(method, this.requestUrl, true)
  }

  getMethod(): string {
    return this.method
  }

  getURL(): string {
    return this.requestUrl
  }

  setHeader(header: string, value: string): void {
    this.xhr.setRequestHeader(header, value)
    this.headers[header] = value
  }

  getHeader(header: string): string | undefined {
    return this.headers[header]
  }

  setProgressHandler(handler: (bytesSent: number) => void): void {
    if (!('upload' in this.xhr)) return
    this.xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        handler(event.loaded)
      }
    }
  }

  send(body: XMLHttpRequestBodyInit | null = null): Promise<TusHttpResponse> {
    return new Promise((resolve, reject) => {
      this.xhr.onload = () => resolve(new PlatformTusHttpResponse(this.xhr, this.endpoint))
      this.xhr.onerror = () => reject(new Error('TUS upload request failed'))
      this.xhr.send(body)
    })
  }

  abort(): Promise<void> {
    this.xhr.abort()
    return Promise.resolve()
  }

  getUnderlyingObject(): XMLHttpRequest {
    return this.xhr
  }
}

class PlatformTusHttpStack {
  constructor(private readonly endpoint: string) {}

  createRequest(method: string, url: string): TusHttpRequest {
    return new PlatformTusHttpRequest(method, url, this.endpoint)
  }

  getName(): string {
    return 'PlatformTusHttpStack'
  }
}

function getUrlPath(value: string): string {
  const origin = typeof window === 'undefined' ? 'http://localhost' : window.location.origin
  return new URL(value, origin).pathname.replace(/\/+$/, '')
}

function normalizeTusLocationHeader(location: string | undefined, endpoint: string): string | undefined {
  return normalizeTusUploadUrl(location, endpoint)
}

function normalizeTusUploadUrl(url: string | undefined, endpoint: string): string | undefined {
  if (!url) return url

  const endpointPath = getUrlPath(endpoint)
  const proxyPrefix = endpointPath.endsWith('/sys/upload')
    ? endpointPath.slice(0, -'/sys/upload'.length)
    : ''

  if (!proxyPrefix) return url

  if (url.startsWith('/sys/upload/')) {
    return `${proxyPrefix}${url}`
  }

  if (url.startsWith(`${proxyPrefix}/sys/upload/`)) {
    return url
  }

  const origin = typeof window === 'undefined' ? 'http://localhost' : window.location.origin
  try {
    const parsedUrl = new URL(url, origin)
    if (parsedUrl.origin === origin && parsedUrl.pathname.startsWith('/sys/upload/')) {
      parsedUrl.pathname = `${proxyPrefix}${parsedUrl.pathname}`
      return url.startsWith('/') ? `${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}` : parsedUrl.toString()
    }
  } catch {
    return url
  }

  return url
}

function buildAuthorizationHeaders(): Record<string, string> {
  const token = getPlatformToken()
  if (!token) return {}
  return {
    Authorization: token.startsWith('Bearer ') ? token : `Bearer ${token}`,
  }
}

function getUploadUrl(file: UppyUploadFile | undefined): string | null {
  return file?.uploadURL || file?.response?.uploadURL || file?.tus?.uploadUrl || null
}

function getFileType(file: File): string {
  return file.type || 'application/octet-stream'
}

export async function uploadFileWithUppyTus(
  file: File,
  options: UploadFileWithUppyTusOptions = {},
): Promise<UppyTusUploadResult> {
  const endpoint = options.endpoint ?? `${PLATFORM_API_BASE_URL}/sys/upload`
  const createUppy = options.createUppy ?? ((uppyOptions) => new Uppy(uppyOptions) as unknown as UppyLike)
  const uppy = createUppy({
    autoProceed: false,
    restrictions: { maxNumberOfFiles: 1 },
  })

  uppy.use(Tus, {
    endpoint,
    headers: buildAuthorizationHeaders(),
    httpStack: new PlatformTusHttpStack(endpoint),
    withCredentials: true,
    chunkSize: options.chunkSize ?? DEFAULT_TUS_CHUNK_SIZE,
    retryDelays: [0, 1000, 3000, 5000],
    removeFingerprintOnSuccess: true,
    allowedMetaFields: ['filename', 'filetype', 'filesize'],
  })

  uppy.on('upload-progress', (_uppyFile, progress) => {
    const bytesUploaded = Number(progress?.bytesUploaded ?? 0)
    const bytesTotal = Number(progress?.bytesTotal ?? 0)
    options.onProgress?.({
      percent: bytesTotal > 0 ? Math.round((bytesUploaded / bytesTotal) * 100) : 0,
      bytesUploaded,
      bytesTotal,
    })
  })

  try {
    uppy.addFile({
      name: file.name,
      type: getFileType(file),
      data: file,
      meta: {
        filename: file.name,
        filetype: getFileType(file),
        filesize: String(file.size),
      },
    })

    const result = await uppy.upload()
    const uploadedFile = result?.successful?.[0]
    const uploadUrl = getUploadUrl(uploadedFile)

    if (!uploadUrl) {
      throw new Error('上传完成后未返回 UploadURL')
    }

    return {
      uploadUrl,
      fileName: uploadedFile?.name || file.name,
      fileSize: Number(uploadedFile?.size ?? file.size),
    }
  } finally {
    uppy.destroy?.()
  }
}
