/**
 * 集中管理的模拟数据
 * 数据模拟：上海-冲绳海底光缆系统 (总长650km)
 * 所有数据相互关联，形成完整的数据链路
 */

import type { RPLRecord, SLDEquipment, SLDFiberSegment, ConnectorElement } from '@/types'

// 路由ID - 所有数据共用
export const ROUTE_ID = 'route-shanghai-okinawa'
export const ROUTE_NAME = '上海-冲绳海缆'

// RPL 路由位置表数据
export const mockRPLRecords: Omit<RPLRecord, 'id' | 'sequence'>[] = [
  { kp: 0, longitude: 121.4737, latitude: 31.2304, depth: 15, pointType: 'landing', cableType: 'DA', segmentLength: 0, cumulativeLength: 0, slack: 0, burialDepth: 2.0, remarks: '上海登陆站' },
  { kp: 25, longitude: 122.1, latitude: 30.8, depth: 45, pointType: 'waypoint', cableType: 'SA', segmentLength: 25, cumulativeLength: 25, slack: 2.5, burialDepth: 1.5, remarks: '' },
  { kp: 80, longitude: 123.5, latitude: 29.5, depth: 120, pointType: 'waypoint', cableType: 'SA', segmentLength: 55, cumulativeLength: 80, slack: 2.5, burialDepth: 1.0, remarks: '' },
  { kp: 160, longitude: 125.2, latitude: 28.0, depth: 850, pointType: 'repeater', cableType: 'LW', segmentLength: 80, cumulativeLength: 160, slack: 3.0, burialDepth: 0, remarks: 'R1中继器' },
  { kp: 240, longitude: 127.0, latitude: 26.5, depth: 1200, pointType: 'waypoint', cableType: 'LW', segmentLength: 80, cumulativeLength: 240, slack: 2.5, burialDepth: 0, remarks: '' },
  { kp: 320, longitude: 128.5, latitude: 25.2, depth: 2500, pointType: 'repeater', cableType: 'LW', segmentLength: 80, cumulativeLength: 320, slack: 3.0, burialDepth: 0, remarks: 'R2中继器' },
  { kp: 400, longitude: 129.8, latitude: 24.0, depth: 3200, pointType: 'waypoint', cableType: 'LW', segmentLength: 80, cumulativeLength: 400, slack: 2.5, burialDepth: 0, remarks: '' },
  { kp: 480, longitude: 130.5, latitude: 23.0, depth: 2800, pointType: 'repeater', cableType: 'LW', segmentLength: 80, cumulativeLength: 480, slack: 3.0, burialDepth: 0, remarks: 'R3中继器' },
  { kp: 520, longitude: 131.0, latitude: 22.5, depth: 1500, pointType: 'branching', cableType: 'LW', segmentLength: 40, cumulativeLength: 520, slack: 2.5, burialDepth: 0, remarks: 'BU1分支器' },
  { kp: 580, longitude: 131.8, latitude: 22.0, depth: 350, pointType: 'waypoint', cableType: 'SA', segmentLength: 60, cumulativeLength: 580, slack: 2.5, burialDepth: 1.0, remarks: '' },
  { kp: 620, longitude: 132.3, latitude: 21.8, depth: 80, pointType: 'waypoint', cableType: 'DA', segmentLength: 40, cumulativeLength: 620, slack: 2.5, burialDepth: 1.5, remarks: '' },
  { kp: 650, longitude: 132.8, latitude: 21.5, depth: 20, pointType: 'landing', cableType: 'DA', segmentLength: 30, cumulativeLength: 650, slack: 0, burialDepth: 2.0, remarks: '冲绳登陆站' },
]

// SLD 设备数据 - 与RPL中的关键点位对应
export const mockSLDEquipments: Omit<SLDEquipment, 'id' | 'sequence'>[] = [
  { name: '上海终端站', type: 'TE', location: '上海', kp: 0, longitude: 121.4737, latitude: 31.2304, depth: 0, specifications: 'SLTE-400G', remarks: '' },
  { name: 'PFE-SH', type: 'PFE', location: '上海', kp: 0.5, longitude: 121.48, latitude: 31.22, depth: 15, specifications: 'PFE-15kV', remarks: '上海馈电' },
  { name: 'REP-01', type: 'REP', location: 'KP 160', kp: 160, longitude: 125.2, latitude: 28.0, depth: 850, specifications: 'EREP-C+L', remarks: '对应RPL R1中继器' },
  { name: 'REP-02', type: 'REP', location: 'KP 320', kp: 320, longitude: 128.5, latitude: 25.2, depth: 2500, specifications: 'EREP-C+L', remarks: '对应RPL R2中继器' },
  { name: 'REP-03', type: 'REP', location: 'KP 480', kp: 480, longitude: 130.5, latitude: 23.0, depth: 2800, specifications: 'EREP-C+L', remarks: '对应RPL R3中继器' },
  { name: 'BU-01', type: 'BU', location: 'KP 520', kp: 520, longitude: 131.0, latitude: 22.5, depth: 1500, specifications: 'BU-R3', remarks: '对应RPL BU1分支器' },
  { name: 'PFE-OK', type: 'PFE', location: '冲绳', kp: 649, longitude: 132.7, latitude: 21.55, depth: 20, specifications: 'PFE-15kV', remarks: '冲绳馈电' },
  { name: '冲绳终端站', type: 'TE', location: '冲绳', kp: 650, longitude: 132.8, latitude: 21.5, depth: 0, specifications: 'SLTE-400G', remarks: '' },
]

