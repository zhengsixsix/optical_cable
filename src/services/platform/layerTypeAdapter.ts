import type { LayerConfig } from '@/types'

const layerRuntimeByDictionaryCode: Record<string, { localId: string; type: LayerConfig['type'] }> = {
  BATHY: { localId: 'elevation', type: 'raster' },
  SLOPE: { localId: 'slope', type: 'heatmap' },
  VOLCANO: { localId: 'volcano', type: 'both' },
  CWCORAL: { localId: 'coldCoral', type: 'vector' },
  SEISMIC: { localId: 'earthquake', type: 'both' },
  FISHZONE: { localId: 'fishing', type: 'point' },
  SHIPLANE: { localId: 'shipping', type: 'vector' },
}

function normalizeLayerTypeCode(code?: string | null): string {
  return String(code ?? '').trim().toUpperCase()
}

export function getLocalLayerIdForDictionaryCode(code?: string | null): string {
  const normalized = normalizeLayerTypeCode(code)
  if (!normalized) return 'platform-layer-untyped'
  return layerRuntimeByDictionaryCode[normalized]?.localId
    ?? `platform-layer-type-${normalized.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
}

export function getRuntimeLayerTypeForDictionaryCode(code?: string | null): LayerConfig['type'] {
  return layerRuntimeByDictionaryCode[normalizeLayerTypeCode(code)]?.type ?? 'vector'
}
