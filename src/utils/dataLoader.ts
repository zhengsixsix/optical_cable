import * as XLSX from 'xlsx'
import type { VolcanoData, EarthquakeData } from '@/types'

/**
 * 从 Excel 文件加载火山数据
 */
export async function loadVolcanoData(url: string): Promise<VolcanoData[]> {
  try {
    const response = await fetch(url)
    const arrayBuffer = await response.arrayBuffer()
    const workbook = XLSX.read(arrayBuffer, { type: 'array' })

    const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
    const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 }) as any[][]

    const dataRows = jsonData.slice(1)

    const volcanoData: VolcanoData[] = dataRows
      .filter(row => row.length >= 2 && !isNaN(row[0]) && !isNaN(row[1]))
      .map(row => ({
        latitude: parseFloat(row[0]),
        longitude: parseFloat(row[1])
      }))

    console.log(`成功加载 ${volcanoData.length} 个火山位置数据`)
    return volcanoData
  } catch (error) {
    console.error('加载火山数据失败:', error)
    return []
  }
}

/**
 * 从 Excel 文件加载地震数据
 */
export async function loadEarthquakeData(url: string): Promise<EarthquakeData[]> {
  try {
    const response = await fetch(url)
    const arrayBuffer = await response.arrayBuffer()
    const workbook = XLSX.read(arrayBuffer, { type: 'array' })

    const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
    const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 }) as any[][]

    const dataRows = jsonData.slice(1)

    const earthquakeData: EarthquakeData[] = dataRows
      .filter(row => row.length >= 3 && !isNaN(row[0]) && !isNaN(row[1]) && !isNaN(row[2]))
      .map(row => ({
        latitude: parseFloat(row[0]),
        longitude: parseFloat(row[1]),
        magnitude: parseFloat(row[2])
      }))

    console.log(`成功加载 ${earthquakeData.length} 条地震数据`)
    return earthquakeData
  } catch (error) {
    console.error('加载地震数据失败:', error)
    return []
  }
}
