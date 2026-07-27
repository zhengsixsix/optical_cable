﻿<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useAppStore } from '@/stores/app'
import { useRPLStore } from '@/stores/rpl'
import { PLATFORM_DICTIONARY_TYPES, useDictionaryStore } from '@/stores/dictionary'
import { exportRPLFile } from '@/services/RPLExportService'
import { buildExportableRplTableSnapshot } from '@/services/RPLSyncService'
import { Card, CardContent, Button } from '@/shared/components/base'
import { Download, FileSpreadsheet, Edit3 } from 'lucide-vue-next'
import type { RPLPointType, RPLCableCode, RPLRecord } from '@/types'
import { pointTypeOptions } from '@/config/uiOptions'

const emit = defineEmits<{
  (e: 'edit-record', recordId: string): void
}>()

const rplStore = useRPLStore()
const appStore = useAppStore()
const dictionaryStore = useDictionaryStore()

const currentTable = computed(() => rplStore.currentTable)
const records = computed(() => currentTable.value?.records ?? [])
const metadata = computed(() => currentTable.value?.metadata)

const hasMeaningfulNumber = (value: number | null | undefined) =>
  typeof value === 'number' && Number.isFinite(value) && value !== 0

const hasMeaningfulText = (value: string | null | undefined) => {
  const normalized = value?.trim()
  return Boolean(normalized && normalized !== '-' && normalized !== '未提供')
}

const normalizeMeaningfulText = (value: string | null | undefined) =>
  hasMeaningfulText(value) ? value!.trim() : ''

const getSlack = (record: RPLRecord) => record.slackPercent ?? record.slack
const getDepth = (record: RPLRecord) => record.approxDepth ?? record.depth
const getBurialDepth = (record: RPLRecord) => record.targetBurialDepth ?? record.burialDepth
const getAdditionalFeatures = (record: RPLRecord) =>
  normalizeMeaningfulText(record.additionalFeatures) || normalizeMeaningfulText(record.remarks)

const showSlackColumn = computed(() => records.value.some(record => hasMeaningfulNumber(getSlack(record))))
const showDepthColumn = computed(() => records.value.some(record => hasMeaningfulNumber(getDepth(record))))
const showBurialDepthColumn = computed(() => records.value.some(record => hasMeaningfulNumber(getBurialDepth(record))))
const showAdditionalFeaturesColumn = computed(() => records.value.some(record => hasMeaningfulText(getAdditionalFeatures(record))))
const visibleColumnCount = computed(() => 8
  + Number(showSlackColumn.value)
  + Number(showDepthColumn.value)
  + Number(showBurialDepthColumn.value)
  + Number(showAdditionalFeaturesColumn.value))

const eventLabels: Record<string, string> = {
  landing: '登陆站',
  repeater: '放大器',
  branching: '分支器',
  joint: '接头',
  waypoint: '路径点',
  Start: '起点',
  End: '终点',
  'Alter Course': '转向点',
  Repeater: '放大器',
  'Branching Unit': '分支器',
  Joint: '接头',
  'Landing Station': '登陆站',
  Waypoint: '路径点',
}

const getPointTypeLabel = (type: RPLPointType) => {
  return eventLabels[type] || pointTypeOptions.find(o => o.value === type)?.label || type
}

const getEventLabel = (record: RPLRecord) => {
  const event = normalizeMeaningfulText(record.event)
  return eventLabels[event] || event || getPointTypeLabel(record.pointType)
}

const getCableTypeLabel = (type: RPLCableCode) =>
  dictionaryStore.getItem(PLATFORM_DICTIONARY_TYPES.armoringType, type)?.name || type

const getPointTypeClass = (type: RPLPointType) => {
  const classes: Record<RPLPointType, string> = {
    landing: 'bg-green-100 text-green-700',
    repeater: 'bg-blue-100 text-blue-700',
    branching: 'bg-purple-100 text-purple-700',
    joint: 'bg-orange-100 text-orange-700',
    waypoint: 'bg-gray-100 text-gray-600',
  }
  return classes[type] || 'bg-gray-100 text-gray-600'
}

const handleExportRPL = async () => {
  if (!currentTable.value) return
  try {
    const snapshot = buildExportableRplTableSnapshot({
      baseTable: currentTable.value,
    })
    await exportRPLFile(snapshot, 'xlsx')
    appStore.showNotification({ type: 'success', message: '导出 Excel 文件成功' })
  } catch (error) {
    appStore.showNotification({ type: 'error', message: '导出失败' })
  }
}


onMounted(async () => {
  try {
    await dictionaryStore.loadDictionary(PLATFORM_DICTIONARY_TYPES.armoringType)
  } catch (error) {
    appStore.showNotification({ type: 'error', message: `铠装类型字典加载失败：${(error as Error).message}` })
  }
})
</script>