// SLD 光纤段数据 - 连接设备
export const mockSLDFiberSegments: Omit<SLDFiberSegment, 'id' | 'sequence'>[] = [
  { fromEquipmentId: '', toEquipmentId: '', fromName: '上海终端站', toName: 'PFE-SH', length: 0.5, fiberPairs: 8, fiberPairType: 'working', cableType: 'DA', attenuation: 0.2, totalLoss: 0.1, remarks: '' },
  { fromEquipmentId: '', toEquipmentId: '', fromName: 'PFE-SH', toName: 'REP-01', length: 159.5, fiberPairs: 8, fiberPairType: 'working', cableType: 'SA', attenuation: 0.2, totalLoss: 31.9, remarks: '' },
  { fromEquipmentId: '', toEquipmentId: '', fromName: 'REP-01', toName: 'REP-02', length: 160, fiberPairs: 8, fiberPairType: 'working', cableType: 'LW', attenuation: 0.2, totalLoss: 32.0, remarks: '' },
  { fromEquipmentId: '', toEquipmentId: '', fromName: 'REP-02', toName: 'REP-03', length: 160, fiberPairs: 8, fiberPairType: 'working', cableType: 'LW', attenuation: 0.2, totalLoss: 32.0, remarks: '' },
  { fromEquipmentId: '', toEquipmentId: '', fromName: 'REP-03', toName: 'BU-01', length: 40, fiberPairs: 8, fiberPairType: 'working', cableType: 'LW', attenuation: 0.2, totalLoss: 8.0, remarks: '' },
  { fromEquipmentId: '', toEquipmentId: '', fromName: 'BU-01', toName: 'PFE-OK', length: 129, fiberPairs: 8, fiberPairType: 'working', cableType: 'SA', attenuation: 0.2, totalLoss: 25.8, remarks: '' },
  { fromEquipmentId: '', toEquipmentId: '', fromName: 'PFE-OK', toName: '冲绳终端站', length: 1, fiberPairs: 8, fiberPairType: 'working', cableType: 'DA', attenuation: 0.2, totalLoss: 0.2, remarks: '' },
]

// 接线元数据 - 与SLD设备对应
export const mockConnectorElements: Omit<ConnectorElement, 'id'>[] = [
  { name: '接头盒 J1', type: 'joint', kp: 50, longitude: 122.5, latitude: 30.5, depth: 60, status: 'active', specifications: 'UJ-2000', remarks: 'KP50处接头' },
  { name: '接头盒 J2', type: 'joint', kp: 200, longitude: 126.0, latitude: 27.0, depth: 1000, status: 'active', specifications: 'UJ-2000', remarks: 'KP200处接头' },
  { name: '接头盒 J3', type: 'joint', kp: 360, longitude: 129.0, latitude: 24.5, depth: 2800, status: 'active', specifications: 'UJ-3000', remarks: 'KP360处接头' },
  { name: '分支单元 BU1', type: 'bu', kp: 520, longitude: 131.0, latitude: 22.5, depth: 1500, status: 'active', specifications: 'BU-R3', manufacturer: 'SubCom', remarks: '对应SLD BU-01' },
  { name: '馈电设备 PFE-SH', type: 'pfe', kp: 0.5, longitude: 121.48, latitude: 31.22, depth: 15, status: 'active', specifications: 'PFE-15kV', remarks: '上海馈电设备' },
  { name: '馈电设备 PFE-OK', type: 'pfe', kp: 649, longitude: 132.7, latitude: 21.55, depth: 20, status: 'active', specifications: 'PFE-15kV', remarks: '冲绳馈电设备' },
  { name: '光放大器 OLA-R1', type: 'ola', kp: 160, longitude: 125.2, latitude: 28.0, depth: 850, status: 'active', specifications: 'EDFA-C+L', remarks: '对应SLD REP-01' },
  { name: '光放大器 OLA-R2', type: 'ola', kp: 320, longitude: 128.5, latitude: 25.2, depth: 2500, status: 'active', specifications: 'EDFA-C+L', remarks: '对应SLD REP-02' },
  { name: '光放大器 OLA-R3', type: 'ola', kp: 480, longitude: 130.5, latitude: 23.0, depth: 2800, status: 'active', specifications: 'EDFA-C+L', remarks: '对应SLD REP-03' },
  { name: '均衡器 EQ1', type: 'equalizer', kp: 160, longitude: 125.2, latitude: 28.0, depth: 850, status: 'active', specifications: 'GEQ-C', remarks: 'REP-01内置' },
  { name: '均衡器 EQ2', type: 'equalizer', kp: 320, longitude: 128.5, latitude: 25.2, depth: 2500, status: 'active', specifications: 'GEQ-C', remarks: 'REP-02内置' },
]

// 分段配置数据 - 与RPL的KP范围对应
export interface SegmentConfigData {
  id: string
  index: number
  startKP: number
  endKP: number
  length: number
  cableType: string
  slack: number
  burialDepth: number
  burialMethod: string
  protection: string
  avgDepth: number
  maxDepth: number
  expanded: boolean
}

