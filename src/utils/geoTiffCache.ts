import GeoTIFF from 'ol/source/GeoTIFF'

export interface CachedGeoTiffEntry {
  source: GeoTIFF
  loaded: boolean
  failed: boolean
}

export const DEFAULT_GEO_TIFF_URL = '/output2_cog.tif'

const geoTiffCache = new Map<string, CachedGeoTiffEntry>()
const geoTiffWarmups = new Map<string, Promise<void>>()

export const getCachedGeoTiffSource = (url: string): CachedGeoTiffEntry => {
  const cached = geoTiffCache.get(url)
  if (cached) {
    return cached
  }

  const entry: CachedGeoTiffEntry = {
    source: new GeoTIFF({
      sources: [{ url }],
      normalize: true,
      wrapX: true,
    }),
    loaded: false,
    failed: false,
  }

  entry.source.on('tileloadend', () => {
    entry.loaded = true
    entry.failed = false
  })

  entry.source.on('tileloaderror', () => {
    if (!entry.loaded) {
      entry.failed = true
    }
  })

  geoTiffCache.set(url, entry)
  return entry
}

export const warmupGeoTiff = async (url: string = DEFAULT_GEO_TIFF_URL): Promise<void> => {
  const existingWarmup = geoTiffWarmups.get(url)
  if (existingWarmup) {
    return existingWarmup
  }

  const entry = getCachedGeoTiffSource(url)
  const warmup = entry.source.getView()
    .then(() => {
      entry.failed = false
    })
    .catch(() => {
      entry.failed = true
    })

  geoTiffWarmups.set(url, warmup)
  return warmup
}

export const scheduleGeoTiffWarmup = (url: string = DEFAULT_GEO_TIFF_URL) => {
  const runWarmup = () => {
    void warmupGeoTiff(url)
  }

  const idleCallback = (window as Window & {
    requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number
  }).requestIdleCallback

  if (idleCallback) {
    idleCallback(runWarmup, { timeout: 1500 })
  } else {
    window.setTimeout(runWarmup, 600)
  }
}
