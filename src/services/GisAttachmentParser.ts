import shp from 'shpjs'

/** Parse a Shapefile ZIP or one raw .shp attachment. */
export async function parseShapefileAttachment(blob: Blob, fileName: string): Promise<unknown> {
  const buffer = await blob.arrayBuffer()
  const isZip = fileName.trim().toLowerCase().split(/[?#]/)[0].endsWith('.zip')
  return isZip ? shp(buffer) : shp({ shp: buffer })
}