export const mockSegmentConfigs: SegmentConfigData[] = [
  { id: 'seg-0', index: 0, startKP: 0, endKP: 25, length: 25, cableType: 'DA', slack: 2.5, burialDepth: 2.0, burialMethod: 'plow', protection: 'rock', avgDepth: 30, maxDepth: 45, expanded: false },
  { id: 'seg-1', index: 1, startKP: 25, endKP: 80, length: 55, cableType: 'SA', slack: 2.5, burialDepth: 1.0, burialMethod: 'plow', protection: 'none', avgDepth: 80, maxDepth: 120, expanded: false },
  { id: 'seg-2', index: 2, startKP: 80, endKP: 160, length: 80, cableType: 'SA', slack: 3.0, burialDepth: 0.5, burialMethod: 'jet', protection: 'none', avgDepth: 500, maxDepth: 850, expanded: false },
  { id: 'seg-3', index: 3, startKP: 160, endKP: 240, length: 80, cableType: 'LW', slack: 2.5, burialDepth: 0, burialMethod: 'none', protection: 'none', avgDepth: 1000, maxDepth: 1200, expanded: false },
  { id: 'seg-4', index: 4, startKP: 240, endKP: 320, length: 80, cableType: 'LW', slack: 3.0, burialDepth: 0, burialMethod: 'none', protection: 'none', avgDepth: 1800, maxDepth: 2500, expanded: false },
  { id: 'seg-5', index: 5, startKP: 320, endKP: 400, length: 80, cableType: 'LW', slack: 3.5, burialDepth: 0, burialMethod: 'none', protection: 'none', avgDepth: 2900, maxDepth: 3200, expanded: false },
  { id: 'seg-6', index: 6, startKP: 400, endKP: 480, length: 80, cableType: 'LW', slack: 3.0, burialDepth: 0, burialMethod: 'none', protection: 'none', avgDepth: 3000, maxDepth: 3200, expanded: false },
  { id: 'seg-7', index: 7, startKP: 480, endKP: 520, length: 40, cableType: 'LW', slack: 2.5, burialDepth: 0, burialMethod: 'none', protection: 'none', avgDepth: 2100, maxDepth: 2800, expanded: false },
  { id: 'seg-8', index: 8, startKP: 520, endKP: 580, length: 60, cableType: 'SA', slack: 2.5, burialDepth: 1.0, burialMethod: 'jet', protection: 'none', avgDepth: 900, maxDepth: 1500, expanded: false },
  { id: 'seg-9', index: 9, startKP: 580, endKP: 620, length: 40, cableType: 'SA', slack: 2.5, burialDepth: 1.5, burialMethod: 'plow', protection: 'none', avgDepth: 200, maxDepth: 350, expanded: false },
  { id: 'seg-10', index: 10, startKP: 620, endKP: 650, length: 30, cableType: 'DA', slack: 2.0, burialDepth: 2.0, burialMethod: 'plow', protection: 'rock', avgDepth: 50, maxDepth: 80, expanded: false },
]

// SLD 传输参数
export const mockTransmissionParams = {
  designCapacity: 100,
  wavelengths: 96,
  channelSpacing: 50,
  modulationFormat: '16QAM',
  launchPower: 1,
  osnrRequired: 20,
  spanLossBudget: 20,
  systemMargin: 3,
}

// ============================================
// 路由数据 - 用于 MockRouteRepository
// ============================================
export const mockRoutes = [
  {
    id: 'route-1',
    name: '路径 1 (成本优先)',
    points: [
      { id: 'p1-1', coordinates: [121.4737, 31.2304], type: 'landing', name: '上海登陆站' },
      { id: 'p1-2', coordinates: [125.2, 28.0], type: 'repeater', name: 'R1中继器' },
      { id: 'p1-3', coordinates: [128.5, 25.2], type: 'repeater', name: 'R2中继器' },
      { id: 'p1-4', coordinates: [132.8, 21.5], type: 'landing', name: '冲绳登陆站' },
    ],
    segments: [
      { id: 's1-1', startPointId: 'p1-1', endPointId: 'p1-2', length: 160, depth: 850, cableType: 'lw', riskLevel: 'medium', cost: 4800000 },
      { id: 's1-2', startPointId: 'p1-2', endPointId: 'p1-3', length: 160, depth: 2500, cableType: 'lw', riskLevel: 'medium', cost: 4800000 },
      { id: 's1-3', startPointId: 'p1-3', endPointId: 'p1-4', length: 330, depth: 1500, cableType: 'sa', riskLevel: 'low', cost: 8250000 },
    ],
    totalLength: 650,
    totalCost: 17850000,
    riskScore: 0.45,
    cost: { cable: 13000000, installation: 3000000, equipment: 1850000, total: 17850000 },
    risk: { seismic: 0.4, volcanic: 0.3, depth: 0.5, overall: 0.45 },
    distance: 650,
    createdAt: new Date('2024-01-15'),
    updatedAt: new Date('2024-01-15'),
  },
  {
    id: 'route-2',
    name: '路径 2 (均衡)',
    points: [
      { id: 'p2-1', coordinates: [121.4737, 31.2304], type: 'landing', name: '上海登陆站' },
      { id: 'p2-2', coordinates: [123.5, 29.5], type: 'waypoint' },
      { id: 'p2-3', coordinates: [125.2, 28.0], type: 'repeater', name: 'R1中继器' },
      { id: 'p2-4', coordinates: [128.5, 25.2], type: 'repeater', name: 'R2中继器' },
      { id: 'p2-5', coordinates: [130.5, 23.0], type: 'repeater', name: 'R3中继器' },
      { id: 'p2-6', coordinates: [132.8, 21.5], type: 'landing', name: '冲绳登陆站' },
    ],
    segments: [
      { id: 's2-1', startPointId: 'p2-1', endPointId: 'p2-2', length: 80, depth: 120, cableType: 'sa', riskLevel: 'low', cost: 2000000 },
      { id: 's2-2', startPointId: 'p2-2', endPointId: 'p2-3', length: 80, depth: 850, cableType: 'lw', riskLevel: 'low', cost: 2400000 },
      { id: 's2-3', startPointId: 'p2-3', endPointId: 'p2-4', length: 160, depth: 2500, cableType: 'lw', riskLevel: 'medium', cost: 4800000 },
      { id: 's2-4', startPointId: 'p2-4', endPointId: 'p2-5', length: 160, depth: 2800, cableType: 'lw', riskLevel: 'medium', cost: 4800000 },
      { id: 's2-5', startPointId: 'p2-5', endPointId: 'p2-6', length: 170, depth: 350, cableType: 'sa', riskLevel: 'low', cost: 4250000 },
    ],
    totalLength: 650,
    totalCost: 18250000,
    riskScore: 0.35,
    cost: { cable: 13500000, installation: 3000000, equipment: 1750000, total: 18250000 },
    risk: { seismic: 0.3, volcanic: 0.2, depth: 0.45, overall: 0.35 },
    distance: 650,
    createdAt: new Date('2024-02-10'),
    updatedAt: new Date('2024-02-10'),
  },
  {
    id: 'route-3',
    name: '路径 3 (安全优先)',
    points: [
      { id: 'p3-1', coordinates: [121.4737, 31.2304], type: 'landing', name: '上海登陆站' },
      { id: 'p3-2', coordinates: [122.1, 30.8], type: 'waypoint' },
      { id: 'p3-3', coordinates: [123.5, 29.5], type: 'waypoint' },
      { id: 'p3-4', coordinates: [125.2, 28.0], type: 'repeater', name: 'R1中继器' },
      { id: 'p3-5', coordinates: [127.0, 26.5], type: 'waypoint' },
      { id: 'p3-6', coordinates: [128.5, 25.2], type: 'repeater', name: 'R2中继器' },
      { id: 'p3-7', coordinates: [130.5, 23.0], type: 'repeater', name: 'R3中继器' },
      { id: 'p3-8', coordinates: [131.0, 22.5], type: 'branching', name: 'BU1分支器' },
      { id: 'p3-9', coordinates: [132.8, 21.5], type: 'landing', name: '冲绳登陆站' },
    ],
    segments: [
      { id: 's3-1', startPointId: 'p3-1', endPointId: 'p3-2', length: 25, depth: 45, cableType: 'da', riskLevel: 'low', cost: 875000 },
      { id: 's3-2', startPointId: 'p3-2', endPointId: 'p3-3', length: 55, depth: 120, cableType: 'sa', riskLevel: 'low', cost: 1375000 },
      { id: 's3-3', startPointId: 'p3-3', endPointId: 'p3-4', length: 80, depth: 850, cableType: 'lw', riskLevel: 'low', cost: 2400000 },
      { id: 's3-4', startPointId: 'p3-4', endPointId: 'p3-5', length: 80, depth: 1200, cableType: 'lw', riskLevel: 'low', cost: 2400000 },
      { id: 's3-5', startPointId: 'p3-5', endPointId: 'p3-6', length: 80, depth: 2500, cableType: 'lw', riskLevel: 'low', cost: 2400000 },
      { id: 's3-6', startPointId: 'p3-6', endPointId: 'p3-7', length: 160, depth: 2800, cableType: 'lw', riskLevel: 'low', cost: 4800000 },
      { id: 's3-7', startPointId: 'p3-7', endPointId: 'p3-8', length: 40, depth: 1500, cableType: 'lw', riskLevel: 'low', cost: 1200000 },
      { id: 's3-8', startPointId: 'p3-8', endPointId: 'p3-9', length: 130, depth: 350, cableType: 'sa', riskLevel: 'low', cost: 3250000 },
    ],
    totalLength: 650,
    totalCost: 18700000,
    riskScore: 0.15,
    cost: { cable: 14000000, installation: 3000000, equipment: 1700000, total: 18700000 },
    risk: { seismic: 0.1, volcanic: 0.1, depth: 0.25, overall: 0.15 },
    distance: 650,
    createdAt: new Date('2024-03-20'),
    updatedAt: new Date('2024-03-20'),
  },
]

