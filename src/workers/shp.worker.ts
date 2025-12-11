import shp from 'shpjs'

self.onmessage = async (e: MessageEvent) => {
  const { url, id } = e.data
  
  try {
    // shpjs 自动处理 zip 文件
    // 它会返回 FeatureCollection 或 FeatureCollection[]
    const data = await shp(url)
    
    self.postMessage({ 
      type: 'success', 
      id,
      data 
    })
  } catch (error) {
    self.postMessage({ 
      type: 'error', 
      id,
      error: (error as Error).message 
    })
  }
}
