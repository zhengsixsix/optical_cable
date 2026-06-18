import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  mockAlarmHistory,
  mockConnectorElements,
  mockEditableRoutePoints,
  mockLayers,
  mockMonitorDevices,
  mockMonitorPanelDevices,
  mockMonitorPanelStats,
  mockParetoRoutes,
  mockRepeaterConfigs,
  mockReportData,
  mockRouteStats,
  mockRoutes,
  mockRPLRecords,
  mockSegmentConfigs,
  mockSLDEquipments,
  mockSLDFiberSegments,
  mockTransmissionParams,
} from '@/data/mockData'

describe('central mock data', () => {
  it('does not ship business fixture arrays', () => {
    const fixtureArrays = [
      mockRPLRecords,
      mockSLDEquipments,
      mockSLDFiberSegments,
      mockConnectorElements,
      mockSegmentConfigs,
      mockRoutes,
      mockLayers,
      mockMonitorDevices,
      mockAlarmHistory,
      mockEditableRoutePoints,
      mockRepeaterConfigs,
      mockMonitorPanelDevices,
      mockParetoRoutes,
    ]

    fixtureArrays.forEach(data => {
      expect(data).toEqual([])
    })
  })

  it('does not ship aggregate mock values', () => {
    expect(mockTransmissionParams).toEqual({})
    expect(mockMonitorPanelStats).toEqual({})
    expect(mockRouteStats).toEqual({})
    expect(mockReportData).toEqual({})
  })

  it('does not ship a default frontend account', () => {
    const source = readFileSync(fileURLToPath(new URL('../data/mockData.ts', import.meta.url)), 'utf8')

    expect(source).not.toContain('defaultAdminUser')
    expect(source).not.toContain('mockUsers')
    expect(source).not.toContain('12345678')
    expect(source).not.toContain('admin-001')
  })
})
