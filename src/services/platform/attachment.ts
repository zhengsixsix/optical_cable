import { PLATFORM_API_BASE_URL } from '@/config/api'
import { getPlatformToken, PlatformApiError } from './client'
import type { Id } from './types'

export type PlatformAttachmentRectRange = readonly [
  eastLongitude: number,
  westLongitude: number,
  southLatitude: number,
  northLatitude: number,
]

function appendRectRange(url: string, rectRange?: PlatformAttachmentRectRange): string {
  if (!rectRange) return url

  const hashIndex = url.indexOf('#')
  const hash = hashIndex >= 0 ? url.slice(hashIndex) : ''
  const urlWithoutHash = hashIndex >= 0 ? url.slice(0, hashIndex) : url
  const queryIndex = urlWithoutHash.indexOf('?')
  const pathname = queryIndex >= 0 ? urlWithoutHash.slice(0, queryIndex) : urlWithoutHash
  const searchParams = new URLSearchParams(queryIndex >= 0 ? urlWithoutHash.slice(queryIndex + 1) : '')

  searchParams.delete('rectRange')
  rectRange.forEach(value => searchParams.append('rectRange', String(value)))

  return `${pathname}?${searchParams.toString()}${hash}`
}

export function getPlatformAttachmentUrl(
  attachmentId: Id,
  rectRange?: PlatformAttachmentRectRange,
): string {
  const url = `${PLATFORM_API_BASE_URL}/sys/attachment/${encodeURIComponent(String(attachmentId))}`
  return appendRectRange(url, rectRange)
}

export function isPlatformAttachmentUrl(url: string | null | undefined): boolean {
  return Boolean(url?.startsWith(`${PLATFORM_API_BASE_URL}/sys/attachment/`))
}

export async function fetchPlatformAttachmentBlob(
  attachmentIdOrUrl: Id | string,
  rectRange?: PlatformAttachmentRectRange,
  signal?: AbortSignal,
): Promise<Blob> {
  const attachmentUrl = String(attachmentIdOrUrl).startsWith(`${PLATFORM_API_BASE_URL}/sys/attachment/`)
    ? String(attachmentIdOrUrl)
    : getPlatformAttachmentUrl(attachmentIdOrUrl)
  const url = appendRectRange(attachmentUrl, rectRange)
  const token = getPlatformToken()
  const headers: Record<string, string> = {}
  if (token) headers.Authorization = token.startsWith('Bearer ') ? token : `Bearer ${token}`

  const requestOptions: RequestInit = {
    method: 'GET',
    credentials: 'include',
    headers,
  }
  if (signal) requestOptions.signal = signal

  const response = await fetch(url, requestOptions)

  if (!response.ok) {
    throw new PlatformApiError(response.statusText || '附件下载失败', String(response.status), response.status)
  }

  return response.blob()
}
