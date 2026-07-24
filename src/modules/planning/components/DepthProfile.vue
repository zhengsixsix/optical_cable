<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { Loader2 } from 'lucide-vue-next'
import { fetchDemProfile } from '@/services/DemApiService'

interface ProfilePoint {
  distance: number
  depth: number
}

interface SegmentInfo {
  id: string
  routeId: string
  startPoint: { lon: number; lat: number }
  endPoint: { lon: number; lat: number }
  length?: number
  depth?: number
  cableType?: string
  riskLevel?: string
}

interface Props {
  extent?: [number, number, number, number]
  segmentInfo?: SegmentInfo | null
}

const props = defineProps<Props>()

const containerRef = ref<HTMLElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const loading = ref(false)
const hasData = ref(false)
const profileData = ref<ProfilePoint[]>([])

const hoverInfo = ref({
  visible: false,
  x: 0,
  y: 0,
  distance: 0,
  elevation: 0,
})

let profileRequestId = 0

const clearProfileData = () => {
  profileData.value = []
  hasData.value = false
  hoverInfo.value.visible = false

  const canvas = canvasRef.value
  if (!canvas) return
  canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height)
  delete (canvas as any)._profileData
}

const loadProfileData = async (extent: [number, number, number, number]) => {
  const requestId = ++profileRequestId
  loading.value = true
  clearProfileData()

  try {
    const result = await fetchDemProfile({
      mode: 'extent',
      extent,
      sampleCount: 100,
    })
    if (requestId !== profileRequestId) return
    profileData.value = result.points || []
    hasData.value = profileData.value.length > 0
    if (hasData.value) nextTick(() => drawProfile())
  } catch {
    if (requestId === profileRequestId) clearProfileData()
  } finally {
    if (requestId === profileRequestId) loading.value = false
  }
}

const loadProfileDataFromSegment = async (segment: SegmentInfo) => {
  const requestId = ++profileRequestId
  loading.value = true
  clearProfileData()

  try {
    const result = await fetchDemProfile({
      mode: 'segment',
      segment: {
        startPoint: segment.startPoint,
        endPoint: segment.endPoint,
      },
      sampleCount: 100,
    })
    if (requestId !== profileRequestId) return
    profileData.value = result.points || []
    hasData.value = profileData.value.length > 0
    if (hasData.value) nextTick(() => drawProfile())
  } catch {
    if (requestId === profileRequestId) clearProfileData()
  } finally {
    if (requestId === profileRequestId) loading.value = false
  }
}

const drawProfile = () => {
  const canvas = canvasRef.value
  const container = containerRef.value
  if (!canvas || !container) return

  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const dpr = window.devicePixelRatio || 1
  const rect = container.getBoundingClientRect()
  canvas.width = rect.width * dpr
  canvas.height = rect.height * dpr
  canvas.style.width = rect.width + 'px'
  canvas.style.height = rect.height + 'px'
  ctx.scale(dpr, dpr)

  const width = rect.width
  const height = rect.height
  const padding = { top: 20, right: 15, bottom: 35, left: 55 }
  const chartWidth = width - padding.left - padding.right
  const chartHeight = height - padding.top - padding.bottom

  const seabedData = profileData.value
  if (seabedData.length === 0) return

  const maxDistance = Math.max(...seabedData.map(d => d.distance)) || 1
  const depths = seabedData.map(d => d.depth)
  const minElev = Math.min(...depths)
  const maxElev = Math.max(...depths)
  const elevRange = maxElev - minElev || 1

  const xScale = (distance: number) => padding.left + (distance / maxDistance) * chartWidth
  const yScale = (elev: number) => padding.top + ((maxElev - elev) / elevRange) * chartHeight
  const seaLevelY = yScale(0)

  ctx.clearRect(0, 0, width, height)

  if (seaLevelY > padding.top) {
    const skyGradient = ctx.createLinearGradient(0, padding.top, 0, seaLevelY)
    skyGradient.addColorStop(0, '#87CEEB')
    skyGradient.addColorStop(1, '#E0F4FF')
    ctx.fillStyle = skyGradient
    ctx.fillRect(padding.left, padding.top, chartWidth, seaLevelY - padding.top)
  }

  if (seaLevelY < height - padding.bottom) {
    const waterGradient = ctx.createLinearGradient(0, seaLevelY, 0, height - padding.bottom)
    waterGradient.addColorStop(0, '#4A90D9')
    waterGradient.addColorStop(1, '#0D2B3E')
    ctx.fillStyle = waterGradient
    ctx.fillRect(padding.left, seaLevelY, chartWidth, height - padding.bottom - seaLevelY)
  }

  ctx.beginPath()
  ctx.strokeStyle = '#2196F3'
  ctx.lineWidth = 2
  ctx.setLineDash([5, 3])
  ctx.moveTo(padding.left, seaLevelY)
  ctx.lineTo(width - padding.right, seaLevelY)
  ctx.stroke()
  ctx.setLineDash([])

  ctx.beginPath()
  ctx.moveTo(xScale(seabedData[0].distance), yScale(seabedData[0].depth))
  seabedData.forEach(point => ctx.lineTo(xScale(point.distance), yScale(point.depth)))
  ctx.lineTo(xScale(seabedData[seabedData.length - 1].distance), height - padding.bottom)
  ctx.lineTo(padding.left, height - padding.bottom)
  ctx.closePath()

  const terrainGradient = ctx.createLinearGradient(0, padding.top, 0, height - padding.bottom)
  terrainGradient.addColorStop(0, '#8B7355')
  terrainGradient.addColorStop(0.5, '#4682B4')
  terrainGradient.addColorStop(1, '#2F4F4F')
  ctx.fillStyle = terrainGradient
  ctx.fill()

  ctx.beginPath()
  ctx.strokeStyle = '#5D4037'
  ctx.lineWidth = 2
  ctx.moveTo(xScale(seabedData[0].distance), yScale(seabedData[0].depth))
  seabedData.forEach(point => ctx.lineTo(xScale(point.distance), yScale(point.depth)))
  ctx.stroke()

  ctx.fillStyle = '#374151'
  ctx.font = '10px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'

  const xTickCount = 5
  for (let i = 0; i <= xTickCount; i++) {
    const dist = (maxDistance / xTickCount) * i
    const x = xScale(dist)

    ctx.beginPath()
    ctx.strokeStyle = '#9CA3AF'
    ctx.lineWidth = 1
    ctx.moveTo(x, height - padding.bottom)
    ctx.lineTo(x, height - padding.bottom + 4)
    ctx.stroke()

    ctx.fillText(dist.toFixed(1), x, height - padding.bottom + 6)
  }

  ctx.fillStyle = '#6B7280'
  ctx.fillText('距离 (km)', padding.left + chartWidth / 2, height - 6)

  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#374151'

  const yTickCount = 5
  for (let i = 0; i <= yTickCount; i++) {
    const elev = minElev + (elevRange / yTickCount) * (yTickCount - i)
    const y = padding.top + (chartHeight / yTickCount) * i

    ctx.beginPath()
    ctx.strokeStyle = '#9CA3AF'
    ctx.lineWidth = 1
    ctx.moveTo(padding.left - 4, y)
    ctx.lineTo(padding.left, y)
    ctx.stroke()

    ctx.fillText(elev.toFixed(0), padding.left - 6, y)
  }

  ctx.save()
  ctx.translate(10, padding.top + chartHeight / 2)
  ctx.rotate(-Math.PI / 2)
  ctx.textAlign = 'center'
  ctx.fillStyle = '#6B7280'
  ctx.fillText('高程 (m)', 0, 0)
  ctx.restore()

  ;(canvas as any)._profileData = { seabedData, xScale, yScale, padding, maxDistance, chartWidth, chartHeight }
}

