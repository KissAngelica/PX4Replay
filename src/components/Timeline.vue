<script setup lang="ts">
import { computed, ref } from 'vue'
import { formatTimeUs } from '@/utils/units'

defineOptions({ name: 'PlaybackTimeline' })

export interface TimelineMarker {
  id: string
  timeUs: number
  type: 'mode' | 'armed' | 'warning' | 'event'
  label: string
}

const props = withDefaults(
  defineProps<{ currentTimeUs: number; durationUs: number; markers?: TimelineMarker[] }>(),
  { markers: () => [] },
)
const emit = defineEmits<{ seek: [timeUs: number] }>()
const track = ref<HTMLElement | null>(null)
const dragging = ref(false)
const progress = computed(() =>
  props.durationUs > 0 ? Math.min(Math.max(props.currentTimeUs / props.durationUs, 0), 1) : 0,
)

function markerPosition(timeUs: number): number {
  if (props.durationUs <= 0) return 0
  return Math.min(Math.max((timeUs / props.durationUs) * 100, 0), 100)
}

function seekAt(clientX: number): void {
  const bounds = track.value?.getBoundingClientRect()
  if (!bounds || bounds.width <= 0) return
  const ratio = Math.min(Math.max((clientX - bounds.left) / bounds.width, 0), 1)
  emit('seek', Math.round(ratio * props.durationUs))
}

function onPointerDown(event: PointerEvent): void {
  dragging.value = true
  track.value?.setPointerCapture(event.pointerId)
  seekAt(event.clientX)
}

function onPointerMove(event: PointerEvent): void {
  if (dragging.value) seekAt(event.clientX)
}

function onPointerUp(event: PointerEvent): void {
  if (!dragging.value) return
  dragging.value = false
  seekAt(event.clientX)
  track.value?.releasePointerCapture(event.pointerId)
}
</script>

<template>
  <div class="timeline-shell">
    <time>{{ formatTimeUs(currentTimeUs) }}</time>
    <div
      ref="track"
      class="timeline-track"
      role="slider"
      aria-label="回放时间轴"
      :aria-valuemin="0"
      :aria-valuemax="durationUs"
      :aria-valuenow="currentTimeUs"
      tabindex="0"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="dragging = false"
    >
      <div class="timeline-marker-lane">
        <span
          v-for="marker in markers"
          :key="marker.id"
          :class="['timeline-marker', `marker-${marker.type}`]"
          :style="{ left: `${markerPosition(marker.timeUs)}%` }"
          :title="marker.label"
        />
      </div>
      <div class="timeline-progress" :style="{ width: `${progress * 100}%` }" />
      <div class="timeline-thumb" :style="{ left: `${progress * 100}%` }" />
    </div>
    <time>{{ formatTimeUs(durationUs) }}</time>
  </div>
</template>
