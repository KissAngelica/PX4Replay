<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

const emit = defineEmits<{ file: [file: File] }>()
const active = ref(false)
let dragDepth = 0

function enter(event: DragEvent): void {
  event.preventDefault()
  dragDepth += 1
  active.value = true
}
function leave(event: DragEvent): void {
  event.preventDefault()
  dragDepth = Math.max(0, dragDepth - 1)
  if (dragDepth === 0) active.value = false
}
function over(event: DragEvent): void {
  event.preventDefault()
}
function drop(event: DragEvent): void {
  event.preventDefault()
  dragDepth = 0
  active.value = false
  const file = event.dataTransfer?.files[0]
  if (file) emit('file', file)
}

onMounted(() => {
  window.addEventListener('dragenter', enter)
  window.addEventListener('dragleave', leave)
  window.addEventListener('dragover', over)
  window.addEventListener('drop', drop)
})
onBeforeUnmount(() => {
  window.removeEventListener('dragenter', enter)
  window.removeEventListener('dragleave', leave)
  window.removeEventListener('dragover', over)
  window.removeEventListener('drop', drop)
})
</script>

<template>
  <div v-if="active" class="file-drop-overlay">
    <div>
      <strong>拖入 PX4 ULog</strong>
      <span>释放以解析 .ulg 飞行日志</span>
    </div>
  </div>
</template>