// ============================================
// 图层配置 - 用于 MockLayerRepository
// ============================================
export const mockLayers = [
  { id: 'volcano', name: '火山区域', type: 'both', visible: false, loaded: false, loading: false, zIndex: 100 },
  { id: 'earthquake', name: '地震活动', type: 'both', visible: false, loaded: false, loading: false, zIndex: 100 },
  { id: 'elevation', name: '海洋高程', type: 'raster', visible: true, loaded: true, loading: false, zIndex: 10 },
  { id: 'slope', name: '海洋坡度', type: 'heatmap', visible: false, loaded: false, loading: false, zIndex: 20 },
  { id: 'fishing', name: '海洋渔区分布', type: 'point', visible: false, loaded: false, loading: false, zIndex: 80 },
  { id: 'shipping', name: '航道分布', type: 'vector', visible: false, loaded: false, loading: false, zIndex: 70 },
]

// ============================================
// 监控数据 - 用于 MonitoringView
// 通过 kp/sldEquipmentName 与其他数据关联
// ============================================
export const mockMonitorDevices = [
  {
    id: 'mon-rep-01', name: '中继器 R1', type: 'Repeater', neType: 'Repeater', status: 'normal',
    location: 'KP 160', kp: 160, sldEquipmentName: 'REP-01',
    longitude: 125.2, latitude: 28.0, depth: 850,
    inputPower: -12.5, outputPower: 2.8, pumpCurrent: 285,
    pfeVoltage: 48.2, pfeCurrent: 1.25, temperature: 4.2,
  },
  {
    id: 'mon-rep-02', name: '中继器 R2', type: 'Repeater', neType: 'Repeater', status: 'warning',
    location: 'KP 320', kp: 320, sldEquipmentName: 'REP-02',
    longitude: 128.5, latitude: 25.2, depth: 2500,
    inputPower: -13.2, outputPower: 2.5, pumpCurrent: 295,
    pfeVoltage: 47.8, pfeCurrent: 1.28, temperature: 5.1,
  },
  {
    id: 'mon-rep-03', name: '中继器 R3', type: 'Repeater', neType: 'Repeater', status: 'normal',
    location: 'KP 480', kp: 480, sldEquipmentName: 'REP-03',
    longitude: 130.5, latitude: 23.0, depth: 2800,
    inputPower: -12.8, outputPower: 2.6, pumpCurrent: 280,
    pfeVoltage: 48.1, pfeCurrent: 1.22, temperature: 4.0,
  },
  {
    id: 'mon-bu-01', name: '分支器 B1', type: 'BU', neType: 'BU', status: 'normal',
    location: 'KP 520', kp: 520, sldEquipmentName: 'BU-01',
    longitude: 131.0, latitude: 22.5, depth: 1500,
    inputPower: -10.5, outputPower: -11.2, pumpCurrent: 0,
    pfeVoltage: 48.0, pfeCurrent: 0.85, temperature: 3.8,
  },
  {
    id: 'mon-te-sh', name: '登陆站 L1', type: 'LandingStation', neType: 'SLTE', status: 'normal',
    location: '上海', kp: 0, sldEquipmentName: '上海终端站',
    longitude: 121.4737, latitude: 31.2304, depth: 0,
    inputPower: -8.2, outputPower: 4.0, pumpCurrent: 0,
    pfeVoltage: 47.5, pfeCurrent: 15.2, temperature: 22.5,
    qValue: 12.5, ber: 1.2e-9, osnr: 28.5,
  },
  {
    id: 'mon-te-ok', name: '登陆站 L2', type: 'LandingStation', neType: 'SLTE', status: 'normal',
    location: '冲绳', kp: 650, sldEquipmentName: '冲绳终端站',
    longitude: 132.8, latitude: 21.5, depth: 0,
    inputPower: -9.0, outputPower: 3.8, pumpCurrent: 0,
    pfeVoltage: 48.3, pfeCurrent: 14.8, temperature: 21.8,
    qValue: 13.2, ber: 5.5e-10, osnr: 29.2,
  },
  {
    id: 'mon-pfe-sh', name: '供电设备 PFE-SH', type: 'PFE', neType: 'PFE', status: 'normal',
    location: '上海登陆站', kp: 0.5, sldEquipmentName: 'PFE-SH',
    longitude: 121.48, latitude: 31.22, depth: 15,
    inputPower: 0, outputPower: 0, pumpCurrent: 0,
    pfeVoltage: 380, pfeCurrent: 25.5, temperature: 35.2,
  },
  {
    id: 'mon-pfe-ok', name: '供电设备 PFE-OK', type: 'PFE', neType: 'PFE', status: 'normal',
    location: '冲绳登陆站', kp: 649, sldEquipmentName: 'PFE-OK',
    longitude: 132.7, latitude: 21.55, depth: 20,
    inputPower: 0, outputPower: 0, pumpCurrent: 0,
    pfeVoltage: 380, pfeCurrent: 24.8, temperature: 34.5,
  },
]

