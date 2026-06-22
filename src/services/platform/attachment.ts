import { PLATFORM_API_BASE_URL } from '@/config/api'
import { getPlatformToken, PlatformApiError } from './client'
import type { Id } from './types'

export function getPlatformAttachmentUrl(attachmentId: Id): string {
  return `${PLATFORM_API_BASE_URL}/sys/attachment/${encodeURIComponent(String(attachmentId))}`
}

export function isPlatformAttachmentUrl(url: string | null | undefined): boolean {
  return Boolean(url?.startsWith(`${PLATFORM_API_BASE_URL}/sys/attachment/`))
}

export async function fetchPlatformAttachmentBlob(attachmentIdOrUrl: Id | string): Promise<Blob> {
  const url = String(attachmentIdOrUrl).startsWith(`${PLATFORM_API_BASE_URL}/sys/attachment/`)
    ? String(attachmentIdOrUrl)
    : getPlatformAttachmentUrl(attachmentIdOrUrl)
  const token = getPlatformToken()
  const headers: Record<string, string> = {}
  if (token) headers.Authorization = token.startsWith('Bearer ') ? token : `Bearer ${token}`

  const response = await fetch(url, {
    method: 'GET',
    credentials: 'include',
    headers,
  })

  if (!response.ok) {
    throw new PlatformApiError(response.statusText || '附件下载失败', String(response.status), response.status)
  }

  return response.blob()
}

export async function fetchPlatformAttachmentArrayBuffer(attachmentIdOrUrl: Id | string): Promise<ArrayBuffer> {
  return (await fetchPlatformAttachmentBlob(attachmentIdOrUrl)).arrayBuffer()
}