<template>
  <Card class="h-full flex flex-col overflow-hidden rounded-none border-0 shadow-none">
    <CardContent class="flex-1 flex flex-col overflow-hidden p-0">
      <!-- 统计信息 -->
      <div class="px-4 py-3 bg-gray-50 border-b">
        <div v-if="metadata" class="grid grid-cols-6 gap-4 text-sm">
          <div class="text-center">
            <div class="font-semibold text-blue-600">{{ metadata.totalLength.toFixed(1) }}</div>
            <div class="text-xs text-gray-500">总长度(km)</div>
          </div>
          <div class="text-center">
            <div class="font-semibold text-green-600">{{ metadata.landingStations }}</div>
            <div class="text-xs text-gray-500">登陆站</div>
          </div>
          <div class="text-center">
            <div class="font-semibold text-blue-600">{{ metadata.repeaters }}</div>
            <div class="text-xs text-gray-500">放大器</div>
          </div>
          <div class="text-center">
            <div class="font-semibold text-purple-600">{{ metadata.branchingUnits }}</div>
            <div class="text-xs text-gray-500">分支器</div>
          </div>
          <div class="text-center">
            <div class="font-semibold text-cyan-600">{{ metadata.maxDepth.toFixed(0) }}</div>
            <div class="text-xs text-gray-500">最大水深(m)</div>
          </div>
          <div class="text-center">
            <div class="font-semibold text-gray-600">{{ metadata.averageDepth.toFixed(0) }}</div>
            <div class="text-xs text-gray-500">平均水深(m)</div>
          </div>
        </div>
      </div>

      <!-- 工具栏 -->
      <div class="px-4 py-2 border-b flex items-center justify-end bg-white">
        <Button variant="outline" size="sm" @click="handleExportRPL">
          <Download class="w-4 h-4 mr-1" />
          导出 RPL
        </Button>
      </div>

      <!-- 表格内容 -->
      <div class="flex-1 overflow-auto">
        <table class="w-full text-sm border-collapse">
          <thead class="bg-gray-100 sticky top-0 z-10">
            <tr>
              <th class="px-2 py-2 text-center w-12 border-b font-medium text-gray-600" title="Pos No.">Pos</th>
              <th class="px-2 py-2 text-center w-20 border-b font-medium text-gray-600" title="Event">事件</th>
              <th class="px-2 py-2 text-right w-24 border-b font-medium text-gray-600" title="Latitude">纬度</th>
              <th class="px-2 py-2 text-right w-24 border-b font-medium text-gray-600" title="Longitude">经度</th>
              <th class="px-2 py-2 text-right w-24 border-b font-medium text-gray-600" title="Distance (km) Between Positions">距离(km)</th>
              <th class="px-2 py-2 text-right w-24 border-b font-medium text-gray-600" title="Distance (km) Cumulative Total">累计(km)</th>
              <th v-if="showSlackColumn" class="px-2 py-2 text-right w-16 border-b font-medium text-gray-600" title="Slack %">Slack%</th>
              <th class="px-2 py-2 text-center w-16 border-b font-medium text-gray-600" title="Cable Type">电缆</th>
              <th v-if="showDepthColumn" class="px-2 py-2 text-right w-20 border-b font-medium text-gray-600" title="Approx Depth (m)">水深(m)</th>
              <th v-if="showBurialDepthColumn" class="px-2 py-2 text-right w-20 border-b font-medium text-gray-600" title="Target Burial Depth (m)">埋深(m)</th>
              <th v-if="showAdditionalFeaturesColumn" class="px-2 py-2 text-left border-b font-medium text-gray-600" title="Planned Additional Route Features">附加特征</th>
              <th class="px-2 py-2 text-center w-16 border-b font-medium text-gray-600">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr 
              v-for="record in records"
              :key="record.id"
              class="hover:bg-blue-50 transition-colors"
            >
              <td class="px-2 py-1.5 text-center border-b text-gray-500">{{ record.sequence }}</td>
              <td class="px-2 py-1.5 text-center border-b">
                <span :class="['text-xs px-1.5 py-0.5 rounded', getPointTypeClass(record.pointType)]">
                  {{ getEventLabel(record) }}
                </span>
              </td>
              <td class="px-2 py-1.5 text-right border-b font-mono">{{ record.latitude?.toFixed(6) ?? '-' }}</td>
              <td class="px-2 py-1.5 text-right border-b font-mono">{{ record.longitude?.toFixed(6) ?? '-' }}</td>
              <td class="px-2 py-1.5 text-right border-b">{{ record.segmentLength?.toFixed(3) ?? '-' }}</td>
              <td class="px-2 py-1.5 text-right border-b font-medium">{{ record.cumulativeLength?.toFixed(3) ?? '-' }}</td>
              <td v-if="showSlackColumn" class="px-2 py-1.5 text-right border-b">{{ getSlack(record)?.toFixed(1) ?? '-' }}</td>
              <td class="px-2 py-1.5 text-center border-b text-xs">{{ getCableTypeLabel(record.cableType) || '-' }}</td>
              <td v-if="showDepthColumn" class="px-2 py-1.5 text-right border-b">{{ getDepth(record)?.toFixed(1) ?? '-' }}</td>
              <td v-if="showBurialDepthColumn" class="px-2 py-1.5 text-right border-b">{{ getBurialDepth(record)?.toFixed(2) ?? '-' }}</td>
              <td v-if="showAdditionalFeaturesColumn" class="px-2 py-1.5 text-left border-b text-gray-600 truncate max-w-[120px]" :title="getAdditionalFeatures(record)">
                {{ getAdditionalFeatures(record) || '-' }}
              </td>
              <td class="px-2 py-1.5 text-center border-b" @click.stop>
                <button 
                  class="p-1 hover:bg-gray-200 rounded"
                  title="编辑"
                  @click="emit('edit-record', record.id)"
                >
                  <Edit3 class="w-3.5 h-3.5 text-gray-500" />
                </button>
              </td>
            </tr>
            <tr v-if="records.length === 0">
              <td :colspan="visibleColumnCount" class="px-4 py-8 text-center text-gray-400">
                <FileSpreadsheet class="w-10 h-10 mx-auto mb-2 opacity-50" />
                <p>暂无数据</p>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 底部状态栏 -->
      <div class="px-4 py-2 border-t bg-gray-50 text-xs text-gray-500">
        <span>共 {{ records.length }} 条记录</span>
      </div>
    </CardContent>
  </Card>
</template>
