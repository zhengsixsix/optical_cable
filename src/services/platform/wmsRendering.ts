interface PlatformWmsRenderOverrides {
  opacity?: number
  zIndex?: number
}

export interface PlatformWmsRenderOptions {
  styles: string
  sldBody?: string
  opacity: number
  zIndex: number
}

const elevationColorStops = [
  { quantity: -11000, color: '#000014' },
  { quantity: -6000, color: '#0a1e64' },
  { quantity: -3000, color: '#1e3c96' },
  { quantity: -1000, color: '#0078c8' },
  { quantity: -1, color: '#96dcff' },
  { quantity: 0, color: '#228b22' },
  { quantity: 1000, color: '#64c832' },
  { quantity: 2500, color: '#c8dc64' },
  { quantity: 4000, color: '#f0c832' },
  { quantity: 5500, color: '#c86432' },
  { quantity: 6500, color: '#a0522d' },
  { quantity: 8848, color: '#ffffff' },
] as const

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export function createElevationColorRampSld(layerName: string): string {
  const entries = elevationColorStops
    .map(({ quantity, color }) => (
      `<ColorMapEntry color="${color}" quantity="${quantity}" label="${quantity} m"/>`
    ))
    .join('')

  return `<StyledLayerDescriptor version="1.0.0" xmlns="http://www.opengis.net/sld" xmlns:ogc="http://www.opengis.net/ogc"><NamedLayer><Name>${escapeXml(layerName)}</Name><UserStyle><FeatureTypeStyle><Rule><RasterSymbolizer><ColorMap type="ramp">${entries}</ColorMap></RasterSymbolizer></Rule></FeatureTypeStyle></UserStyle></NamedLayer></StyledLayerDescriptor>`
}

export function getPlatformWmsRenderOptions(
  layerId: string,
  layerName: string,
  overrides: PlatformWmsRenderOverrides = {},
): PlatformWmsRenderOptions {
  const isElevation = layerId === 'elevation'
  return {
    styles: '',
    sldBody: isElevation ? createElevationColorRampSld(layerName) : undefined,
    opacity: overrides.opacity ?? (isElevation ? 0.72 : 0.9),
    zIndex: overrides.zIndex ?? (isElevation ? 20 : 80),
  }
}
