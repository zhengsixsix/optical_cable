import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { PLATFORM_API_BASE_URL, PLATFORM_SWAGGER_DOC_URL } from '@/config/api'
import { encryptPassword, normalizeSm2PublicKey } from '@/services/platform/sm2'
import {
  createPlatformClient,
  onPlatformUnauthorized,
  PlatformApiError,
  PLATFORM_TOKEN_KEY,
  PLATFORM_USER_KEY,
} from '@/services/platform/client'
import {
  platformAuthApi,
  callPlatformEndpoint,
  platformDeviceEntityApi,
  platformDeviceLibraryApi,
  platformEndpointDefinitions,
  platformPlanLayerApi,
  platformPlanConfigApi,
  platformPointApi,
  platformUploadApi,
  platformUserApi,
} from '@/services/platform/api'
import {
  connectorElementToDeviceEntity,
  deviceLibraryItemToPlatform,
  platformDeviceLibraryToLocal,
} from '@/services/platform/deviceLibraryMapping'
import { deviceLibrarySyncNotice } from '@/services/platform/deviceLibrarySyncNotice'
import { syncPlanningProjectToPlatform } from '@/services/platform/projectSync'
import { useLayerStore } from '@/stores/layer'
import { useSettingsStore } from '@/stores/settings'
import { useUserStore } from '@/stores/user'

const sm2PublicKey =
  '3059301306072a8648ce3d020106082a811ccf5501822d034200044cc7b802610aebc13332fa6b22868ae6d50c758402a00512dea0c79ecd9d8dca6cee42925ab9b3bd81a2e8658460938c0104562271579fd461cfb72b3398ca27'

const sourceExtensions = new Set(['.ts', '.vue', '.js'])

function collectSourceFiles(root: string): string[] {
  if (!existsSync(root)) return []

  const entries = readdirSync(root)
  return entries.flatMap(entry => {
    const path = join(root, entry)
    const stat = statSync(path)

    if (stat.isDirectory()) return collectSourceFiles(path)

    const ext = path.slice(path.lastIndexOf('.'))
    return sourceExtensions.has(ext) ? [path] : []
  })
}

describe('SM2 password encryption', () => {
  it('extracts the uncompressed public key from the DER wrapper', () => {
    const normalized = normalizeSm2PublicKey(sm2PublicKey)

    expect(normalized).toMatch(/^04[0-9a-f]+$/)
    expect(normalized).toHaveLength(130)
  })

  it('encrypts passwords before transport', () => {
    const encrypted = encryptPassword('12345678', sm2PublicKey)

    expect(encrypted).not.toBe('12345678')
    expect(encrypted).toMatch(/^[0-9a-f]+$/i)
    expect(encrypted.length).toBeGreaterThan(120)
  })
})

describe('platform API client', () => {
  const originalFetch = globalThis.fetch
  const originalLocalStorage = globalThis.localStorage

  beforeEach(() => {
    setActivePinia(createPinia())
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

  it('adds bearer token and unwraps successful RespVO responses', async () => {
    localStorage.setItem('platform.auth.token', 'jwt-token')
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ flag: 1, code: '200', msg: '成功', data: { id: 7 } }),
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const client = createPlatformClient('http://api.example')
    const data = await client.post<{ id: number }>('/sys/user/detail', { id: 7 })

    expect(data).toEqual({ id: 7 })
    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.example/sys/user/detail',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer jwt-token',
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({ id: 7 }),
      }),
    )
  })

  it('throws PlatformApiError for backend failure responses', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ flag: 0, code: '500', msg: '失败', data: null }),
    }) as unknown as typeof fetch

    const client = createPlatformClient('http://api.example')

    await expect(client.post('/sys/user/search', {})).rejects.toBeInstanceOf(PlatformApiError)
  })

  it('normalizes blocked network requests into a visible platform error', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch')) as unknown as typeof fetch

    const client = createPlatformClient('/platform-api')

    await expect(client.post('/register', {})).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
    })
  })

  it('clears cached session and notifies the app when the backend asks the user to log in again', async () => {
    localStorage.setItem(PLATFORM_TOKEN_KEY, 'stale-token')
    localStorage.setItem(PLATFORM_USER_KEY, JSON.stringify({ username: 'admin' }))
    const unauthorizedListener = vi.fn()
    const unsubscribe = onPlatformUnauthorized(unauthorizedListener)
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ flag: 0, code: '401', msg: '请登录', page: null, data: null }),
    }) as unknown as typeof fetch

    const client = createPlatformClient('http://api.example')

    await expect(client.post('/sys/user/search', {})).rejects.toMatchObject({
      code: '401',
      message: '请登录',
    })
    expect(localStorage.getItem(PLATFORM_TOKEN_KEY)).toBeNull()
    expect(localStorage.getItem(PLATFORM_USER_KEY)).toBeNull()
    expect(unauthorizedListener).toHaveBeenCalledWith({
      code: '401',
      message: '请登录',
      path: '/sys/user/search',
      status: 200,
    })

    unsubscribe()
  })
})

describe('platform proxy configuration', () => {
  it('uses a same-origin proxy path by default to avoid browser CORS blocks', () => {
    expect(PLATFORM_API_BASE_URL).toBe('/platform-api')
  })

  it('points Swagger metadata at the named all-interfaces document', () => {
    expect(PLATFORM_SWAGGER_DOC_URL).toBe('/platform-api/v3/api-docs/所有接口')
  })

  it('configures Vite to proxy platform API calls to the online Swagger service', async () => {
    const viteConfigPath = fileURLToPath(new URL('../../vite.config.ts', import.meta.url))
    const source = readFileSync(viteConfigPath, 'utf8')

    expect(source).toContain("const PLATFORM_PROXY_PATH = '/platform-api'")
    expect(source).toContain("target: 'http://47.92.110.176:9108'")
    expect(source).toContain('[PLATFORM_PROXY_PATH]: platformProxy')
  })

  it('registers a global platform unauthorized handler that routes back to login', () => {
    const mainSource = readFileSync(fileURLToPath(new URL('../../src/main.ts', import.meta.url)), 'utf8')

    expect(mainSource).toContain('onPlatformUnauthorized')
    expect(mainSource).toContain('userStore.logout()')
    expect(mainSource).toContain("router.replace({ name: 'login' })")
  })
})

