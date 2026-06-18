import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { normalizeTusLocationHeader, normalizeTusUploadUrl, uploadFileWithUppyTus } from '@/services/platform/uppyUpload'
import type { UppyLike } from '@/services/platform/uppyUpload'

describe('platform Uppy TUS upload', () => {
  const originalLocalStorage = globalThis.localStorage

  beforeEach(() => {
    const storage = new Map<string, string>([['platform.auth.token', 'jwt-token']])
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: vi.fn((key: string) => storage.get(key) ?? null),
        setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
        removeItem: vi.fn((key: string) => storage.delete(key)),
      },
    })
  })

  afterEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: originalLocalStorage,
    })
    vi.restoreAllMocks()
  })

  it('uploads one file through Uppy Tus and reports the created upload URL', async () => {
    const events = new Map<string, Function>()
    const use = vi.fn().mockReturnThis()
    const addFile = vi.fn().mockReturnValue('gis-layer-file-id')
    const upload = vi.fn(async () => {
      events.get('upload-progress')?.(
        { id: 'gis-layer-file-id' },
        { bytesUploaded: 64, bytesTotal: 128 },
      )
      return {
        successful: [
          {
            id: 'gis-layer-file-id',
            name: 'bathy.tif',
            size: 128,
            uploadURL: 'http://47.92.110.176:9108/sys/upload/files/bathy',
          },
        ],
        failed: [],
      }
    })
    const destroy = vi.fn()
    let uppy: UppyLike
    const on = vi.fn((event: string, handler: Function) => {
      events.set(event, handler)
      return uppy
    })
    uppy = {
      use,
      addFile,
      upload,
      destroy,
      on,
    }
    const createUppy = vi.fn(() => uppy)
    const progress = vi.fn()
    const file = new File(['abc'], 'bathy.tif', { type: 'image/tiff' })

    const result = await uploadFileWithUppyTus(file, {
      createUppy,
      onProgress: progress,
      chunkSize: 64 * 1024 * 1024,
    })

    expect(result).toEqual({
      uploadUrl: 'http://47.92.110.176:9108/sys/upload/files/bathy',
      fileName: 'bathy.tif',
      fileSize: 128,
    })
    expect(createUppy).toHaveBeenCalledWith({
      autoProceed: false,
      restrictions: { maxNumberOfFiles: 1 },
    })
    expect(use).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      endpoint: '/platform-api/sys/upload',
      chunkSize: 64 * 1024 * 1024,
      headers: { Authorization: 'Bearer jwt-token' },
      httpStack: expect.any(Object),
      removeFingerprintOnSuccess: true,
      allowedMetaFields: ['filename', 'filetype', 'filesize'],
    }))
    expect(addFile).toHaveBeenCalledWith({
      name: 'bathy.tif',
      type: 'image/tiff',
      data: file,
      meta: {
        filename: 'bathy.tif',
        filetype: 'image/tiff',
        filesize: '3',
      },
    })
    expect(progress).toHaveBeenCalledWith({ percent: 50, bytesUploaded: 64, bytesTotal: 128 })
    expect(destroy).toHaveBeenCalled()
  })

  it('keeps TUS patch requests behind the platform API proxy when Location is root-relative', () => {
    expect(normalizeTusLocationHeader('/sys/upload/upload-id', '/platform-api/sys/upload')).toBe(
      '/platform-api/sys/upload/upload-id',
    )
    expect(normalizeTusUploadUrl('/sys/upload/upload-id', '/platform-api/sys/upload')).toBe(
      '/platform-api/sys/upload/upload-id',
    )
    expect(normalizeTusUploadUrl('http://localhost/sys/upload/upload-id', '/platform-api/sys/upload')).toBe(
      'http://localhost/platform-api/sys/upload/upload-id',
    )
    expect(normalizeTusLocationHeader('/sys/upload/upload-id', '/sys/upload')).toBe('/sys/upload/upload-id')
    expect(normalizeTusLocationHeader('http://backend/sys/upload/upload-id', '/platform-api/sys/upload')).toBe(
      'http://backend/sys/upload/upload-id',
    )
  })
})
