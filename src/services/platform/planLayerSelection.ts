import type { PlanLayer } from './types'

export function getPlanLayerTypeKey(typeDic?: string | null): string | null {
  const normalized = typeDic?.trim().toUpperCase()
  return normalized || null
}

export function getPlanLayerGeoName(layer?: Pick<PlanLayer, 'geoLayerName'> | null): string | null {
  const normalized = layer?.geoLayerName?.trim()
  return normalized || null
}

export function hasPlanLayerAttachment(layer?: Pick<PlanLayer, 'attachmentId'> | null): boolean {
  return layer?.attachmentId !== null && layer?.attachmentId !== undefined && layer.attachmentId !== ''
}

export function hasPlanLayerSource(layer?: PlanLayer | null): boolean {
  return hasPlanLayerAttachment(layer) || Boolean(getPlanLayerGeoName(layer))
}

interface LayerSlot {
  defaultLayer?: PlanLayer
  projectLayer?: PlanLayer
  order: number
}

/** Select one effective layer per type, preferring a usable project upload over the system default. */
export function mergePlanLayersWithDefaults(
  projectLayers: PlanLayer[],
  defaultLayers: PlanLayer[],
): PlanLayer[] {
  const slots = new Map<string, LayerSlot>()
  const untypedDefaults: PlanLayer[] = []
  const untypedProjectLayers: PlanLayer[] = []

  defaultLayers.forEach((layer, index) => {
    const key = getPlanLayerTypeKey(layer.typeDic)
    if (!key) {
      untypedDefaults.push(layer)
      return
    }
    if (!slots.has(key)) {
      slots.set(key, { defaultLayer: layer, order: index })
    }
  })

  projectLayers.forEach((layer, index) => {
    const key = getPlanLayerTypeKey(layer.typeDic)
    if (!key) {
      untypedProjectLayers.push(layer)
      return
    }

    const slot = slots.get(key) ?? { order: defaultLayers.length + index }
    if (!slot.projectLayer || (!hasPlanLayerSource(slot.projectLayer) && hasPlanLayerSource(layer))) {
      slot.projectLayer = layer
    }
    slots.set(key, slot)
  })

  const typedLayers = [...slots.values()]
    .sort((left, right) => left.order - right.order)
    .map(({ defaultLayer, projectLayer }) => {
      if (projectLayer && (hasPlanLayerSource(projectLayer) || !hasPlanLayerSource(defaultLayer))) {
        return projectLayer
      }
      return defaultLayer
    })
    .filter((layer): layer is PlanLayer => Boolean(layer))

  return [...typedLayers, ...untypedDefaults, ...untypedProjectLayers]
}