describe('platform Swagger endpoint coverage', () => {
  const originalFetch = globalThis.fetch
  const originalLocalStorage = globalThis.localStorage

  const swaggerPostPaths = [
    '/login',
    '/register',
    '/sys/user/searchRegister',
    '/sys/registerApproval',
    '/sys/user/add',
    '/sys/user/detail',
    '/sys/user/search',
    '/sys/user/saveRoles',
    '/sys/user/changePassword',
    '/sys/user/resetPassword',
    '/sys/user/remove',
    '/sys/user/modify',
    '/sys/user/setValid',
    '/sys/role/save',
    '/sys/role/remove',
    '/sys/role/detail',
    '/sys/role/search',
    '/sys/role/saveMenus',
    '/sys/menu/detail',
    '/sys/menu/search',
    '/sys/menu/tree',
    '/sys/dic/save',
    '/sys/dic/remove',
    '/sys/dic/search/list',
    '/sys/dic/search/listItem',
    '/sys/log/search',
    '/sys/upload/complete',
    '/sys/upload/**',
    '/plan/project/save',
    '/plan/project/remove',
    '/plan/project/detail',
    '/plan/project/search',
    '/plan/point/save',
    '/plan/point/saveList',
    '/plan/point/remove',
    '/plan/point/detail',
    '/plan/point/search',
    '/plan/planLayer/save',
    '/plan/planLayer/remove',
    '/plan/planLayer/detail',
    '/plan/planLayer/search',
    '/plan/planConfig/saveScope',
    '/plan/planConfig/saveGridResolution',
    '/plan/planConfig/saveEnableRedundancy',
    '/plan/deviceLibrary/save',
    '/plan/deviceLibrary/remove',
    '/plan/deviceLibrary/detail',
    '/plan/deviceLibrary/search',
    '/plan/deviceEntity/save',
    '/plan/deviceEntity/remove',
    '/plan/deviceEntity/detail',
    '/plan/deviceEntity/search',
  ]

  beforeEach(() => {
    setActivePinia(createPinia())
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

  it('lists every POST path exposed by the online Swagger document', () => {
    const definedPaths = platformEndpointDefinitions.map(endpoint => endpoint.path).sort()

    expect(definedPaths).toEqual([...swaggerPostPaths].sort())
  })

  it('documents the Swagger TUS upload wildcard without routing it through JSON calls', async () => {
    const definition = platformEndpointDefinitions.find(endpoint => endpoint.path === '/sys/upload/**')

    expect(definition).toEqual(expect.objectContaining({
      methods: ['GET', 'PUT', 'POST', 'DELETE', 'OPTIONS', 'HEAD', 'PATCH'],
      callable: false,
    }))
    await expect(callPlatformEndpoint(definition!, {})).rejects.toThrow('TUS 上传协议入口')
  })

  it('uses the Swagger request body shape for batch point saves', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ flag: 1, code: '200', msg: '成功', data: true }),
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    await platformPointApi.saveList(7, [
      { name: '登陆站A', longitude: 121.1, latitude: 31.2, sortNum: 1 },
      { name: '登陆站B', longitude: 122.1, latitude: 32.2, sortNum: 2 },
    ])

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/plan/point/saveList'),
      expect.objectContaining({
        body: JSON.stringify({
          projectId: 7,
          pointList: [
            { name: '登陆站A', longitude: 121.1, latitude: 31.2, sortNum: 1 },
            { name: '登陆站B', longitude: 122.1, latitude: 32.2, sortNum: 2 },
          ],
        }),
      }),
    )
  })

  it('calls Swagger planning config endpoints with their documented payloads', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ flag: 1, code: '200', msg: '成功', data: true }),
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    await platformPlanConfigApi.saveScope({
      projectId: 7,
      topLeftLng: 120.1,
      topLeftLat: 31.5,
      bottomRightLng: 122.2,
      bottomRightLat: 29.8,
    })
    await platformPlanConfigApi.saveGridResolution({ projectId: 7, gridResolution: 500 })
    await platformPlanConfigApi.saveEnableRedundancy({ projectId: 7, enableRedundancy: true })

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('/plan/planConfig/saveScope'),
      expect.objectContaining({
        body: JSON.stringify({
          projectId: 7,
          topLeftLng: 120.1,
          topLeftLat: 31.5,
          bottomRightLng: 122.2,
          bottomRightLat: 29.8,
        }),
      }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('/plan/planConfig/saveGridResolution'),
      expect.objectContaining({
        body: JSON.stringify({ projectId: 7, gridResolution: 500 }),
      }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('/plan/planConfig/saveEnableRedundancy'),
      expect.objectContaining({
        body: JSON.stringify({ projectId: 7, enableRedundancy: true }),
      }),
    )
  })

  it('calls the Swagger plan layer save endpoint with the documented payload', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ flag: 1, code: '200', msg: '成功', data: 99 }),
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const id = await platformPlanLayerApi.save({
      name: '海洋高程图',
      remarks: '海洋高程图 - bathy.tif',
      isPublic: 1,
      isDefault: 0,
      typeDic: 'BATHY',
    })

    expect(id).toBe(99)
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/plan/planLayer/save'),
      expect.objectContaining({
        body: JSON.stringify({
          name: '海洋高程图',
          remarks: '海洋高程图 - bathy.tif',
          isPublic: 1,
          isDefault: 0,
          typeDic: 'BATHY',
        }),
      }),
    )
  })

  it('calls Swagger device library endpoints with documented payloads', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ flag: 1, code: '200', msg: '成功', data: 101 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          flag: 1,
          code: '200',
          msg: '成功',
          page: { pageNumber: 1, pageSize: 10, dataTotal: 1 },
          data: [{ id: 101, name: 'G.654.E 光纤', typeCd: 'FIB', bindFuncList: [] }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          flag: 1,
          code: '200',
          msg: '成功',
          data: { id: 101, name: 'G.654.E 光纤', typeCd: 'FIB', bindFuncList: [] },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ flag: 1, code: '200', msg: '成功', data: true }),
      })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const savedId = await platformDeviceLibraryApi.save({
      name: 'G.654.E 光纤',
      typeCd: 'FIB',
      iconSize: { width: 48, height: 48 },
      bindFuncList: [{
        name: 'LOCAL_DEVICE_LIBRARY_PARAMS',
        defaultInputParams: { localType: 'fiber', attenuationCoeff: 0.16 },
      }],
    })
    const list = await platformDeviceLibraryApi.search({ pageNumber: 1, pageSize: 10, typeCd: 'FIB' })
    const detail = await platformDeviceLibraryApi.detail(101)
    const removed = await platformDeviceLibraryApi.remove(101)

    expect(savedId).toBe(101)
    expect(list.data).toHaveLength(1)
    expect(detail.id).toBe(101)
    expect(removed).toBe(true)
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('/plan/deviceLibrary/save'),
      expect.objectContaining({
        body: JSON.stringify({
          name: 'G.654.E 光纤',
          typeCd: 'FIB',
          iconSize: { width: 48, height: 48 },
          bindFuncList: [{
            name: 'LOCAL_DEVICE_LIBRARY_PARAMS',
            defaultInputParams: { localType: 'fiber', attenuationCoeff: 0.16 },
          }],
        }),
      }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('/plan/deviceLibrary/search'),
      expect.objectContaining({
        body: JSON.stringify({ pageNumber: 1, pageSize: 10, typeCd: 'FIB' }),
      }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('/plan/deviceLibrary/detail'),
      expect.objectContaining({ body: JSON.stringify({ id: 101 }) }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      expect.stringContaining('/plan/deviceLibrary/remove'),
      expect.objectContaining({ body: JSON.stringify({ id: 101 }) }),
    )
  })

  it('manages the top device library panel through Swagger 2.5 device library APIs', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          flag: 1,
          code: '200',
          msg: '成功',
          page: { pageNumber: 1, pageSize: 1000, dataTotal: 1 },
          data: [{ id: 101, name: '平台器件库', typeCd: 'FIB', dialogWindowId: 'fiber', bindFuncList: [] }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ flag: 1, code: '200', msg: '成功', data: 102 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ flag: 1, code: '200', msg: '成功', data: true }),
      })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const settingsStore = useSettingsStore()
    await settingsStore.loadPlatformDeviceLibraries()
    const savedId = await settingsStore.savePlatformDeviceLibrary({
      name: '新增器件库',
      typeCd: 'AMP',
      dialogWindowId: 'amplifier',
    })
    await settingsStore.removePlatformDeviceLibrary(101)

    expect(savedId).toBe(102)
    expect(settingsStore.platformDeviceLibraries).toEqual([
      expect.objectContaining({ id: 102, name: '新增器件库', typeCd: 'AMP' }),
    ])
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('/plan/deviceLibrary/search'),
      expect.objectContaining({ body: JSON.stringify({ pageNumber: 1, pageSize: 1000 }) }),
    )
    const saveBody = JSON.parse(String(fetchMock.mock.calls[1][1]?.body))
    expect(fetchMock.mock.calls[1][0]).toEqual(expect.stringContaining('/plan/deviceLibrary/save'))
    expect(saveBody).toEqual({
      name: '新增器件库',
      typeCd: 'AMP',
      iconSize: { width: 48, height: 48 },
      dialogWindowId: 'amplifier',
      bindFuncList: [],
    })
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('/plan/deviceLibrary/remove'),
      expect.objectContaining({ body: JSON.stringify({ id: 101 }) }),
    )
  })

  it('renders Swagger 2.5 device libraries as tabs with a trailing plus action in settings', () => {
    const settingsSource = readFileSync(fileURLToPath(new URL('../views/SettingsView.vue', import.meta.url)), 'utf8')
    const platformEntityStart = settingsSource.indexOf('openCreatePlatformEntity')
    const libraryCardStart = settingsSource.indexOf('settingsStore.platformDeviceLibraries', platformEntityStart)
    const libraryCardSource = settingsSource.slice(libraryCardStart)

    expect(settingsSource).toContain('platformLibraryTab')
    expect(libraryCardSource).toContain('settingsStore.platformDeviceLibraries')
    expect(libraryCardSource).toContain('title="新增器件库"')
    expect(libraryCardSource).toContain('@click="openCreatePlatformLibrary"')
    expect(libraryCardSource).not.toContain("@click=\"deviceTypeTab = 'fiber'\"")
    expect(libraryCardSource).not.toContain('showAddFiberDialog = true')
  })

  it('places Swagger 2.6 device entity instances under the selected device library tab', () => {
    const settingsSource = readFileSync(fileURLToPath(new URL('../views/SettingsView.vue', import.meta.url)), 'utf8')
    const libraryTabsStart = settingsSource.indexOf('v-for="(library, index) in settingsStore.platformDeviceLibraries"')
    const libraryPanelSource = settingsSource.slice(libraryTabsStart)

    expect(libraryPanelSource).toContain('filteredPlatformDeviceEntities')
    expect(libraryPanelSource).toContain('openCreatePlatformEntity(selectedPlatformLibrary)')
    expect(settingsSource).toContain('sameId(entity.libraryId, selectedPlatformLibrary.value?.id)')
    expect(libraryPanelSource).toContain('settingsStore.deviceEntityLoading')
    expect(libraryPanelSource).not.toContain("selectedLocalTemplateTab === 'fiber'")
    expect(libraryPanelSource).not.toContain('showAddFiberDialog = true')
  })

  it('reloads Swagger 2.6 device entities when switching top device library tabs', () => {
    const settingsSource = readFileSync(fileURLToPath(new URL('../views/SettingsView.vue', import.meta.url)), 'utf8')
    const libraryTabsStart = settingsSource.indexOf('v-for="(library, index) in settingsStore.platformDeviceLibraries"')
    const libraryPanelSource = settingsSource.slice(libraryTabsStart)

    expect(settingsSource).toContain('const selectPlatformLibrary = (library: PlanDeviceLibrary)')
    expect(settingsSource).toContain('settingsStore.loadPlatformDeviceEntities({ libraryId })')
    expect(libraryPanelSource).toContain('@click="selectPlatformLibrary(library)"')
    expect(libraryPanelSource).toContain('@click="loadPlatformEntities()"')
    expect(libraryPanelSource).not.toContain('@click="platformLibraryTab = library.id ?? null"')
  })

  it('keeps local parameter template edits from calling Swagger 2.5 device library APIs', async () => {
    const fetchMock = vi.fn()
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const settingsStore = useSettingsStore()
    await settingsStore.addFiberType({
      id: 'fiber-local-1',
      name: 'G.654.E',
      attenuationCoeff: 0.16,
      dispersion: 21,
      dispersionSlope: 0,
      effectiveArea: 110,
      nonlinearRefractiveIndex: 2.6,
      nonlinearCoeff: 1.4,
      secondOrderDispersion: -21,
      simulationModel: 'GN',
    })

    expect(fetchMock).not.toHaveBeenCalled()
    expect(settingsStore.fiberTypes).toHaveLength(1)
  })

  it('maps local device library items through bindFuncList without losing typed parameters', () => {
    const platformPayload = deviceLibraryItemToPlatform('fiber', {
      id: 'fiber-local-1',
      name: 'G.654.E 光纤',
      fiberCategory: 'G.654.E',
      attenuationCoeff: 0.16,
      dispersion: 21,
      dispersionSlope: 60,
      effectiveArea: 110,
      nonlinearRefractiveIndex: 2.6,
      nonlinearCoeff: 1.4,
      secondOrderDispersion: -21,
      simulationModel: 'GN',
    })

    expect(platformPayload).toEqual(expect.objectContaining({
      name: 'G.654.E 光纤',
      typeCd: 'FIB',
      iconSize: { width: 48, height: 48 },
      bindFuncList: [{
        name: 'LOCAL_DEVICE_LIBRARY_PARAMS',
        defaultInputParams: expect.objectContaining({
          localId: 'fiber-local-1',
          localType: 'fiber',
          attenuationCoeff: 0.16,
          dispersion: 21,
        }),
      }],
    }))

    const restored = platformDeviceLibraryToLocal({
      id: 101,
      name: 'G.654.E 光纤',
      typeCd: 'FIB',
      typeName: '光纤',
      iconSize: { width: 48, height: 48 },
      bindFuncList: platformPayload.bindFuncList,
    })

    expect(restored).toEqual({
      type: 'fiber',
      item: expect.objectContaining({
        id: 'platform-device-library-101',
        platformId: 101,
        name: 'G.654.E 光纤',
        attenuationCoeff: 0.16,
        dispersion: 21,
      }),
    })
  })

  it('reports device library platform sync failures as local-only warnings', () => {
    expect(deviceLibrarySyncNotice('saved', null)).toEqual({
      type: 'success',
      message: 'saved',
    })

    expect(deviceLibrarySyncNotice('saved', 'network down')).toEqual({
      type: 'warning',
      message: 'saved，平台同步失败：network down',
    })

    expect(deviceLibrarySyncNotice('imported', 'unauthorized', 'imported locally')).toEqual({
      type: 'warning',
      message: 'imported locally，平台同步失败：unauthorized',
    })
  })

  it('calls Swagger device entity endpoints with project coordinates and library references', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ flag: 1, code: '200', msg: '成功', data: 501 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          flag: 1,
          code: '200',
          msg: '成功',
          page: { pageNumber: 1, pageSize: 10, dataTotal: 1 },
          data: [{
            id: 501,
            name: 'OLA-1',
            typeCd: 'AMP',
            libraryId: 101,
            longitude: 121.5,
            latitude: 31.2,
            projectId: 88,
            sortNum: 1,
          }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          flag: 1,
          code: '200',
          msg: '成功',
          data: {
            id: 501,
            name: 'OLA-1',
            typeCd: 'AMP',
            libraryId: 101,
            longitude: 121.5,
            latitude: 31.2,
            projectId: 88,
            sortNum: 1,
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ flag: 1, code: '200', msg: '成功', data: true }),
      })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const entityId = await platformDeviceEntityApi.save({
      name: 'OLA-1',
      typeCd: 'AMP',
      libraryId: 101,
      longitude: 121.5,
      latitude: 31.2,
      projectId: 88,
      sortNum: 1,
      iconSize: { width: 48, height: 48 },
      bindFuncList: [{
        name: 'LOCAL_DEVICE_ENTITY_PARAMS',
        defaultInputParams: { connectorId: 'elem-1', kp: 12.4 },
      }],
    })
    const list = await platformDeviceEntityApi.search({ pageNumber: 1, pageSize: 10, projectId: 88 })
    const detail = await platformDeviceEntityApi.detail(501)
    const removed = await platformDeviceEntityApi.remove(501)

    expect(entityId).toBe(501)
    expect(list.data[0].projectId).toBe(88)
    expect(detail.id).toBe(501)
    expect(removed).toBe(true)
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('/plan/deviceEntity/save'),
      expect.objectContaining({
        body: JSON.stringify({
          name: 'OLA-1',
          typeCd: 'AMP',
          libraryId: 101,
          longitude: 121.5,
          latitude: 31.2,
          projectId: 88,
          sortNum: 1,
          iconSize: { width: 48, height: 48 },
          bindFuncList: [{
            name: 'LOCAL_DEVICE_ENTITY_PARAMS',
            defaultInputParams: { connectorId: 'elem-1', kp: 12.4 },
          }],
        }),
      }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('/plan/deviceEntity/search'),
      expect.objectContaining({
        body: JSON.stringify({ pageNumber: 1, pageSize: 10, projectId: 88 }),
      }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('/plan/deviceEntity/detail'),
      expect.objectContaining({ body: JSON.stringify({ id: 501 }) }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      expect.stringContaining('/plan/deviceEntity/remove'),
      expect.objectContaining({ body: JSON.stringify({ id: 501 }) }),
    )
  })

  it('loads Swagger device entities by selected device library id through the settings store', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        flag: 1,
        code: '200',
        msg: '成功',
        page: { pageNumber: 1, pageSize: 1000, dataTotal: 1 },
        data: [{ id: 'entity-1', name: 'OLA-1', libraryId: 'library-101', typeCd: 'AMP' }],
      }),
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const settingsStore = useSettingsStore()
    await settingsStore.loadPlatformDeviceEntities({ libraryId: 'library-101' })

    expect(settingsStore.platformDeviceEntities).toEqual([
      expect.objectContaining({ id: 'entity-1', libraryId: 'library-101' }),
    ])
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/plan/deviceEntity/search'),
      expect.objectContaining({
        body: JSON.stringify({ pageNumber: 1, pageSize: 1000, libraryId: 'library-101' }),
      }),
    )
  })

  it('accepts the Swagger upload complete endpoint even when it returns a plain object', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ attachmentId: 123, filename: 'bathy.tif' }),
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const result = await platformUploadApi.complete({
      uploadUrl: 'http://47.92.110.176:9108/sys/upload/files/bathy',
      bizId: 99,
      typeDic: 'LAYER',
    })

    expect(result).toEqual({ attachmentId: 123, filename: 'bathy.tif' })
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/sys/upload/complete'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          uploadUrl: 'http://47.92.110.176:9108/sys/upload/files/bathy',
          bizId: 99,
          typeDic: 'LAYER',
        }),
      }),
    )
  })

  it('maps connector elements to Swagger device entity payloads', () => {
    const entity = connectorElementToDeviceEntity({
      id: 'elem-1',
      name: 'OLA-1',
      type: 'ola',
      kp: 12.4,
      longitude: 121.5,
      latitude: 31.2,
      depth: 2000,
      status: 'planned',
      specifications: 'EDFA-C',
      remarks: 'system design node',
      componentRefId: '101',
    }, 88, 1)

    expect(entity).toEqual(expect.objectContaining({
      name: 'OLA-1',
      typeCd: 'AMP',
      libraryId: 101,
      longitude: 121.5,
      latitude: 31.2,
      projectId: 88,
      sortNum: 1,
      bindFuncList: [{
        name: 'LOCAL_DEVICE_ENTITY_PARAMS',
        defaultInputParams: expect.objectContaining({
          connectorId: 'elem-1',
          connectorType: 'ola',
          kp: 12.4,
          componentRefId: '101',
        }),
      }],
    }))
  })

  it('calls the Swagger register approval endpoint for approval actions', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ flag: 1, code: '200', msg: '成功', data: 1 }),
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    await platformUserApi.registerApproval({
      userId: 9,
      approvalCd: 'approved',
      approvalDesc: '',
      roleIds: [],
      sortNum: 999,
    })

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/sys/registerApproval'),
      expect.objectContaining({
        body: JSON.stringify({
          userId: 9,
          approvalCd: 'approved',
          approvalDesc: '',
          roleIds: [],
          sortNum: 999,
        }),
      }),
    )
  })

  it('calls the Swagger change password endpoint with encrypted passwords', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ flag: 1, code: '200', msg: '成功', data: true }),
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    await platformAuthApi.changePassword({
      oldPassword: 'old-password',
      newPassword: 'new-password',
    })

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/sys/user/changePassword'),
      expect.objectContaining({
        body: expect.any(String),
      }),
    )
    const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string)
    expect(body.oldPassword).not.toBe('old-password')
    expect(body.newPassword).not.toBe('new-password')
    expect(body.oldPassword).toMatch(/^[0-9a-f]+$/i)
    expect(body.newPassword).toMatch(/^[0-9a-f]+$/i)
  })

  it('syncs project metadata, stations, and device instances through Swagger project APIs', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ flag: 1, code: '200', msg: '成功', data: 88 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ flag: 1, code: '200', msg: '成功', data: true }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ flag: 1, code: '200', msg: '成功', data: true }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ flag: 1, code: '200', msg: '成功', data: true }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ flag: 1, code: '200', msg: '成功', data: true }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ flag: 1, code: '200', msg: '成功', data: 501 }),
      })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const result = await syncPlanningProjectToPlatform({
      name: '海缆项目A',
      remarks: '自动同步',
      isPublic: 1,
      points: [
        { name: '登陆站A', longitude: 121.1, latitude: 31.2 },
        { name: '登陆站B', longitude: 122.1, latitude: 32.2 },
      ],
      planConfig: {
        scope: {
          topLeftLng: 120.5,
          topLeftLat: 33.1,
          bottomRightLng: 123.6,
          bottomRightLat: 29.4,
        },
        gridResolution: 500,
        enableRedundancy: true,
      },
      deviceEntities: [{
        name: 'OLA-1',
        typeCd: 'AMP',
        libraryId: 101,
        longitude: 121.5,
        latitude: 31.2,
        sortNum: 1,
        bindFuncList: [{
          name: 'LOCAL_DEVICE_ENTITY_PARAMS',
          defaultInputParams: { connectorId: 'elem-1', kp: 12.4 },
        }],
      }],
    })

    expect(result.projectId).toBe(88)
    expect(result.deviceEntitiesSynced).toBe(1)
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('/plan/project/save'),
      expect.objectContaining({
        body: JSON.stringify({ name: '海缆项目A', remarks: '自动同步', isPublic: 1 }),
      }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
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
      3,
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
      4,
      expect.stringContaining('/plan/planConfig/saveGridResolution'),
      expect.objectContaining({
        body: JSON.stringify({ projectId: 88, gridResolution: 500 }),
      }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      5,
      expect.stringContaining('/plan/planConfig/saveEnableRedundancy'),
      expect.objectContaining({
        body: JSON.stringify({ projectId: 88, enableRedundancy: true }),
      }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      6,
      expect.stringContaining('/plan/deviceEntity/save'),
      expect.objectContaining({
        body: JSON.stringify({
          name: 'OLA-1',
          typeCd: 'AMP',
          libraryId: 101,
          longitude: 121.5,
          latitude: 31.2,
          sortNum: 1,
          bindFuncList: [{
            name: 'LOCAL_DEVICE_ENTITY_PARAMS',
            defaultInputParams: { connectorId: 'elem-1', kp: 12.4 },
          }],
          projectId: 88,
        }),
      }),
    )
  })

  it('fetches current user detail from cookie-backed session on page refresh', async () => {
    localStorage.setItem(PLATFORM_USER_KEY, JSON.stringify({
      id: '1000000000000000000',
      username: 'admin',
      role: 'user',
      status: 'approved',
    }))
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        flag: 1,
        code: '200',
        msg: '成功',
        data: {
          id: '1000000000000000000',
          username: 'admin',
          realName: '管理员',
          tele: '13800000007',
          approvalCd: 'approved',
          isValidCd: '1',
          roles: [{ roleId: '2584314578714230785', code: 'test', name: '系统测试员' }],
        },
      }),
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const userStore = useUserStore()
    const result = await userStore.bootstrapSession()

    expect(result).toBe(true)
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/sys/user/detail'),
      expect.objectContaining({
        body: JSON.stringify({ id: '1000000000000000000' }),
      }),
    )
    const headers = fetchMock.mock.calls[0][1]?.headers as Record<string, string>
    expect(headers.Authorization).toBeUndefined()
    expect(userStore.currentUser?.username).toBe('admin')
    expect(userStore.currentUser?.realName).toBe('管理员')
    expect(userStore.currentUser?.role).toBe('admin')
    expect(userStore.currentUser?.roles).toEqual({ test: '系统测试员' })
    expect(userStore.isAdmin).toBe(true)
  })

  it('redirects to login state on page refresh when no cached user id exists', async () => {
    const fetchMock = vi.fn()
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const userStore = useUserStore()
    const result = await userStore.bootstrapSession()

    expect(result).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(userStore.currentUser).toBeNull()
  })

  it('loads approved and pending users from Swagger list APIs without per-user detail calls', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          flag: 1,
          code: '200',
          msg: '成功',
          data: [{ id: 1, username: 'approved-user', tele: '13800000000', approvalCd: 'approved', isValidCd: '1' }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          flag: 1,
          code: '200',
          msg: '成功',
          data: [{ id: 2, username: 'pending-user', tele: '13900000000', approvalCd: 'pending' }],
        }),
      })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const userStore = useUserStore()
    await userStore.loadUsers()

    expect(fetchMock).toHaveBeenNthCalledWith(1, expect.stringContaining('/sys/user/search'), expect.any(Object))
    expect(fetchMock).toHaveBeenNthCalledWith(2, expect.stringContaining('/sys/user/searchRegister'), expect.any(Object))
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(userStore.users.map(user => user.username)).toEqual(['approved-user', 'pending-user'])
    expect(userStore.pendingUsers.map(user => user.username)).toEqual(['pending-user'])
  })

  it('approves users through the Swagger register approval API', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ flag: 1, code: '200', msg: '成功', data: 1 }),
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const userStore = useUserStore()
    userStore.users = [{ id: '2', username: 'pending-user', status: 'pending', role: 'user' }]

    await userStore.approveUser('2')

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/sys/registerApproval'),
      expect.objectContaining({
        body: JSON.stringify({
          userId: '2',
          approvalCd: 'approved',
          approvalDesc: '',
          roleIds: [],
          sortNum: 999,
        }),
      }),
    )
    expect(userStore.users[0].status).toBe('approved')
  })

  it('updates the current user profile through the Swagger modify endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ flag: 1, code: '200', msg: '成功', data: 1 }),
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const userStore = useUserStore()
    userStore.currentUser = {
      id: '1000000000000000000',
      username: 'admin',
      role: 'admin',
      status: 'approved',
    }

    const result = await userStore.updateCurrentProfile({
      realName: '管理员',
      phone: '13661361799',
      remarks: '主账号',
    })

    expect(result.success).toBe(true)
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/sys/user/modify'),
      expect.objectContaining({
        body: JSON.stringify({
          id: '1000000000000000000',
          realName: '管理员',
          tele: '13661361799',
          remarks: '主账号',
          sortNum: 999,
        }),
      }),
    )
    expect(userStore.currentUser?.realName).toBe('管理员')
    expect(userStore.currentUser?.phone).toBe('13661361799')
    expect(userStore.currentUser?.remarks).toBe('主账号')
  })

  it('changes the current user password through the Swagger password endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ flag: 1, code: '200', msg: '成功', data: true }),
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const userStore = useUserStore()
    const result = await userStore.changeCurrentPassword('old-password', 'new-password')

    expect(result.success).toBe(true)
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/sys/user/changePassword'),
      expect.objectContaining({ body: expect.any(String) }),
    )
  })

  it('loads roles and assigns roles through Swagger role APIs', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          flag: 1,
          code: '200',
          msg: '成功',
          data: [{ id: '2584314578714230785', code: 'test', name: '系统测试员', isValidCd: '1' }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ flag: 1, code: '200', msg: '成功', data: true }),
      })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const userStore = useUserStore()
    const rolesResult = await userStore.loadRoles()
    const assignResult = await userStore.assignUserRoles('1000000000000000000', ['2584314578714230785'])

    expect(rolesResult.success).toBe(true)
    expect(assignResult.success).toBe(true)
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('/sys/role/search'),
      expect.objectContaining({
        body: JSON.stringify({ pageNumber: 1, pageSize: 100, isValidCd: '1' }),
      }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('/sys/user/saveRoles'),
      expect.objectContaining({
        body: JSON.stringify({
          userId: '1000000000000000000',
          roleIds: ['2584314578714230785'],
        }),
      }),
    )
    expect(userStore.roles).toEqual([
      expect.objectContaining({ id: '2584314578714230785', code: 'test', name: '系统测试员', isValidCd: '1' }),
    ])
  })

  it('fetches a user detail once when opening role assignment', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        flag: 1,
        code: '200',
        msg: '成功',
        data: {
          id: '1000000000000000000',
          username: 'admin',
          roles: [{ roleId: '2584314578714230785', code: 'test', name: '系统测试员' }],
        },
      }),
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const userStore = useUserStore()
    userStore.users = [{ id: '1000000000000000000', username: 'admin', status: 'approved', role: 'admin' }]

    const result = await userStore.getUserRoleIds('1000000000000000000')

    expect(result).toEqual({ success: true, message: '用户角色加载成功', roleIds: ['2584314578714230785'] })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/sys/user/detail'),
      expect.objectContaining({
        body: JSON.stringify({ id: '1000000000000000000' }),
      }),
    )
    expect(userStore.users[0].roleIds).toEqual(['2584314578714230785'])
  })

  it('resets user passwords through the Swagger reset password API', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ flag: 1, code: '200', msg: '成功', data: true }),
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const userStore = useUserStore()
    const result = await userStore.resetUserPassword('1000000000000000000')

    expect(result.success).toBe(true)
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/sys/user/resetPassword'),
      expect.objectContaining({
        body: JSON.stringify({ userId: '1000000000000000000' }),
      }),
    )
  })

  it('manages roles and role menu permissions through Swagger role APIs', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          flag: 1,
          code: '200',
          msg: '成功',
          data: [{
            id: '2584314578714230785',
            code: 'test',
            name: '系统测试员',
            description: '全权限测试角色',
            isValidCd: '1',
            sortNum: 1,
            isSys: 1,
            userCount: 1,
          }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          flag: 1,
          code: '200',
          msg: '成功',
          data: {
            id: '2584314578714230785',
            code: 'test',
            name: '系统测试员',
            menus: [
              { id: '1', code: 'CREST', name: '海缆智能规划系统' },
              { id: '2', code: 'user', name: '用户管理' },
            ],
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          flag: 1,
          code: '200',
          msg: '成功',
          data: [
            {
              id: '1',
              code: 'CREST',
              name: '海缆智能规划系统',
              children: [{ id: '2', code: 'user', name: '用户管理' }],
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ flag: 1, code: '200', msg: '成功', data: '2584314578714230785' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ flag: 1, code: '200', msg: '成功', data: true }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ flag: 1, code: '200', msg: '成功', data: true }),
      })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const userStore = useUserStore()
    const rolesResult = await userStore.loadRoles({ includeDisabled: true })
    const detailResult = await userStore.loadRoleDetail('2584314578714230785')
    const treeResult = await userStore.loadMenuTree('2584314578714230785')
    const saveResult = await userStore.saveRole({
      id: '2584314578714230785',
      code: 'test',
      name: '系统测试员',
      description: '全权限测试角色',
      isValidCd: '1',
      sortNum: 1,
      isSys: 1,
    })
    const saveMenusResult = await userStore.saveRoleMenus('2584314578714230785', ['1', '2'])
    const deleteResult = await userStore.deleteRole('2584314578714230785')

    expect(rolesResult.success).toBe(true)
    expect(detailResult).toEqual({
      success: true,
      message: '角色详情加载成功',
      role: expect.objectContaining({ id: '2584314578714230785', code: 'test', selectedMenuIds: ['1', '2'] }),
    })
    expect(treeResult.success).toBe(true)
    expect(saveResult.success).toBe(true)
    expect(saveMenusResult.success).toBe(true)
    expect(deleteResult.success).toBe(true)
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('/sys/role/search'),
      expect.objectContaining({ body: JSON.stringify({ pageNumber: 1, pageSize: 100 }) }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('/sys/role/detail'),
      expect.objectContaining({ body: JSON.stringify({ id: '2584314578714230785' }) }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('/sys/menu/tree'),
      expect.objectContaining({ body: JSON.stringify({}) }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      expect.stringContaining('/sys/role/save'),
      expect.objectContaining({
        body: JSON.stringify({
          id: '2584314578714230785',
          code: 'test',
          name: '系统测试员',
          description: '全权限测试角色',
          isValidCd: '1',
          sortNum: 1,
          isSys: 1,
        }),
      }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      5,
      expect.stringContaining('/sys/role/saveMenus'),
      expect.objectContaining({
        body: JSON.stringify({ roleId: '2584314578714230785', menuIds: ['1', '2'] }),
      }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      6,
      expect.stringContaining('/sys/role/remove'),
      expect.objectContaining({ body: JSON.stringify({ id: '2584314578714230785' }) }),
    )
    expect(userStore.menuTree).toEqual([
      expect.objectContaining({
        id: '1',
        code: 'CREST',
        children: [expect.objectContaining({ id: '2', code: 'user' })],
      }),
    ])
  })

  it('does not treat an unmarked full menu tree as selected role permissions', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          flag: 1,
          code: '200',
          msg: '成功',
          data: {
            id: '2584314578714230785',
            code: 'planner',
            name: '规划员',
            menus: [{
              id: '1',
              code: 'CREST',
              name: '海缆智能规划系统',
              children: [
                { id: '2', code: 'plan', name: '网络规划' },
                { id: '3', code: 'monitor', name: '监控' },
              ],
            }],
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          flag: 1,
          code: '200',
          msg: '成功',
          data: {
            id: '2584314578714230785',
            code: 'planner',
            name: '规划员',
            menus: [
              { id: '1', code: 'CREST', name: '海缆智能规划系统', checked: true },
              { id: '2', code: 'plan', name: '网络规划', checked: '1' },
              { id: '3', code: 'monitor', name: '监控', checked: false },
            ],
          },
        }),
      })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const userStore = useUserStore()
    const unmarkedResult = await userStore.loadRoleDetail('2584314578714230785')
    const markedResult = await userStore.loadRoleDetail('2584314578714230785')

    expect(unmarkedResult.role?.selectedMenuIds).toEqual([])
    expect(markedResult.role?.selectedMenuIds).toEqual(['1', '2'])
  })
})

