import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const mapAreaPath = path.join(root, 'src/modules/planning/components/MapArea.vue')
const loadRouteDataDialogPath = path.join(root, 'src/modules/planning/dialogs/LoadRouteDataDialog.vue')
const source = fs.readFileSync(mapAreaPath, 'utf8')

if (fs.existsSync(loadRouteDataDialogPath)) {
  throw new Error('manual algorithm-result load dialog file still exists')
}

const removedMarkers = [
  'LoadRouteDataDialog',
  'showLoadRouteDataDialog',
  'handleRoutesLoaded',
  '加载算法返回结果并叠加到地图',
]

for (const marker of removedMarkers) {
  if (source.includes(marker)) {
    throw new Error(`manual algorithm-result load entry still references "${marker}"`)
  }
}

console.log('manual algorithm-result load entry removal verified')