const handleMouseMove = (e: MouseEvent) => {
  const canvas = canvasRef.value
  if (!canvas) return

  const data = (canvas as any)._profileData
  if (!data) return

  const rect = canvas.getBoundingClientRect()
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top

  if (x < data.padding.left || x > data.padding.left + data.chartWidth) {
    hoverInfo.value.visible = false
    return
  }

  const distance = ((x - data.padding.left) / data.chartWidth) * data.maxDistance
  const nearestPoint = data.seabedData.reduce((prev: ProfilePoint, curr: ProfilePoint) =>
    Math.abs(curr.distance - distance) < Math.abs(prev.distance - distance) ? curr : prev
  )

  hoverInfo.value = {
    visible: true,
    x: x + 10,
    y: y - 40,
    distance: nearestPoint.distance,
    elevation: nearestPoint.depth,
  }
}

const handleMouseLeave = () => {
  hoverInfo.value.visible = false
}

let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  nextTick(() => {
    drawProfile()
    if (containerRef.value) {
      resizeObserver = new ResizeObserver(() => drawProfile())
      resizeObserver.observe(containerRef.value)
      containerRef.value.addEventListener('mousemove', handleMouseMove)
      containerRef.value.addEventListener('mouseleave', handleMouseLeave)
    }
  })
})

onUnmounted(() => {
  profileRequestId += 1
  resizeObserver?.disconnect()
  containerRef.value?.removeEventListener('mousemove', handleMouseMove)
  containerRef.value?.removeEventListener('mouseleave', handleMouseLeave)
})

watch(
  [() => props.segmentInfo, () => props.extent],
  ([newSegment, newExtent]) => {
    if (newSegment) {
      void loadProfileDataFromSegment(newSegment)
    } else if (newExtent) {
      void loadProfileData(newExtent)
    } else {
      profileRequestId += 1
      loading.value = false
      clearProfileData()
    }
  },
  { immediate: true, deep: true },
)
</script>

<template>
  <div ref="containerRef" class="w-full h-full relative bg-gray-50 rounded overflow-hidden">
    <canvas ref="canvasRef" class="block w-full h-full" />

    <div v-if="loading"
      class="absolute inset-0 flex flex-col items-center justify-center gap-2 text-gray-500 text-xs bg-gray-50/90">
      <Loader2 class="w-6 h-6 text-primary animate-spin" />
      <span>加载剖面数据...</span>
    </div>

    <div v-if="!hasData && !loading" class="absolute inset-0 flex items-center justify-center text-gray-500 text-xs">
      <span>点击选中路径线段或框选区域后显示地形剖面</span>
    </div>

    <div v-if="hoverInfo.visible"
      class="absolute bg-black/80 text-white px-2 py-1 rounded text-xs pointer-events-none z-10"
      :style="{ left: hoverInfo.x + 'px', top: hoverInfo.y + 'px' }">
      <div>距离: {{ hoverInfo.distance.toFixed(2) }} km</div>
      <div v-if="hoverInfo.elevation >= 0">海拔: {{ hoverInfo.elevation.toFixed(1) }} m</div>
      <div v-else>水深: {{ Math.abs(hoverInfo.elevation).toFixed(1) }} m</div>
    </div>
  </div>
</template>
