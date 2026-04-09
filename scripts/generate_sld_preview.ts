import fs from 'node:fs'
import path from 'node:path'
import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import { exportSLDToExcel } from '@/services/SLDExcelExportService'
import type { SLDTable } from '@/types'

class NodeBlob {
  readonly buffer: Buffer
  readonly size: number
  readonly type: string

  constructor(parts: unknown[], options?: { type?: string }) {
    this.type = options?.type || ''
    this.buffer = Buffer.concat(parts.map(part => toBuffer(part)))
    this.size = this.buffer.length
  }
}

function toBuffer(part: unknown): Buffer {
  if (Buffer.isBuffer(part)) return part
  if (part instanceof ArrayBuffer) return Buffer.from(part)
  if (ArrayBuffer.isView(part)) {
    return Buffer.from(part.buffer, part.byteOffset, part.byteLength)
  }
  if (typeof part === 'string') return Buffer.from(part)
  throw new Error(`Unsupported Blob part: ${Object.prototype.toString.call(part)}`)
}

function createSampleTable(): SLDTable {
  const now = new Date()

  return {
    id: 'sld-preview',
    name: '系统逻辑预览_含均衡器接头盒',
    routeId: 'route-preview',
    createdAt: now,
    updatedAt: now,
    transmissionParams: {
      designCapacity: 120,
      wavelengths: 96,
      channelSpacing: 50,
      modulationFormat: '16QAM',
      launchPower: 1,
      osnrRequired: 20,
      spanLossBudget: 20,
      systemMargin: 3,
    },
    metadata: {
      totalLength: 430,
      totalEquipments: 10,
      terminalCount: 2,
      repeaterCount: 2,
      branchingUnitCount: 1,
      equalizerCount: 2,
      jointCount: 2,
      totalFiberPairs: 16,
      estimatedCapacity: 120,
    },
    equipments: [
      {
        id: 'eq-001',
        sequence: 1,
        name: 'LAND-A',
        type: 'TE',
        location: 'Landing A',
        kp: 0,
        longitude: 121.8,
        latitude: 31.2,
        depth: 0,
        specifications: 'SLTE-A',
        remarks: '',
      },
      {
        id: 'eq-002',
        sequence: 2,
        name: 'PFE-A',
        type: 'PFE',
        location: 'Landing A',
        kp: 1,
        longitude: 121.81,
        latitude: 31.19,
        depth: 15,
        specifications: 'PFE-48V',
        remarks: '',
      },
      {
        id: 'eq-003',
        sequence: 3,
        name: 'REP-01',
        type: 'REP',
        location: 'Trunk',
        kp: 90,
        longitude: 122.2,
        latitude: 30.9,
        depth: 1600,
        specifications: 'REP-STD',
        remarks: '',
      },
      {
        id: 'eq-004',
        sequence: 4,
        name: 'BJB-01',
        type: 'JOINT',
        location: 'Trunk',
        kp: 128,
        longitude: 122.5,
        latitude: 30.7,
        depth: 1700,
        specifications: 'BJB',
        remarks: 'Joint box preview',
        jointSubType: 'BJB',
      },
      {
        id: 'eq-005',
        sequence: 5,
        name: 'EQ-T-01',
        type: 'EQ',
        location: 'Trunk',
        kp: 166,
        longitude: 122.8,
        latitude: 30.4,
        depth: 1800,
        specifications: 'Adjustable EQ',
        remarks: '',
        equalizerRole: 'T',
        attenuationMode: 'adjustable',
        attenuationDb: 2.5,
      },
      {
        id: 'eq-006',
        sequence: 6,
        name: 'BU-01',
        type: 'BU',
        location: 'Branch Point',
        kp: 220,
        longitude: 123.1,
        latitude: 30.1,
        depth: 1500,
        specifications: 'BU-3PORT',
        remarks: '',
      },
      {
        id: 'eq-007',
        sequence: 7,
        name: 'FJB-01',
        type: 'JOINT',
        location: 'Trunk',
        kp: 270,
        longitude: 123.45,
        latitude: 29.9,
        depth: 2000,
        specifications: 'FJB',
        remarks: 'Hollow diamond preview',
        jointSubType: 'FJB',
      },
      {
        id: 'eq-008',
        sequence: 8,
        name: 'F-ATT-01',
        type: 'EQ',
        location: 'Trunk',
        kp: 320,
        longitude: 123.8,
        latitude: 29.6,
        depth: 2200,
        specifications: 'Fixed attenuator',
        remarks: '',
        equalizerRole: 'S',
        attenuationMode: 'fixed',
        attenuationDb: 3,
      },
      {
        id: 'eq-009',
        sequence: 9,
        name: 'REP-02',
        type: 'REP',
        location: 'Trunk',
        kp: 380,
        longitude: 124.1,
        latitude: 29.4,
        depth: 1700,
        specifications: 'REP-STD',
        remarks: '',
      },
      {
        id: 'eq-010',
        sequence: 10,
        name: 'PFE-B',
        type: 'PFE',
        location: 'Landing B',
        kp: 429,
        longitude: 124.45,
        latitude: 29.1,
        depth: 12,
        specifications: 'PFE-48V',
        remarks: '',
      },
      {
        id: 'eq-011',
        sequence: 11,
        name: 'LAND-B',
        type: 'TE',
        location: 'Landing B',
        kp: 430,
        longitude: 124.5,
        latitude: 29.1,
        depth: 0,
        specifications: 'SLTE-B',
        remarks: '',
      },
    ],
    fiberSegments: [
      makeSegment(1, 'seg-001', 'eq-001', 'eq-002', 'LAND-A', 'PFE-A', 1, 'DA'),
      makeSegment(2, 'seg-002', 'eq-002', 'eq-003', 'PFE-A', 'REP-01', 89, 'SA'),
      makeSegment(3, 'seg-003', 'eq-003', 'eq-004', 'REP-01', 'BJB-01', 38, 'LW'),
      makeSegment(4, 'seg-004', 'eq-004', 'eq-005', 'BJB-01', 'EQ-T-01', 38, 'LW'),
      makeSegment(5, 'seg-005', 'eq-005', 'eq-006', 'EQ-T-01', 'BU-01', 54, 'LW'),
      makeSegment(6, 'seg-006', 'eq-006', 'eq-007', 'BU-01', 'FJB-01', 50, 'LW'),
      makeSegment(7, 'seg-007', 'eq-007', 'eq-008', 'FJB-01', 'F-ATT-01', 50, 'LW'),
      makeSegment(8, 'seg-008', 'eq-008', 'eq-009', 'F-ATT-01', 'REP-02', 60, 'SA'),
      makeSegment(9, 'seg-009', 'eq-009', 'eq-010', 'REP-02', 'PFE-B', 49, 'SA'),
      makeSegment(10, 'seg-010', 'eq-010', 'eq-011', 'PFE-B', 'LAND-B', 1, 'DA'),
    ],
  }
}

