export type EqualizerRole = 'T' | 'S'
export type EqualizerAttenuationMode = 'adjustable' | 'fixed'

export interface EqualizerConfigLike {
  equalizerRole?: EqualizerRole | null
  attenuationMode?: EqualizerAttenuationMode | null
  attenuationDb?: number | string | null
}

function parseAttenuationDb(value: EqualizerConfigLike['attenuationDb']): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

export function validateEqualizerConfig(config: EqualizerConfigLike): string | null {
  const attenuationMode = config.attenuationMode === 'fixed' ? 'fixed' : 'adjustable'
  const attenuationDb = parseAttenuationDb(config.attenuationDb)

  if (attenuationDb < 0) {
    return '光衰值不能小于 0 dB'
  }

  if (attenuationMode === 'fixed' && attenuationDb <= 0) {
    return '固定光衰必须大于 0 dB'
  }

  return null
}

export function normalizeEqualizerConfig<T extends EqualizerConfigLike>(config: T) {
  const attenuationMode = config.attenuationMode === 'fixed' ? 'fixed' : 'adjustable'
  const attenuationDb = Math.max(0, parseAttenuationDb(config.attenuationDb))

  return {
    ...config,
    equalizerRole: config.equalizerRole === 'S' ? 'S' : 'T',
    attenuationMode,
    attenuationDb,
  }
}