export const mockAlarmHistory = [
  { id: 1, time: '14:30', device: '中继器 R2', deviceId: 'mon-rep-02', neType: 'Repeater', message: '温度超过阈值', level: 'warning', status: 'active' },
  { id: 2, time: '12:15', device: '中继器 R1', deviceId: 'mon-rep-01', neType: 'Repeater', message: '信号恢复正常', level: 'info', status: 'cleared' },
  { id: 3, time: '10:45', device: '分支器 B1', deviceId: 'mon-bu-01', neType: 'BU', message: '端口连接正常', level: 'info', status: 'cleared' },
  { id: 4, time: '09:30', device: '登陆站 L1', deviceId: 'mon-te-sh', neType: 'LandingStation', message: '系统自检完成', level: 'info', status: 'cleared' },
  { id: 5, time: '08:00', device: '系统', deviceId: '', neType: '', message: '系统启动完成', level: 'info', status: 'cleared' },
]

// ============================================
// 路径编辑器点位 - 用于 RouteEditor
// ============================================
export const mockEditableRoutePoints = [
  { coords: [121.4737, 31.2304] as [number, number], type: 'landing' as const, name: '上海登陆站' },
  { coords: [122.1, 30.8] as [number, number], type: 'waypoint' as const },
  { coords: [123.5, 29.5] as [number, number], type: 'waypoint' as const },
  { coords: [125.2, 28.0] as [number, number], type: 'repeater' as const, name: 'REP-01' },
  { coords: [127.0, 26.5] as [number, number], type: 'waypoint' as const },
  { coords: [128.5, 25.2] as [number, number], type: 'repeater' as const, name: 'REP-02' },
  { coords: [130.5, 23.0] as [number, number], type: 'repeater' as const, name: 'REP-03' },
  { coords: [131.0, 22.5] as [number, number], type: 'branching' as const, name: 'BU-01' },
  { coords: [131.8, 22.0] as [number, number], type: 'waypoint' as const },
  { coords: [132.3, 21.8] as [number, number], type: 'waypoint' as const },
  { coords: [132.8, 21.5] as [number, number], type: 'landing' as const, name: '冲绳登陆站' },
]

// ============================================
// 中继器配置 - 用于 RepeaterConfigPanel/Dialog
// ============================================
export const mockRepeaterConfigs = [
  { name: 'REP-01', kp: 160, longitude: 125.2, latitude: 28.0, depth: 850, model: 'EREP-C+L', gain: 15, powerConsumption: 45 },
  { name: 'REP-02', kp: 320, longitude: 128.5, latitude: 25.2, depth: 2500, model: 'EREP-C+L', gain: 15, powerConsumption: 45 },
  { name: 'REP-03', kp: 480, longitude: 130.5, latitude: 23.0, depth: 2800, model: 'EREP-C+L', gain: 15, powerConsumption: 45 },
]

// 中继器型号选项
export const repeaterModelOptions = [
  { value: 'EREP-C', label: 'EREP-C (C波段)' },
  { value: 'EREP-C+L', label: 'EREP-C+L (C+L波段)' },
  { value: 'EREP-S+C+L', label: 'EREP-S+C+L (全波段)' },
]

// 中继器间距配置
export const repeaterSpacingConfig = {
  recommended: 80,  // 推荐间距 km
  max: 120,         // 最大间距 km
  totalLength: 650, // 总长度 km
}

