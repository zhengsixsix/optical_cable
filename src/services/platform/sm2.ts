import { sm2 } from 'sm-crypto'

export const PLATFORM_SM2_PUBLIC_KEY =
  '3059301306072a8648ce3d020106082a811ccf5501822d034200044cc7b802610aebc13332fa6b22868ae6d50c758402a00512dea0c79ecd9d8dca6cee42925ab9b3bd81a2e8658460938c0104562271579fd461cfb72b3398ca27'

export function normalizeSm2PublicKey(publicKey = PLATFORM_SM2_PUBLIC_KEY): string {
  const hex = publicKey.replace(/\s+/g, '').toLowerCase()
  if (/^04[0-9a-f]{128}$/.test(hex)) return hex

  const bitStringMarker = '03420004'
  const markerIndex = hex.lastIndexOf(bitStringMarker)
  if (markerIndex >= 0) {
    const key = `04${hex.slice(markerIndex + bitStringMarker.length, markerIndex + bitStringMarker.length + 128)}`
    if (/^04[0-9a-f]{128}$/.test(key)) return key
  }

  for (let i = hex.length - 130; i >= 0; i--) {
    const candidate = hex.slice(i, i + 130)
    if (/^04[0-9a-f]{128}$/.test(candidate)) return candidate
  }

  throw new Error('Invalid SM2 public key')
}

export function encryptPassword(password: string, publicKey = PLATFORM_SM2_PUBLIC_KEY): string {
  return sm2.doEncrypt(password, normalizeSm2PublicKey(publicKey), 1)
}
