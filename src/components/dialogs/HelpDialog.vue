<script setup lang="ts">
import { ref, computed } from 'vue'
import { Card, CardHeader, CardContent, Button } from '@/components/ui'
import { X, Info, Book, Phone, Mail, Globe, MapPin } from 'lucide-vue-next'

const props = defineProps<{
  visible: boolean
  mode: 'about' | 'manual' | 'support'
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const title = computed(() => {
  const map: Record<string, string> = {
    about: '关于软件',
    manual: '用户手册',
    support: '联系支持',
  }
  return map[props.mode] || '帮助'
})
</script>

<template>
  <Teleport to="body">
    <div 
      v-if="visible"
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000]"
      @click.self="emit('close')"
    >
      <Card class="w-[500px] max-h-[80vh] flex flex-col bg-white shadow-2xl">
        <CardHeader class="flex items-center justify-between border-b shrink-0">
          <div class="flex items-center gap-2">
            <Info v-if="mode === 'about'" class="w-5 h-5 text-blue-500" />
            <Book v-else-if="mode === 'manual'" class="w-5 h-5 text-green-500" />
            <Phone v-else class="w-5 h-5 text-orange-500" />
            <span class="font-semibold text-lg">{{ title }}</span>
          </div>
          <Button variant="ghost" size="sm" @click="emit('close')">
            <X class="w-4 h-4" />
          </Button>
        </CardHeader>
        
        <CardContent class="flex-1 overflow-auto">
          <!-- 关于软件 -->
          <div v-if="mode === 'about'" class="space-y-6">
            <div class="text-center py-4">
              <div class="w-20 h-20 bg-blue-600 rounded-xl mx-auto flex items-center justify-center mb-4">
                <Globe class="w-10 h-10 text-white" />
              </div>
              <h2 class="text-xl font-bold text-gray-800">海底光缆智能规划软件</h2>
              <p class="text-gray-500 mt-1">Marine Cable Intelligent Planning System</p>
            </div>
            
            <div class="space-y-3 text-sm">
              <div class="flex justify-between py-2 border-b">
                <span class="text-gray-500">版本号</span>
                <span class="font-medium">v2.0.0</span>
              </div>
              <div class="flex justify-between py-2 border-b">
                <span class="text-gray-500">发布日期</span>
                <span class="font-medium">2025年1月</span>
              </div>
              <div class="flex justify-between py-2 border-b">
                <span class="text-gray-500">运行环境</span>
                <span class="font-medium">Web Browser</span>
              </div>
              <div class="flex justify-between py-2 border-b">
                <span class="text-gray-500">技术栈</span>
                <span class="font-medium">Vue 3 + TypeScript + OpenLayers</span>
              </div>
            </div>
            
            <div class="bg-gray-50 rounded-lg p-4 text-sm text-gray-600">
              <p class="mb-2">本软件用于海底光缆系统的智能规划与设计，提供以下核心功能：</p>
              <ul class="list-disc list-inside space-y-1 text-gray-500">
                <li>GIS地图可视化与图层管理</li>
                <li>海缆路由自动规划与手动调整</li>
                <li>传输系统设计与成本分析</li>
                <li>实时监控与告警管理</li>
              </ul>
            </div>
            
            <div class="text-center text-xs text-gray-400">
              © 2025 DeepSea Technology. All rights reserved.
            </div>
          </div>

          <!-- 用户手册 -->
          <div v-else-if="mode === 'manual'" class="space-y-4">
            <div class="bg-blue-50 rounded-lg p-4 text-sm">
              <p class="text-blue-700 font-medium mb-2">快速入门</p>
              <p class="text-blue-600">按照以下步骤开始使用系统进行海缆规划。</p>
            </div>
            
            <div class="space-y-4">
              <div class="border rounded-lg p-4">
                <h3 class="font-semibold text-gray-800 mb-2">1. 创建项目</h3>
                <p class="text-sm text-gray-600">
                  点击「文件 → 新建工程」，选择项目类型（路由规划项目 .ucp 或系统设计项目 .use），
                  填写项目名称和基本信息后创建项目。
                </p>
              </div>
              
              <div class="border rounded-lg p-4">
                <h3 class="font-semibold text-gray-800 mb-2">2. 导入图层数据</h3>
                <p class="text-sm text-gray-600">
                  在左侧图层面板中，点击「导入图层」加载海洋高程、地震分布、火山分布等GIS数据。
                  支持本地文件、服务器文件和WMS服务三种数据源。
                </p>
              </div>
              
              <div class="border rounded-lg p-4">
                <h3 class="font-semibold text-gray-800 mb-2">3. 配置规划参数</h3>
                <p class="text-sm text-gray-600">
                  进入「设置 → 工程设置」，配置起止点坐标、规划范围、器件库参数等。
                  这些参数将影响自动规划的结果。
                </p>
              </div>
              
              <div class="border rounded-lg p-4">
                <h3 class="font-semibold text-gray-800 mb-2">4. 运行规划</h3>
                <p class="text-sm text-gray-600">
                  点击地图工具栏中的「运行规划」按钮，系统将自动计算最优路径。
                  规划完成后，Pareto路径列表将显示多条候选路径供选择。
                </p>
              </div>
              
              <div class="border rounded-lg p-4">
                <h3 class="font-semibold text-gray-800 mb-2">5. 导出结果</h3>
                <p class="text-sm text-gray-600">
                  完成规划后，点击「导出RPL」保存路由文件。
                  如需进行传输系统设计，切换到系统设计视图进行进一步配置。
                </p>
              </div>
            </div>
          </div>

          <!-- 联系支持 -->
          <div v-else class="space-y-6">
            <div class="bg-orange-50 rounded-lg p-4 text-sm">
              <p class="text-orange-700 font-medium mb-1">需要帮助？</p>
              <p class="text-orange-600">我们的技术支持团队随时为您服务。</p>
            </div>
            
            <div class="space-y-4">
              <div class="flex items-start gap-4 p-4 border rounded-lg hover:bg-gray-50 transition-colors">
                <div class="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center shrink-0">
                  <Phone class="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h3 class="font-semibold text-gray-800">技术支持热线</h3>
                  <p class="text-gray-600 mt-1">400-888-9999</p>
                  <p class="text-xs text-gray-400 mt-1">工作日 9:00 - 18:00</p>
                </div>
              </div>
              
              <div class="flex items-start gap-4 p-4 border rounded-lg hover:bg-gray-50 transition-colors">
                <div class="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center shrink-0">
                  <Mail class="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <h3 class="font-semibold text-gray-800">电子邮箱</h3>
                  <p class="text-gray-600 mt-1">support@deepseatech.com</p>
                  <p class="text-xs text-gray-400 mt-1">24小时内回复</p>
                </div>
              </div>
              
              <div class="flex items-start gap-4 p-4 border rounded-lg hover:bg-gray-50 transition-colors">
                <div class="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center shrink-0">
                  <MapPin class="w-5 h-5 text-orange-600" />
                </div>
                <div>
                  <h3 class="font-semibold text-gray-800">公司地址</h3>
                  <p class="text-gray-600 mt-1">上海市浦东新区张江高科技园区</p>
                  <p class="text-xs text-gray-400 mt-1">深海科技大厦 18F</p>
                </div>
              </div>
            </div>
            
            <div class="text-center">
              <Button variant="outline" class="w-full">
                <Globe class="w-4 h-4 mr-2" />
                访问官方网站
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  </Teleport>
</template>
