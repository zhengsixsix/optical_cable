import type { ConnectorElement } from '@/types'

export interface MergePlatformConnectorOptions {
  replacePlatformElements?: boolean
}

const AMPLIFIER_TYPES = new Set(['ola', 'amplifier_e', 'amplifier_w'])

const sameId = (left: unknown, right: unknown): boolean =>
  left != null && right != null && left !== '' && right !== '' && String(left) === String(right)

const compatibleType = (left: ConnectorElement['type'], right: ConnectorElement['type']): boolean =>
  left === right || (AMPLIFIER_TYPES.has(left) && AMPLIFIER_TYPES.has(right))

const samePosition = (left: ConnectorElement, right: ConnectorElement): boolean => {
  if (!compatibleType(left.type, right.type)) return false
  const longitudeDelta = Number(left.longitude) - Number(right.longitude)
  const latitudeDelta = Number(left.latitude) - Number(right.latitude)
  return Number.isFinite(longitudeDelta)
    && Number.isFinite(latitudeDelta)
    && Math.abs(longitudeDelta) <= 0.00001
    && Math.abs(latitudeDelta) <= 0.00001
}

const preferIncomingNumber = (incoming: number | undefined, existing: number): number => {
  if (!Number.isFinite(incoming)) return existing
  if (incoming === 0 && existing !== 0) return existing
  return Number(incoming)
}

const mergeElement = (existing: ConnectorElement, incoming: ConnectorElement): ConnectorElement => ({
  ...existing,
  ...incoming,
  id: existing.id,
  kp: preferIncomingNumber(incoming.kp, existing.kp),
  // A refresh that lacks position data must not downgrade a previously
  // explicit local KP to the platform's zero fallback. Legacy elements with
  // no marker are explicit by compatibility convention.
  hasExplicitKp: (incoming.hasExplicitKp ?? true) || (existing.hasExplicitKp ?? true),
  depth: preferIncomingNumber(incoming.depth, existing.depth),
  specifications: incoming.specifications || existing.specifications,
  remarks: incoming.remarks || existing.remarks,
  componentRefId: incoming.componentRefId || existing.componentRefId,
  fiberRefId: incoming.fiberRefId || existing.fiberRefId,
})

export function mergePlatformConnectorElements(
  currentElements: ConnectorElement[],
  incomingElements: ConnectorElement[],
  options: MergePlatformConnectorOptions = {},
): ConnectorElement[] {
  let merged = currentElements.map(element => ({ ...element }))
  const incomingPlatformIds = new Set(
    incomingElements
      .map(element => element.platformEntityId)
      .filter(id => id != null && id !== '')
      .map(String),
  )

  for (const incoming of incomingElements) {
    let index = merged.findIndex(element => sameId(element.platformEntityId, incoming.platformEntityId))
    if (index < 0) {
      index = merged.findIndex(element => element.platformEntityId == null && samePosition(element, incoming))
    }

    if (index >= 0) {
      merged[index] = mergeElement(merged[index], incoming)
      continue
    }

    const id = merged.some(element => element.id === incoming.id)
      ? `platform-${incoming.id}`
      : incoming.id
    merged.push({ ...incoming, id })
  }

  if (options.replacePlatformElements) {
    merged = merged.filter(element =>
      element.platformEntityId == null || incomingPlatformIds.has(String(element.platformEntityId))
    )
  }

  return merged
}
