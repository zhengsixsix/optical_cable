const DEFAULT_GEOSERVER_WMS_URL = '/geoserver/geo/wms'

export const GEOSERVER_WMS_URL =
  import.meta.env.VITE_GEOSERVER_WMS_URL?.trim() || DEFAULT_GEOSERVER_WMS_URL