describe('local fake backend removal', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('exposes permission management for admin users through Swagger role APIs', () => {
    const headerSource = readFileSync(fileURLToPath(new URL('../components/layout/AppHeader.vue', import.meta.url)), 'utf8')
    const rolesPageSource = readFileSync(fileURLToPath(new URL('../modules/admin/views/AdminRolesView.vue', import.meta.url)), 'utf8')
    const appSource = readFileSync(fileURLToPath(new URL('../App.vue', import.meta.url)), 'utf8')
    const routerSource = readFileSync(fileURLToPath(new URL('../router/index.ts', import.meta.url)), 'utf8')

    expect(headerSource).toContain('to="/admin"')
    expect(headerSource).not.toContain('to="/admin/roles"')
    expect(routerSource).toContain("path: '/admin/roles'")
    expect(appSource).not.toContain('PermissionManageDialog')
    expect(rolesPageSource).toContain('权限管理')
    expect(rolesPageSource).toContain('userStore.saveRole(')
    expect(rolesPageSource).toContain('userStore.deleteRole(')
    expect(rolesPageSource).toContain('userStore.saveRoleMenus(')
    expect(rolesPageSource).toContain('userStore.loadMenuTree(')
  })

  it('keeps approved admin users visible in account management', () => {
    const dialogSource = readFileSync(fileURLToPath(new URL('../components/dialogs/UserManageDialog.vue', import.meta.url)), 'utf8')

    expect(dialogSource).toContain("userStore.users.filter(u => u.status === 'approved')")
    expect(dialogSource).not.toContain("role !== 'admin'")
    expect(dialogSource).not.toContain('role !== "admin"')
  })

  it('routes platform project continuation through user-facing project open flows', () => {
    const planningSource = readFileSync(fileURLToPath(new URL('../views/PlanningView.vue', import.meta.url)), 'utf8')
    const settingsSource = readFileSync(fileURLToPath(new URL('../views/SettingsView.vue', import.meta.url)), 'utf8')
    const projectDialogSource = readFileSync(fileURLToPath(new URL('../components/dialogs/ProjectDialog.vue', import.meta.url)), 'utf8')
    const appSource = readFileSync(fileURLToPath(new URL('../App.vue', import.meta.url)), 'utf8')

    expect(planningSource).toContain("appStore.openDialog('open-project')")
    expect(settingsSource).toContain("appStore.openDialog('open-project')")
    expect(planningSource).not.toContain('projectManager.openProject()')
    expect(settingsSource).not.toContain('projectManager.openProject()')
    expect(projectDialogSource).toContain("'continue-platform'")
    expect(projectDialogSource).toContain('openOrContinuePlatformProject')
    expect(projectDialogSource).not.toContain('不会重复新建')
    expect(appSource).toContain('handleContinuePlatformProject')
    expect(appSource).toContain(':resume-project=')
  })

  it('restores uploaded wizard layers from platform layer attachments', () => {
    const wizardSource = readFileSync(fileURLToPath(new URL('../components/dialogs/ProjectWizardDialog.vue', import.meta.url)), 'utf8')

    expect(wizardSource).toContain('platformPlanLayerApi.search')
    expect(wizardSource).toContain('restoreUploadedLayers')
    expect(wizardSource).toContain('attachmentName')
    expect(wizardSource).toContain("layer.uploadStatus === 'uploaded' && !layer.file && layer.value")
    expect(wizardSource).toContain("layer.checked && !layer.file && layer.uploadStatus !== 'uploaded'")
  })

  it('places platform layer management inside system management without a global dialog', () => {
    const layerControlSource = readFileSync(fileURLToPath(new URL('../modules/planning/panels/LayerControl.vue', import.meta.url)), 'utf8')
    const planningSource = readFileSync(fileURLToPath(new URL('../views/PlanningView.vue', import.meta.url)), 'utf8')
    const layerViewSource = readFileSync(fileURLToPath(new URL('../modules/admin/views/AdminLayersView.vue', import.meta.url)), 'utf8')
    const appSource = readFileSync(fileURLToPath(new URL('../App.vue', import.meta.url)), 'utf8')
    const routerSource = readFileSync(fileURLToPath(new URL('../router/index.ts', import.meta.url)), 'utf8')
    const headerSource = readFileSync(fileURLToPath(new URL('../components/layout/AppHeader.vue', import.meta.url)), 'utf8')

    expect(routerSource).toContain("path: '/admin/layers'")
    expect(headerSource).toContain('to="/admin"')
    expect(headerSource).not.toContain('to="/admin/layers"')
    expect(headerSource).not.toContain("showModal('platform-layer-library')")
    expect(layerControlSource).not.toContain("'open-platform-layers'")
    expect(layerControlSource).not.toContain('title="平台图层库"')
    expect(planningSource).not.toContain('open-platform-layers')
    expect(appSource).not.toContain('PlatformLayerLibraryDialog')
    expect(layerViewSource).toContain('platformPlanLayerApi.search')
    expect(layerViewSource).toContain('platformPlanLayerApi.detail')
    expect(layerViewSource).toContain('platformPlanLayerApi.save')
    expect(layerViewSource).toContain('platformPlanLayerApi.remove')
    expect(layerViewSource).toContain("BATHY: 'elevation'")
    expect(layerViewSource).toContain("FISHZONE: 'fishing'")
  })

  it('can add platform-only layers to the planning layer list', () => {
    const layerStore = useLayerStore()

    layerStore.upsertLayer({
      id: 'platform-layer-99',
      name: '平台冷水珊瑚图层',
      type: 'vector',
      visible: true,
      loaded: true,
      loading: false,
    })

    expect(layerStore.getLayerById('platform-layer-99')).toEqual(expect.objectContaining({
      name: '平台冷水珊瑚图层',
      visible: true,
      loaded: true,
    }))
  })

  it('does not load account data from frontend mock data', () => {
    const userStoreSource = readFileSync(fileURLToPath(new URL('../stores/user.ts', import.meta.url)), 'utf8')

    expect(userStoreSource).not.toContain("@/data/mockData")
    expect(userStoreSource).not.toContain('mockUsers')
    expect(userStoreSource).not.toContain('defaultAdminUser')
  })

  it('does not call local-only backend endpoints from frontend source', () => {
    const sourceRoots = [
      'components',
      'composables',
      'config',
      'modules',
      'services',
      'stores',
      'views',
    ].map(dir => fileURLToPath(new URL(`../${dir}`, import.meta.url)))
    const forbidden = [
      { label: 'local route/dem/simulation/gis path', pattern: /['"`]\/api\/(?:route|dem|simulation|gis)\b/ },
      { label: 'local Node backend host', pattern: /\blocalhost:3001\b/ },
      { label: 'old local API env var', pattern: /\bVITE_API_BASE_URL\b/ },
      { label: 'old local API endpoint map', pattern: /\bAPI_ENDPOINTS\b/ },
      { label: 'old local API base URL', pattern: /(?<!PLATFORM_)\bAPI_BASE_URL\b/ },
    ]

    const offenders = sourceRoots
      .flatMap(collectSourceFiles)
      .flatMap(file => {
        const source = readFileSync(file, 'utf8')
        return forbidden
          .filter(({ pattern }) => pattern.test(source))
          .map(({ label }) => `${file}: ${label}`)
      })

    expect(offenders).toEqual([])
  })
})