// ============================================
// 告警管理数据 - 用于 AlarmManageDialog
// ============================================
export const mockAlarmRecords = [
  { id: '1', time: '2024-12-10 14:30:25', device: '登陆站 L1', deviceType: 'landing', message: '供电电压低于阈值 (47.2V < 47.5V)', level: 'critical', status: 'active', type: 'voltage' },
  { id: '2', time: '2024-12-10 14:28:15', device: '中继器 R2', deviceType: 'repeater', message: '设备温度超过警告阈值 (5.2°C > 5.0°C)', level: 'warning', status: 'active', type: 'temperature' },
  { id: '3', time: '2024-12-10 12:15:30', device: '中继器 R1', deviceType: 'repeater', message: '输出光功率下降 (-2.5dBm)', level: 'major', status: 'acknowledged', type: 'power' },
  { id: '4', time: '2024-12-10 10:45:00', device: '分支器 B1', deviceType: 'branching', message: '端口2连接异常', level: 'warning', status: 'cleared', type: 'other' },
  { id: '5', time: '2024-12-10 09:30:20', device: '中继器 R3', deviceType: 'repeater', message: 'BER超过阈值 (1e-5 > 1e-6)', level: 'major', status: 'active', type: 'other' },
  { id: '6', time: '2024-12-10 08:15:10', device: '登陆站 L2', deviceType: 'landing', message: 'OSNR下降告警 (25dB < 28dB)', level: 'warning', status: 'acknowledged', type: 'power' },
  { id: '7', time: '2024-12-09 23:45:00', device: '中继器 R3', deviceType: 'repeater', message: '温度传感器故障', level: 'info', status: 'cleared', type: 'temperature' },
  { id: '8', time: '2024-12-09 20:30:00', device: '登陆站 L1', deviceType: 'landing', message: '供电电压恢复正常', level: 'info', status: 'cleared', type: 'voltage' },
]

// 告警筛选选项
export const alarmFilterOptions = {
  typeOptions: [
    { value: 'all', label: '全部类型' },
    { value: 'power', label: '光功率异常' },
    { value: 'temperature', label: '温度异常' },
    { value: 'voltage', label: '电压异常' },
    { value: 'other', label: '其他' },
  ],
  levelOptions: [
    { value: 'all', label: '全部级别' },
    { value: 'info', label: '提示' },
    { value: 'warning', label: '次要告警' },
    { value: 'major', label: '重要告警' },
    { value: 'critical', label: '紧急告警' },
  ],
  deviceTypeOptions: [
    { value: 'all', label: '全部设备' },
    { value: 'landing', label: '登陆站' },
    { value: 'repeater', label: '中继器' },
    { value: 'branching', label: '分支器' },
  ],
  statusOptions: [
    { value: 'all', label: '全部状态' },
    { value: 'active', label: '活动' },
    { value: 'acknowledged', label: '已确认' },
    { value: 'cleared', label: '已清除' },
  ],
}

// ============================================
// 性能历史数据 - 用于 PerformanceView
// ============================================
export const mockPerformanceData = [
  { id: 1, time: '2024-12-10 10:00', device: '中继器 R1', voltage: '48.2V', temp: '4.2°C', status: 'Normal' },
  { id: 2, time: '2024-12-10 11:00', device: '中继器 R1', voltage: '48.1V', temp: '4.3°C', status: 'Normal' },
  { id: 3, time: '2024-12-10 12:00', device: '中继器 R1', voltage: '48.3V', temp: '4.2°C', status: 'Normal' },
  { id: 4, time: '2024-12-10 13:00', device: '中继器 R1', voltage: '48.2V', temp: '4.4°C', status: 'Warning' },
  { id: 5, time: '2024-12-10 14:00', device: '中继器 R1', voltage: '48.2V', temp: '4.2°C', status: 'Normal' },
  { id: 6, time: '2024-12-10 15:00', device: '中继器 R1', voltage: '48.1V', temp: '4.1°C', status: 'Normal' },
]

export const performanceDeviceOptions = [
  { value: 'r1', label: '中继器 R1' },
  { value: 'r2', label: '中继器 R2' },
  { value: 'r3', label: '中继器 R3' },
  { value: 'b1', label: '分支器 B1' },
]

export const performanceTimeRangeOptions = [
  { value: '24h', label: '最近 24 小时' },
  { value: '7d', label: '最近 7 天' },
  { value: '30d', label: '最近 30 天' },
]

// ============================================
// 实时性能概览 - 用于 MonitorPanel
// ============================================
export const mockMonitorPanelDevices = [
  { id: 1, name: 'REP-01', code: 'KP160', status: 'OK' },
  { id: 2, name: 'REP-02', code: 'KP320', status: 'WARN' },
  { id: 3, name: 'REP-03', code: 'KP480', status: 'OK' },
  { id: 4, name: 'BU-01', code: 'KP520', status: 'OK' },
  { id: 5, name: 'PFE-SH', code: 'KP0.5', status: 'OK' },
  { id: 6, name: 'PFE-OK', code: 'KP649', status: 'OK' },
]

export const mockMonitorPanelStats = {
  healthStatus: '正常',
  activeAlarms: 1,
  gsnr: 25,
  margin: 3,
}

// ============================================
// 路由统计信息 - 用于 RouteStats
// ============================================
export const mockRouteStats = {
  project: '上海-冲绳海缆工程',
  totalLength: 650,
  countries: ['中国', '日本'],
  landingStations: 2,
  branchingUnits: 1,
  sections: [
    { id: '01', length: 25, type: 'DA' },
    { id: '02', length: 55, type: 'SA' },
    { id: '03', length: 80, type: 'SA' },
    { id: '04', length: 160, type: 'LW' },
    { id: '05', length: 160, type: 'LW' },
    { id: '06', length: 40, type: 'LW' },
    { id: '07', length: 130, type: 'SA' },
  ]
}

// ============================================
// 通用选项数据 - 电缆类型、点类型等
// ============================================

// 电缆类型选项 (完整版 - 用于 SegmentConfigPanel)
export const cableTypeOptions = [
  { value: 'LW', label: 'LW - 轻型无铠装' },
  { value: 'LWS', label: 'LWS - 轻型加强' },
  { value: 'SA', label: 'SA - 单铠装' },
  { value: 'DA', label: 'DA - 双铠装' },
  { value: 'SAS', label: 'SAS - 单铠装加强' },
]

// 海缆规格选项 - 用于线段详情弹窗
export const cableSpecOptions = [
  { value: 'LPA-1500', label: 'LPA-1500 (轻型)', category: 'LPA' as const, unitPrice: 28 },
  { value: 'LPA-2000', label: 'LPA-2000 (轻型)', category: 'LPA' as const, unitPrice: 32 },
  { value: 'LPA-2500', label: 'LPA-2500 (轻型)', category: 'LPA' as const, unitPrice: 38 },
  { value: 'HPA-1500', label: 'HPA-1500 (铠装)', category: 'HPA' as const, unitPrice: 45 },
  { value: 'HPA-2000', label: 'HPA-2000 (铠装)', category: 'HPA' as const, unitPrice: 52 },
  { value: 'HPA-2500', label: 'HPA-2500 (铠装)', category: 'HPA' as const, unitPrice: 60 },
]