function makeSegment(
  sequence: number,
  id: string,
  fromEquipmentId: string,
  toEquipmentId: string,
  fromName: string,
  toName: string,
  length: number,
  cableType: string,
) {
  return {
    id,
    sequence,
    fromEquipmentId,
    toEquipmentId,
    fromName,
    toName,
    length,
    fiberPairs: 16,
    fiberPairType: 'working' as const,
    cableType,
    attenuation: 0.2,
    totalLoss: Number((length * 0.2).toFixed(2)),
    remarks: `C${String(sequence).padStart(2, '0')}`,
  }
}

async function main() {
  const outputDir = path.resolve('examples')
  const outputPath = path.join(outputDir, `SLD_效果预览_含均衡器接头盒_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.xlsx`)
  const blobStore = new Map<string, NodeBlob>()
  let savedPath = ''

  ;(globalThis as any).Blob = NodeBlob
  ;(globalThis as any).URL = {
    createObjectURL(blob: NodeBlob) {
      const key = `blob:codex:${Date.now()}-${Math.random().toString(36).slice(2)}`
      blobStore.set(key, blob)
      return key
    },
    revokeObjectURL(key: string) {
      blobStore.delete(key)
    },
  }

  ;(globalThis as any).document = {
    body: {
      appendChild() {},
      removeChild() {},
    },
    createElement(tag: string) {
      if (tag !== 'a') throw new Error(`Unsupported element: ${tag}`)
      return {
        href: '',
        download: '',
        click() {
          const blob = blobStore.get(this.href)
          if (!blob) throw new Error(`Missing blob for href: ${this.href}`)
          fs.mkdirSync(path.dirname(outputPath), { recursive: true })
          fs.writeFileSync(outputPath, blob.buffer)
          savedPath = outputPath
        },
      }
    },
  }

  const table = createSampleTable()
  await exportSLDToExcel(table)

  if (!savedPath || !fs.existsSync(savedPath)) {
    throw new Error('SLD xlsx was not written')
  }

  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(savedPath)
  const trunkSheet = workbook.getWorksheet('Trunk')
  const equipmentRow = trunkSheet?.getRow(6)
  const equipmentLabels = equipmentRow?.values
    .slice(2)
    .filter(value => typeof value === 'string' && value.trim().length > 0) || []

  const zip = await JSZip.loadAsync(fs.readFileSync(savedPath))
  const drawingXml = await zip.file('xl/drawings/drawing1.xml')?.async('string')
  const shapeCount = drawingXml ? (drawingXml.match(/<xdr:twoCellAnchor/g) || []).length : 0

  console.log(`Generated: ${savedPath}`)
  console.log(`Sheet: ${trunkSheet?.name}`)
  console.log(`Equipment row labels: ${equipmentLabels.join(' | ')}`)
  console.log(`Shape anchors: ${shapeCount}`)
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
