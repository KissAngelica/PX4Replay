<script setup lang="ts">
import { PLAYBACK_SPEEDS } from '@/flight/PlaybackController'

defineProps<{ playing: boolean; speed: number }>()
defineEmits<{
  toggle: []
  stop: []
  step: [seconds: number]
  boundary: [target: 'start' | 'end']
  speed: [value: number]
}>()
</script>

<template>
  <div class="playback-row">
    <div class="transport-controls">
      <button title="回到开始" aria-label="回到开始" @click="$emit('boundary', 'start')">
        |&lt;
      </button>
      <button title="后退 5 秒" aria-label="后退 5 秒" @click="$emit('step', -5)">−5s</button>
      <button class="primary" @click="$emit('toggle')">{{ playing ? '暂停' : '播放' }}</button>
      <button title="停止" aria-label="停止" @click="$emit('stop')">停止</button>
      <button title="前进 5 秒" aria-label="前进 5 秒" @click="$emit('step', 5)">+5s</button>
      <button title="跳到结束" aria-label="跳到结束" @click="$emit('boundary', 'end')">
        &gt;|
      </button>
    </div>
    <div class="shortcut-hint">空格：播放/暂停 · ←/→：5 秒 · SHIFT：30 秒</div>
    <div class="speed-row">
      <button
        v-for="value in PLAYBACK_SPEEDS"
        :key="value"
        :class="{ selected: speed === value }"
        @click="$emit('speed', value)"
      >
        {{ value }}×
      </button>
    </div>
  </div>
</template>
