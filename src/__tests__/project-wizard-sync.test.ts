import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import {
  createProjectWizardSyncState,
  saveProjectWizardStep,
  uploadProjectWizardLayer,
} from '@/services/platform/projectWizardSync'

describe('project wizard step sync', () => {
  const originalFetch = globalThis.fetch
  const originalLocalStorage = globalThis.localStorage

  beforeEach(() => {
    const storage = new Map<string, string>()
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
    globalThis.fetch = originalFetch
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: originalLocalStorage,
    })
    vi.restoreAllMocks()
  })

  it('saves project metadata when leaving step 1', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ flag: 1, code: '200', msg: '成功', data: 88 }),
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const state = createProjectWizardSyncState()

    const result = await saveProjectWizardStep(state, 1, {
      projectType: 'use',
      projectName: '海缆项目A',
      allowOtherUsers: true,
    })

    expect(result.projectId).toBe(88)
    expect(state.projectId).toBe(88)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/plan/project/save'),
      expect.objectContaining({
        body: JSON.stringify({
          name: '海缆项目A',
          remarks: 'USE project',
          isPublic: 1,
        }),
      }),
    )
  })

  it('does not upload selected GIS layers when leaving step 1 before layer confirmation', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/plan/project/save')) {
        return {
          ok: true,
          json: async () => ({ flag: 1, code: '200', msg: '成功', data: 88 }),
        }
      }

      if (url.includes('/plan/planLayer/save')) {
        return {
          ok: true,
          json: async () => ({ flag: 1, code: '200', msg: '成功', data: 99 }),
        }
      }

      return {
        ok: true,
        json: async () => ({ attachmentId: 123 }),
      }
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const state = createProjectWizardSyncState()
    const file = new File(['abc'], 'bathy.tif', { type: 'image/tiff' })
    const uploadFile = vi.fn(async (_file: File, _options?: { onProgress?: (value: { percent: number; bytesUploaded: number; bytesTotal: number }) => void }) => ({
      uploadUrl: 'http://47.92.110.176:9108/sys/upload/files/bathy',
      fileName: 'bathy.tif',
      fileSize: file.size,
    }))
    const onLayerProgress = vi.fn()

    await saveProjectWizardStep(state, 1, {
      projectType: 'use',
      projectName: '海缆项目A',
      allowOtherUsers: true,
      layers: [
        {
          key: 'elevation',
          label: '海洋高程图',
          checked: true,
          value: 'bathy.tif',
          file,
          typeDic: 'BATHY',
        },
      ],
    }, { uploadFile, onLayerProgress })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(uploadFile).not.toHaveBeenCalled()
    expect(onLayerProgress).not.toHaveBeenCalled()
  })

  it('saves one confirmed GIS layer, uploads the file, and binds the completed upload', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/plan/project/save')) {
        return {
          ok: true,
          json: async () => ({ flag: 1, code: '200', msg: 'success', data: 88 }),
        }
      }

      if (url.includes('/plan/planLayer/save')) {
        return {
          ok: true,
          json: async () => ({ flag: 1, code: '200', msg: '成功', data: 99 }),
        }
      }

      return {
        ok: true,
        json: async () => ({ attachmentId: 123 }),
      }
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const state = createProjectWizardSyncState()
    const file = new File(['abc'], 'bathy.tif', { type: 'image/tiff' })
    const uploadFile = vi.fn(async (_file: File, _options?: { onProgress?: (value: { percent: number; bytesUploaded: number; bytesTotal: number }) => void }) => ({
      uploadUrl: 'http://47.92.110.176:9108/sys/upload/files/bathy',
      fileName: 'bathy.tif',
      fileSize: file.size,
    }))
    const onLayerProgress = vi.fn()

    await uploadProjectWizardLayer(state, {
      projectType: 'use',
      projectName: '海缆项目A',
      allowOtherUsers: true,
    }, {
      key: 'elevation',
      label: '海洋高程图',
      checked: true,
      value: 'bathy.tif',
      file,
      typeDic: 'BATHY',
    }, { uploadFile, onLayerProgress })

    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('/plan/project/save'),
      expect.objectContaining({
        body: JSON.stringify({
          name: '海缆项目A',
          remarks: 'USE project',
          isPublic: 1,
        }),
      }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('/plan/planLayer/save'),
      expect.objectContaining({
        body: JSON.stringify({
          name: '海洋高程图',
          remarks: '海洋高程图 - bathy.tif',
          isPublic: 1,
          isDefault: 0,
          projectId: 88,
          typeDic: 'BATHY',
        }),
      }),
    )
    expect(uploadFile).toHaveBeenCalledWith(file, expect.objectContaining({
      onProgress: expect.any(Function),
    }))
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('/sys/upload/complete'),
      expect.objectContaining({
        body: JSON.stringify({
          uploadUrl: 'http://47.92.110.176:9108/sys/upload/files/bathy',
          bizId: 99,
          typeDic: 'LAYER',
        }),
      }),
    )

    const progress = { percent: 75, bytesUploaded: 75, bytesTotal: 100 }
    const uploadOptions = uploadFile.mock.calls[0]?.[1] as { onProgress?: (value: typeof progress) => void } | undefined
    uploadOptions?.onProgress?.(progress)
    expect(onLayerProgress).toHaveBeenCalledWith('elevation', progress)
    expect(state.layerUploads.elevation).toEqual({
      layerId: 99,
      fileName: 'bathy.tif',
      uploadUrl: 'http://47.92.110.176:9108/sys/upload/files/bathy',
    })
  })

  it('creates the platform project before uploading a layer and sends the returned project id', async () => {
    const returnedProjectId = '2586209606847954945'
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/plan/project/save')) {
        return {
          ok: true,
          json: async () => ({ flag: 1, code: '200', msg: 'success', data: returnedProjectId }),
        }
      }

      if (url.includes('/plan/planLayer/save')) {
        return {
          ok: true,
          json: async () => ({ flag: 1, code: '200', msg: 'success', data: 99 }),
        }
      }

      return {
        ok: true,
        json: async () => ({ flag: 1, code: '200', msg: 'success', data: true }),
      }
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const state = createProjectWizardSyncState()
    const file = new File(['abc'], 'bathy.tif', { type: 'image/tiff' })
    const uploadFile = vi.fn(async () => ({
      uploadUrl: 'http://localhost:4395/platform-api/sys/upload/files/bathy',
      fileName: 'bathy.tif',
      fileSize: file.size,
    }))

    await uploadProjectWizardLayer(state, {
      projectType: 'use',
      projectName: 'Project A',
      allowOtherUsers: true,
    }, {
      key: 'elevation',
      label: 'Bathymetry layer',
      checked: true,
      value: 'bathy.tif',
      file,
      typeDic: 'BATHY',
    }, { uploadFile })

    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('/plan/project/save'),
      expect.objectContaining({
        body: JSON.stringify({
          name: 'Project A',
          remarks: 'USE project',
          isPublic: 1,
        }),
      }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('/plan/planLayer/save'),
      expect.objectContaining({
        body: JSON.stringify({
          name: 'Bathymetry layer',
          remarks: 'Bathymetry layer - bathy.tif',
          isPublic: 1,
          isDefault: 0,
          projectId: returnedProjectId,
          typeDic: 'BATHY',
        }),
      }),
    )
    expect(state.projectId).toBe(returnedProjectId)
  })

  it('saves stations and route config when leaving step 2', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ flag: 1, code: '200', msg: '成功', data: true }),
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch
    const state = createProjectWizardSyncState()
    state.projectId = 88

    await saveProjectWizardStep(state, 2, {
      projectType: 'use',
      projectName: '海缆项目A',
      allowOtherUsers: true,
      planningMode: 'point-to-point',
      startStation: { name: '登陆站A', longitude: 121.1, latitude: 31.2 },
      endStation: { name: '登陆站B', longitude: 122.1, latitude: 32.2 },
      gisConfig: {
        rangeMode: 'manual',
        planningRange: {
          northwest: { lon: 120.5, lat: 33.1 },
          southeast: { lon: 123.6, lat: 29.4 },
        },
        gridResolution: 500,
      },
      redundancyConfig: {
        enabled: true,
      },
    })

    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('/plan/point/saveList'),
      expect.objectContaining({
        body: JSON.stringify({
          projectId: 88,
          pointList: [
            { name: '登陆站A', longitude: 121.1, latitude: 31.2, sortNum: 1 },
            { name: '登陆站B', longitude: 122.1, latitude: 32.2, sortNum: 2 },
          ],
        }),
      }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('/plan/planConfig/saveScope'),
      expect.objectContaining({
        body: JSON.stringify({
          projectId: 88,
          topLeftLng: 120.5,
          topLeftLat: 33.1,
          bottomRightLng: 123.6,
          bottomRightLat: 29.4,
        }),
      }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('/plan/planConfig/saveGridResolution'),
      expect.objectContaining({
        body: JSON.stringify({ projectId: 88, gridResolution: 500 }),
      }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      expect.stringContaining('/plan/planConfig/saveEnableRedundancy'),
      expect.objectContaining({
        body: JSON.stringify({ projectId: 88, enableRedundancy: true }),
      }),
    )
  })
})