// 根据水深推荐海缆类型
export function getRecommendedCableType(depth: number): string {
  if (depth > 1500) return 'LPA-1500'
  if (depth > 800) return 'LPA-2000'
  if (depth > 200) return 'HPA-1500'
  return 'HPA-2000'
}

// 计算推荐敷设余量 (根据路径长度)
export function getRecommendedSlack(routeLength: number): number {
  // 余量率约 5%
  return Number((routeLength * 0.05).toFixed(2))
}

// 计算推荐敷设长度
export function getRecommendedCableLength(routeLength: number): number {
  return Number((routeLength * 1.05).toFixed(2))
}

// 计算成本
export function calculateSegmentCost(cableType: string, cableLength: number) {
  const spec = cableSpecOptions.find(s => s.value === cableType)
  const unitPrice = spec?.unitPrice || 30
  const materialCost = Number((unitPrice * cableLength).toFixed(2))
  const installationCost = Number((materialCost * 0.3).toFixed(2)) // 施工成本约为材料成30%
  const totalCost = Number((materialCost + installationCost).toFixed(2))
  return { materialCost, installationCost, totalCost }
}

// 电缆类型选项 (简化版 - 用于 RPLRecordDialog/SLDSegmentDialog)
export const cableTypeOptionsSimple = [
  { value: 'LW', label: 'LW (轻型)' },
  { value: 'LWS', label: 'LWS (轻型加强)' },
  { value: 'SA', label: 'SA (单铠装)' },
  { value: 'DA', label: 'DA (双铠装)' },
  { value: 'SAS', label: 'SAS (单铠装加强)' },
]

// 埋设方式选项
export const burialMethodOptions = [
  { value: 'none', label: '不埋设' },
  { value: 'plow', label: '犁埋' },
  { value: 'jet', label: '喷射埋设' },
  { value: 'ROV', label: 'ROV埋设' },
  { value: 'dredge', label: '挖沟埋设' },
]

// 防护方式选项
export const protectionOptions = [
  { value: 'none', label: '无防护' },
  { value: 'rock', label: '抛石防护' },
  { value: 'mattress', label: '护垫防护' },
  { value: 'pipe', label: '套管防护' },
  { value: 'anchor', label: '锚固防护' },
]

// 点类型选项 - 用于 RPLRecordDialog
export const pointTypeOptions = [
  { value: 'landing', label: '登陆站' },
  { value: 'repeater', label: '中继器' },
  { value: 'branching', label: '分支器' },
  { value: 'joint', label: '接头' },
  { value: 'waypoint', label: '航路点' },
]

// 光纤对类型选项 - 用于 SLDSegmentDialog
export const fiberPairTypeOptions = [
  { value: 'working', label: '工作光纤' },
  { value: 'protection', label: '保护光纤' },
  { value: 'spare', label: '备用光纤' },
]

// 设备类型选项 - 用于 SLDEquipmentDialog
export const equipmentTypeOptions = [
  { value: 'TE', label: '终端设备 (TE)' },
  { value: 'PFE', label: '供电设备 (PFE)' },
  { value: 'REP', label: '中继器 (REP)' },
  { value: 'BU', label: '分支器 (BU)' },
  { value: 'JOINT', label: '接头 (JOINT)' },
  { value: 'OADM', label: '光分插复用器 (OADM)' },
]

// ============================================
// 设置页面选项 - 用于 SettingsView
// ============================================

// 光纤仿真模型选项
export const fiberModelOptions = [
  { value: 'GN', label: 'GN Model (高斯噪声模型)', desc: '适用于计算速度要求高、精度要求一般的场景' },
  { value: 'EGN', label: 'EGN Model (增强型高斯噪声模型)', desc: '适用于仿真精度要求高、可容忍较长计算时间的场景' },
]

// 规划模式选项
export const planningModeOptions = [
  { value: 'point-to-point', label: '点对点规划' },
  { value: 'multi-point', label: '多点规划' },
]

// 数据源类型选项
export const dataSourceOptions = [
  { value: 'realtime', label: '网络实时数据' },
  { value: 'history', label: '导入历史数据' },
]

// 计算模型选项
export const calculationModelOptions = [
  { value: 'power', label: '计算光功率衰减' },
  { value: 'ase', label: '计算线性噪声 (ASE等)' },
  { value: 'nli', label: '计算非线性噪声 (NLI)' },
  { value: 'amp', label: '封装光放大器增益与噪声模型' },
  { value: 'passive', label: '计算无源器件插入损耗' },
]

// ============================================
// 导入导出选项 - 用于 ImportExportDialog
// ============================================

// 支持的导入格式
export const supportedImportFormats = [
  { ext: '.geojson', label: 'GeoJSON' },
  { ext: '.json', label: 'JSON' },
  { ext: '.kml', label: 'KML' },
  { ext: '.csv', label: 'CSV' },
]

// 导出格式选项
export const exportFormatOptions = [
  { value: 'geojson', label: 'GeoJSON (.geojson)' },
  { value: 'kml', label: 'KML (.kml)' },
  { value: 'csv', label: 'CSV (.csv)' },
]

// ============================================
// 用户数据 - 用于 user store
// ============================================
export const defaultAdminUser = {
  id: 'admin-001',
  username: 'admin',
  password: '12345678',
  phone: '13800000000',
  role: 'admin' as const,
  status: 'approved' as const,
  createdAt: new Date('2024-01-01'),
}

