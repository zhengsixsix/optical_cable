const DEFAULT_GEOSERVER_WMS_URL = '/geoserver/geo/wms'

export const GEOSERVER_WMS_URL =
  import.meta.env.VITE_GEOSERVER_WMS_URL?.trim() || DEFAULT_GEOSERVER_WMS_URL

const PLAN_LAYER_WMS_NAMES: Readonly<Record<string, string>> = {
  CWCORAL: 'cable:WCMC008_CoralReef2021_Py_v4_1',
  FISHZONE: 'cable:fishing_area_NoDuplicate_Classify_two_level',
  SEISMIC: 'cable:earthQuakeData',
  SHIPLANE: 'cable:Ship_area_Classify_two_level',
  VOLCANO: 'cable:volcane_location',
}

export function getPlanLayerWmsName(typeDic?: string | null) {
  if (!typeDic) return null
  return PLAN_LAYER_WMS_NAMES[typeDic.trim().toUpperCase()] ?? null
}
