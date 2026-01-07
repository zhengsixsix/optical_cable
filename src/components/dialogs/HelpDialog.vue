<script setup lang="ts">
import { computed } from 'vue'
import { Card, CardHeader, CardContent, Button } from '@/components/ui'
import { X, Info, Book, Phone, Mail, MapPin, FileText, Headphones } from 'lucide-vue-next'

const props = defineProps<{
  visible: boolean
  mode: 'about' | 'manual' | 'support'
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const title = computed(() => {
  const map: Record<string, string> = {
    about: '关于海底光缆智能规划软件',
    manual: '用户手册',
    support: '联系支持',
  }
  return map[props.mode] || '帮助'
})

const titleIcon = computed(() => {
  const map: Record<string, any> = {
    about: Info,
    manual: Book,
    support: Headphones,
  }
  return map[props.mode] || Info
})

// 软件信息
const softwareInfo = {
  name: '海底光缆智能规划软件',
  version: 'v1.0',
  releaseDate: '2025-11-30',
  description: '海底光缆智能规划软件是一款能够根据海底地貌形态自动规划光缆铺设路径的智能软件，并能够计算成本及预估风险。',
  team: 'XXXXXXX · 北京',
  copyright: '© 2025 XXXXXXX. 保留所有权利。'
}

// 联系信息
const contactInfo = {
  email: 'XXXXX@XXX.com',
  phone: '1399XXXXXXX',
  address: '北京市'
}

// 用户手册章节
const manualSections = [
  {
    title: '1. 快速开始',
    content: '创建新工程或打开现有工程，开始规划您的海底光缆路由。'
  },
  {
    title: '2. 路由规划',
    content: '使用GIS视图进行海缆路由规划，系统会根据海底地形自动优化路径。'
  },
  {
    title: '3. 传输系统设计',
    content: '配置传输系统参数，包括中继器配置、分段参数等。'
  },
  {
    title: '4. 成本与风险评估',
    content: '查看系统自动计算的成本估算和风险评估报告。'
  },
  {
    title: '5. 导出报告',
    content: '支持导出PDF、PNG、Excel等多种格式的报告。'
  }
]
</script>

<template>
  <Teleport to="body">
    <div 
      v-if="visible"
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000]"
      @click.self="emit('close')"
    >
      <Card class="w-[520px] max-h-[85vh] flex flex-col bg-white shadow-2xl">
        <CardHeader class="flex items-center justify-between border-b shrink-0">
          <div class="flex items-center gap-3">
            <component :is="titleIcon" class="w-5 h-5 text-primary" />
            <span class="font-semibold text-lg">{{ title }}</span>
          </div>
          <Button variant="ghost" size="sm" @click="emit('close')">
            <X class="w-4 h-4" />
          </Button>
        </CardHeader>
        
        <CardContent class="flex-1 overflow-auto p-6">
          <!-- 关于软件 -->
          <template v-if="mode === 'about'">
            <div class="space-y-6">
              <!-- 软件简介 -->
              <div class="text-center pb-4 border-b">
                <h2 class="text-xl font-bold text-gray-800 mb-2">{{ softwareInfo.name }}</h2>
                <p class="text-gray-600 text-sm leading-relaxed">{{ softwareInfo.description }}</p>
              </div>
              
              <!-- 版本信息 -->
              <div class="space-y-3">
                <div class="flex items-center justify-between py-2">
                  <span class="text-gray-500">当前版本</span>
                  <span class="font-medium">{{ softwareInfo.version }} ({{ softwareInfo.releaseDate }})</span>
                </div>
                <div class="flex items-center justify-between py-2">
                  <span class="text-gray-500">开发团队</span>
                  <span class="font-medium">{{ softwareInfo.team }}</span>
                </div>
              </div>
              
              <!-- 联系支持（合并呈现） -->
              <div class="bg-gray-50 rounded-lg p-4 space-y-3">
                <h3 class="font-semibold text-gray-700 flex items-center gap-2">
                  <Headphones class="w-4 h-4" />
                  客服支持
                </h3>
                <div class="space-y-2 text-sm">
                  <div class="flex items-center gap-3 text-gray-600">
                    <Mail class="w-4 h-4 text-gray-400" />
                    <span>{{ contactInfo.email }}</span>
                  </div>
                  <div class="flex items-center gap-3 text-gray-600">
                    <Phone class="w-4 h-4 text-gray-400" />
                    <span>{{ contactInfo.phone }}</span>
                  </div>
                </div>
              </div>
              
              <!-- 版权 -->
              <div class="text-center text-sm text-gray-400 pt-2">
                {{ softwareInfo.copyright }}
              </div>
            </div>
          </template>
          
          <!-- 用户手册 -->
          <template v-else-if="mode === 'manual'">
            <div class="space-y-4">
              <p class="text-gray-600 text-sm mb-4">
                欢迎使用海底光缆智能规划软件，以下是主要功能的使用说明：
              </p>
              
              <div class="space-y-4">
                <div 
                  v-for="(section, index) in manualSections" 
                  :key="index"
                  class="bg-gray-50 rounded-lg p-4"
                >
                  <h3 class="font-semibold text-gray-800 mb-2 flex items-center gap-2">
                    <FileText class="w-4 h-4 text-primary" />
                    {{ section.title }}
                  </h3>
                  <p class="text-gray-600 text-sm pl-6">{{ section.content }}</p>
                </div>
              </div>
              
              <div class="bg-blue-50 border border-blue-100 rounded-lg p-4 mt-4">
                <p class="text-blue-700 text-sm">
                  💡 提示：如需更详细的操作指南，请联系技术支持获取完整文档。
                </p>
              </div>
            </div>
          </template>
          
          <!-- 联系支持 -->
          <template v-else-if="mode === 'support'">
            <div class="space-y-6">
              <p class="text-gray-600 text-sm">
                如果您在使用过程中遇到任何问题，请通过以下方式联系我们的技术支持团队：
              </p>
              
              <!-- 联系方式卡片 -->
              <div class="space-y-4">
                <div class="bg-gray-50 rounded-lg p-4 flex items-start gap-4">
                  <div class="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center shrink-0">
                    <Mail class="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h3 class="font-semibold text-gray-800">电子邮件</h3>
                    <p class="text-gray-600 text-sm mt-1">{{ contactInfo.email }}</p>
                    <p class="text-gray-400 text-xs mt-1">我们将在 24 小时内回复您的邮件</p>
                  </div>
                </div>
                
                <div class="bg-gray-50 rounded-lg p-4 flex items-start gap-4">
                  <div class="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center shrink-0">
                    <Phone class="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <h3 class="font-semibold text-gray-800">客服电话</h3>
                    <p class="text-gray-600 text-sm mt-1">{{ contactInfo.phone }}</p>
                    <p class="text-gray-400 text-xs mt-1">工作时间：周一至周五 9:00-18:00</p>
                  </div>
                </div>
                
                <div class="bg-gray-50 rounded-lg p-4 flex items-start gap-4">
                  <div class="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center shrink-0">
                    <MapPin class="w-5 h-5 text-orange-600" />
                  </div>
                  <div>
                    <h3 class="font-semibold text-gray-800">公司地址</h3>
                    <p class="text-gray-600 text-sm mt-1">{{ contactInfo.address }}</p>
                    <p class="text-gray-400 text-xs mt-1">{{ softwareInfo.team }}</p>
                  </div>
                </div>
              </div>
            </div>
          </template>
        </CardContent>
        
        <!-- 底部按钮 -->
        <div class="px-6 py-4 border-t bg-gray-50 flex justify-end">
          <Button @click="emit('close')">关闭</Button>
        </div>
      </Card>
    </div>
  </Teleport>
</template>
