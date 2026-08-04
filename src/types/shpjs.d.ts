declare module 'shpjs' {
  interface GeoJSONFeature {
    type: 'Feature'
    geometry: {
      type: string
      coordinates: number[] | number[][] | number[][][] | number[][][][]
    }
    properties: Record<string, unknown>
  }

  interface GeoJSONFeatureCollection {
    type: 'FeatureCollection'
    features: GeoJSONFeature[]
  }

  interface ShapefileComponents {
    shp: ArrayBuffer | Uint8Array
    dbf?: ArrayBuffer | Uint8Array
    prj?: string
    cpg?: string
  }

  function shp(input: ArrayBuffer | Uint8Array | string | ShapefileComponents): Promise<GeoJSONFeatureCollection | GeoJSONFeatureCollection[]>
  
  export default shp
}
