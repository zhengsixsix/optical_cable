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
   
    </div>
  </Teleport>
</template>