export const mockUsers = [
  {
    id: 'user-001',
    username: 'zhangsan',
    password: '123456',
    phone: '13900001111',
    role: 'user' as const,
    status: 'approved' as const,
    createdAt: new Date('2024-06-01'),
  },
  {
    id: 'user-002',
    username: 'lisi',
    password: '123456',
    phone: '13900002222',
    role: 'user' as const,
    status: 'pending' as const,
    createdAt: new Date('2024-12-01'),
  },
]

// ============================================
// 报告数据 - 用于 ReportDialog
// ============================================
export const mockReportData = {
  totalLength: 650,           // 总长度 km
  vesselDays: 45,             // 船舶租赁天数
  perfData: {
    gsnr: 18.5,               // GSNR dB
    margin: 3.2,              // 系统余量 dB
  }
}

// ============================================
// Pareto路径数据 - 用于 route store
// ============================================
export const mockParetoRoutes = [
  {
    id: 'pareto-route-1',
    name: '经济路线',
    points: [
      { id: 'p1-1', coordinates: [121.4737, 31.2304] as [number, number], type: 'landing' as const, name: '上海登陆站' },
      { id: 'p1-2', coordinates: [127.5, 26.0] as [number, number], type: 'waypoint' as const },
      { id: 'p1-3', coordinates: [127.68, 26.21] as [number, number], type: 'landing' as const, name: '冲绳登陆站' },
    ],
    segments: [
      { id: 's1-1', startPointId: 'p1-1', endPointId: 'p1-2', length: 320, depth: 2500, cableType: 'lw', riskLevel: 'high' as const, cost: 9600000 },
      { id: 's1-2', startPointId: 'p1-2', endPointId: 'p1-3', length: 330, depth: 3200, cableType: 'lw', riskLevel: 'high' as const, cost: 9900000 },
    ],
    totalLength: 650,
    totalCost: 19500000,
    riskScore: 0.72,
    cost: { cable: 13650000, installation: 3900000, equipment: 1950000, total: 19500000 },
    risk: { seismic: 0.75, volcanic: 0.68, depth: 0.73, overall: 0.72 },
    distance: 650,
  },
  {
    id: 'pareto-route-2',
    name: '均衡路线',
    points: [
      { id: 'p2-1', coordinates: [121.4737, 31.2304] as [number, number], type: 'landing' as const, name: '上海登陆站' },
      { id: 'p2-2', coordinates: [123.8, 30.5] as [number, number], type: 'repeater' as const, name: 'REP-01' },
      { id: 'p2-3', coordinates: [126.2, 28.8] as [number, number], type: 'repeater' as const, name: 'REP-02' },
      { id: 'p2-4', coordinates: [127.68, 26.21] as [number, number], type: 'landing' as const, name: '冲绳登陆站' },
    ],
    segments: [
      { id: 's2-1', startPointId: 'p2-1', endPointId: 'p2-2', length: 160, depth: 1800, cableType: 'sa', riskLevel: 'medium' as const, cost: 6400000 },
      { id: 's2-2', startPointId: 'p2-2', endPointId: 'p2-3', length: 160, depth: 2200, cableType: 'lw', riskLevel: 'medium' as const, cost: 4800000 },
      { id: 's2-3', startPointId: 'p2-3', endPointId: 'p2-4', length: 330, depth: 2000, cableType: 'lw', riskLevel: 'low' as const, cost: 9900000 },
    ],
    totalLength: 650,
    totalCost: 21100000,
    riskScore: 0.45,
    cost: { cable: 14770000, installation: 4220000, equipment: 2110000, total: 21100000 },
    risk: { seismic: 0.42, volcanic: 0.48, depth: 0.45, overall: 0.45 },
    distance: 650,
  },
  {
    id: 'pareto-route-3',
    name: '安全路线',
    points: [
      { id: 'p3-1', coordinates: [121.4737, 31.2304] as [number, number], type: 'landing' as const, name: '上海登陆站' },
      { id: 'p3-2', coordinates: [122.5, 30.0] as [number, number], type: 'repeater' as const, name: 'REP-01' },
      { id: 'p3-3', coordinates: [124.0, 32.0] as [number, number], type: 'waypoint' as const },
      { id: 'p3-4', coordinates: [126.5, 33.5] as [number, number], type: 'repeater' as const, name: 'REP-02' },
      { id: 'p3-5', coordinates: [129.0, 31.0] as [number, number], type: 'repeater' as const, name: 'REP-03' },
      { id: 'p3-6', coordinates: [128.5, 28.5] as [number, number], type: 'waypoint' as const },
      { id: 'p3-7', coordinates: [127.68, 26.21] as [number, number], type: 'landing' as const, name: '冲绳登陆站' },
    ],
    segments: [
      { id: 's3-1', startPointId: 'p3-1', endPointId: 'p3-2', length: 80, depth: 200, cableType: 'da', riskLevel: 'low' as const, cost: 4800000 },
      { id: 's3-2', startPointId: 'p3-2', endPointId: 'p3-3', length: 100, depth: 150, cableType: 'da', riskLevel: 'low' as const, cost: 6000000 },
      { id: 's3-3', startPointId: 'p3-3', endPointId: 'p3-4', length: 120, depth: 300, cableType: 'sa', riskLevel: 'low' as const, cost: 7200000 },
      { id: 's3-4', startPointId: 'p3-4', endPointId: 'p3-5', length: 140, depth: 500, cableType: 'sa', riskLevel: 'low' as const, cost: 8400000 },
      { id: 's3-5', startPointId: 'p3-5', endPointId: 'p3-6', length: 130, depth: 800, cableType: 'sa', riskLevel: 'low' as const, cost: 7800000 },
      { id: 's3-6', startPointId: 'p3-6', endPointId: 'p3-7', length: 130, depth: 600, cableType: 'sa', riskLevel: 'low' as const, cost: 7800000 },
    ],
    totalLength: 700,
    totalCost: 42000000,
    riskScore: 0.18,
    cost: { cable: 29400000, installation: 8400000, equipment: 4200000, total: 42000000 },
    risk: { seismic: 0.15, volcanic: 0.20, depth: 0.18, overall: 0.18 },
    distance: 700,
  },
]
