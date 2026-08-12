/**
 * DEM API client.
 * The terrain and depth profile panels use the online DEM service directly.
 */

export interface DemClipResult {
  width: number
  height: number
  bbox: [number, number, number, number]
  minElev: number
  maxElev: number
  elevation: number[]
}

interface DemProfilePoint {
  distance: number
  depth: number
}

export interface DemProfileResult {
  points: DemProfilePoint[]
  totalDistance?: number
}

export type DemProfileRequest =
  | {
      mode: 'extent'
      extent: [number, number, number, number]
      sampleCount?: number
    }
  | {
      mode: 'segment'
      segment: {
        startPoint: { lon: number; lat: number }
        endPoint: { lon: number; lat: number }
        points?: Array<{ lon: number; lat: number }>
      }
      sampleCount?: number
    }

const DEFAULT_DEM_API_BASE = 'http://47.92.110.176:9104'
const env = import.meta.env ?? {}

const DEM_API_BASE = (
  env.VITE_DEM_API_URL ||
  env.VITE_API_BASE_URL ||
  DEFAULT_DEM_API_BASE
).replace(/\/+$/, '')

async function readApiData<T>(response: Response, fallbackMessage: string): Promise<T> {
  const result = await response.json()

  if (!response.ok || !result?.success) {
    throw new Error(result?.error || fallbackMessage)
  }

  return result.data as T
}

/**
 * Clip elevation data for a lon/lat bbox: [minX, minY, maxX, maxY].
 */
export async function fetchDemClip(
  bbox: [number, number, number, number],
  width = 128,
  height = 128,
): Promise<DemClipResult> {
  const [minX, minY, maxX, maxY] = bbox
  const params = new URLSearchParams({
    minX: String(minX),
    minY: String(minY),
    maxX: String(maxX),
    maxY: String(maxY),
    width: String(width),
    height: String(height),
  })

  const response = await fetch(`${DEM_API_BASE}/api/dem/clip?${params.toString()}`)
  return readApiData<DemClipResult>(response, '裁剪DEM数据失败')
}

/**
 * Fetch a depth profile for a selected extent or route segment.
 */
export async function fetchDemProfile(payload: DemProfileRequest): Promise<DemProfileResult> {
  const response = await fetch(`${DEM_API_BASE}/api/dem/profile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  return readApiData<DemProfileResult>(response, '加载剖面数据失败')
}

/**
 * Check if the DEM service is available.
 */
export async function checkDemService(timeoutMs = 3000): Promise<boolean> {
  try {
    const response = await fetch(`${DEM_API_BASE}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(timeoutMs),
    })
    const result = await response.json()
    return response.ok && result.status === 'ok'
  } catch {
    return false
  }
}
