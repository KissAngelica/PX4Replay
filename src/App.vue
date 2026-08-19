<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import FlightHUD from '@/components/FlightHUD.vue'
import FlightView from '@/components/FlightView.vue'
import FileDropZone from '@/components/FileDropZone.vue'
import Timeline, { type TimelineMarker } from '@/components/Timeline.vue'
import PlaybackControls from '@/components/PlaybackControls.vue'
import { useFlightFile } from '@/composables/useFlightFile'
import { generateMockFlight, type MockRoute } from '@/mock/generateMockFlight'
import { isTauriRuntime } from '@/services/ParserService'
import type { SceneSnapshot } from '@/three/FlightScene'
import type { AircraftModel } from '@/three/Aircraft'
import type { CameraMode } from '@/three/CameraController'
import { formatTimeUs } from '@/utils/units'
import type { AltitudeMode } from '@/flight/types'

type FlightViewApi = {
  togglePlayback(): void
  resetPlayback(): void
  seekPlayback(timeUs: number): void
  setSpeed(speed: number): void
  setCameraMode(mode: CameraMode): void
  setCameraDistance(distance: number): void
  setCameraLag(seconds: number): void
  setAircraftModel(model: AircraftModel): void
  setAircraftSizeMeters(sizeMeters: number): void
  setAltitudeMode(mode: AltitudeMode): void
  setGridVisible(visible: boolean): void
  setWorldAxesVisible(visible: boolean): void
  setBodyAxesVisible(visible: boolean): void
  setFullPathVisible(visible: boolean): void
  setTrailOnly(enabled: boolean): void
  setTrailLengthSeconds(seconds: number): void
  resetCamera(): void
}

const initialData = generateMockFlight('circle')
const initialFrame = initialData.frames[0]!
const flightData = ref(initialData)
const flightView = ref<FlightViewApi | null>(null)
const route = ref<MockRoute>('circle')
const cameraMode = ref<CameraMode>('free')
const cameraDistance = ref(32)
const cameraLag = ref(0.32)
const aircraftModel = ref<AircraftModel>('quadcopter')
const aircraftSizeMeters = ref(2)
const altitudeMode = ref<AltitudeMode>('fused')
const showGrid = ref(true)
const showWorldAxes = ref(true)
const showBodyAxes = ref(true)
const showFullPath = ref(true)
const trailOnly = ref(false)
const trailLengthSeconds = ref(30)
const snapshot = ref<SceneSnapshot>({
  frame: initialFrame,
  currentTimeUs: 0,
  durationUs: initialData.durationUs,
  playing: true,
  speed: 1,
  progress: 0,
  fps: 0,
})
const {
  status: fileStatus,
  progress: fileProgress,
  error: fileError,
  recentFiles,
  currentData,
  currentPath,
  fileName,
  openPath,
  openPicker,
  clearError,
  useMockData,
} = useFlightFile((data) => {
  flightData.value = data
})
let unlistenNativeDrop: (() => void) | undefined

const displayedFileName = computed(() => fileName.value || `${flightData.value.name} · 模拟`)
const fileSummary = computed(() => {
  const data = currentData.value
  if (!data) return '使用内置飞行数据'
  const bytes = data.metadata?.fileSizeBytes ?? 0
  return `${formatTimeUs(data.durationUs)} · ${formatBytes(bytes)}`
})

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '大小未知'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`
}

function formatAircraftSize(sizeMeters: number): string {
  return sizeMeters < 1 ? `${Math.round(sizeMeters * 100)} 厘米` : `${sizeMeters.toFixed(1)} 米`
}

const timelineMarkers = computed<TimelineMarker[]>(() => {
  const markers: TimelineMarker[] = []
  let previousMode = ''
  let previousArmed = false
  let gpsWasBad = false
  let batteryWasLow = false
  flightData.value.frames.forEach((frame, index) => {
    if (frame.vehicle.flightMode !== previousMode) {
      markers.push({
        id: `mode-${index}`,
        timeUs: frame.timestampUs,
        type: 'mode',
        label: frame.vehicle.flightMode,
      })
      previousMode = frame.vehicle.flightMode
    }
    if (frame.vehicle.armed !== previousArmed) {
      markers.push({
        id: `armed-${index}`,
        timeUs: frame.timestampUs,
        type: 'armed',
        label: frame.vehicle.armed ? '已解锁' : '已锁定',
      })
      previousArmed = frame.vehicle.armed
    }
    const gpsBad = !frame.gps || frame.gps.fixType < 3
    if (gpsBad && !gpsWasBad)
      markers.push({
        id: `gps-${index}`,
        timeUs: frame.timestampUs,
        type: 'warning',
        label: 'GPS 丢失',
      })
    gpsWasBad = gpsBad
    const batteryLow = (frame.battery?.remaining ?? 1) <= 0.2
    if (batteryLow && !batteryWasLow)
      markers.push({
        id: `battery-${index}`,
        timeUs: frame.timestampUs,
        type: 'warning',
        label: '电量低',
      })
    batteryWasLow = batteryLow
  })
  return markers
})

function seek(timeUs: number): void {
  flightView.value?.seekPlayback(timeUs)
}

function step(seconds: number): void {
  seek(snapshot.value.currentTimeUs + seconds * 1_000_000)
}

function boundary(target: 'start' | 'end'): void {
  seek(target === 'start' ? 0 : snapshot.value.durationUs)
}

function onKeyDown(event: KeyboardEvent): void {
  const target = event.target as HTMLElement | null
  if (target?.matches('input, select, textarea, button')) return
  if (event.code === 'Space') {
    event.preventDefault()
    flightView.value?.togglePlayback()
  } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault()
    const amount = event.shiftKey ? 30 : 5
    step(event.key === 'ArrowLeft' ? -amount : amount)
  }
}

function changeCamera(mode: CameraMode): void {
  cameraMode.value = mode
  flightView.value?.setCameraMode(mode)
}

function resetCamera(): void {
  cameraMode.value = 'free'
  flightView.value?.resetCamera()
}

function selectMockRoute(value: MockRoute): void {
  useMockData()
  route.value = value
  flightData.value = generateMockFlight(value)
}

function onRouteChange(event: Event): void {
  selectMockRoute((event.target as HTMLSelectElement).value as MockRoute)
}

function onRecentChange(event: Event): void {
  const path = (event.target as HTMLSelectElement).value
  if (path) void openPath(path)
}

function onBrowserFile(file: File): void {
  if (!file.name.toLowerCase().endsWith('.ulg')) {
    fileError.value = '请选择 .ulg 文件'
    fileStatus.value = 'error'
    return
  }
  const path = (file as File & { path?: string }).path
  if (path) void openPath(path)
  else if (!isTauriRuntime()) {
    fileError.value = '浏览器无法读取本地文件路径，请在桌面应用中使用“打开日志”'
    fileStatus.value = 'error'
  }
}

async function installNativeDropListener(): Promise<void> {
  if (!isTauriRuntime()) return
  const { getCurrentWebview } = await import('@tauri-apps/api/webview')
  unlistenNativeDrop = await getCurrentWebview().onDragDropEvent((event) => {
    if (event.payload.type !== 'drop') return
    const path = event.payload.paths.find((candidate) => candidate.toLowerCase().endsWith('.ulg'))
    if (path) void openPath(path)
    else {
      fileError.value = '拖入的文件中没有 .ulg 日志'
      fileStatus.value = 'error'
    }
  })
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown)
  void installNativeDropListener()
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown)
  unlistenNativeDrop?.()
})
</script>

<template>
  <main class="app-shell">
    <FlightView
      ref="flightView"
      :flight-data="flightData"
      :aircraft-model="aircraftModel"
      :aircraft-size-meters="aircraftSizeMeters"
      :altitude-mode="altitudeMode"
      :show-full-path="showFullPath"
      :trail-only="trailOnly"
      :trail-length-seconds="trailLengthSeconds"
      :show-grid="showGrid"
      :show-world-axes="showWorldAxes"
      :show-body-axes="showBodyAxes"
      :camera-distance="cameraDistance"
      :camera-lag="cameraLag"
      :camera-mode="cameraMode"
      @snapshot="snapshot = $event"
    />
    <FileDropZone @file="onBrowserFile" />

    <header class="topbar panel">
      <div>
        <div class="eyebrow">PX4 飞行回放</div>
        <h1>飞行分析工作台</h1>
      </div>
      <div class="file-toolbar">
        <div class="current-file" :title="displayedFileName">
          <strong>{{ displayedFileName }}</strong>
          <span>{{ fileSummary }}</span>
        </div>
        <button class="open-log-button" @click="openPicker">打开日志</button>
        <label v-if="recentFiles.length">
          最近记录
          <select aria-label="最近打开文件" value="" @change="onRecentChange">
            <option value="" disabled>选择最近日志</option>
            <option v-for="item in recentFiles" :key="item.path" :value="item.path">
              {{ item.name }}
            </option>
          </select>
        </label>
        <label>
          模拟航线
          <select :value="route" @change="onRouteChange">
            <option value="circle">环形任务</option>
            <option value="line">直线飞行</option>
            <option value="climb">螺旋爬升</option>
          </select>
        </label>
      </div>
    </header>

    <div v-if="fileStatus === 'selecting' || fileStatus === 'parsing'" class="loading-overlay">
      <div class="loading-card panel">
        <div class="eyebrow">
          {{ fileStatus === 'selecting' ? '选择日志' : '解析 ULog' }}
        </div>
        <strong>{{ fileStatus === 'selecting' ? '等待选择文件…' : '正在解析飞行数据…' }}</strong>
        <div class="loading-track"><span :style="{ width: `${fileProgress}%` }" /></div>
      </div>
    </div>
    <div v-if="fileStatus === 'error'" class="file-error" role="alert">
      <span>{{ fileError }}</span
      ><button aria-label="关闭错误提示" @click="clearError">×</button>
    </div>

    <FlightHUD
      :snapshot="snapshot"
      :topic-fields="flightData.metadata?.topicFields"
      :ulog-path="currentPath"
      :log-start-timestamp-us="flightData.metadata?.logStartTimestampUs"
    />

    <section class="camera-panel panel">
      <div class="eyebrow">相机</div>
      <div class="button-row">
        <button :class="{ selected: cameraMode === 'free' }" @click="changeCamera('free')">
          自由
        </button>
        <button :class="{ selected: cameraMode === 'follow' }" @click="changeCamera('follow')">
          跟随
        </button>
        <button :class="{ selected: cameraMode === 'chase' }" @click="changeCamera('chase')">
          追尾
        </button>
        <button :class="{ selected: cameraMode === 'fpv' }" @click="changeCamera('fpv')">
          第一视角
        </button>
        <button @click="resetCamera">重置</button>
      </div>
      <p>左键旋转 · 滚轮缩放 · 右键平移</p>
      <template v-if="cameraMode !== 'free'">
        <label class="scale-control">
          <span>相机距离</span>
          <output>{{ cameraDistance }} m</output>
          <input
            v-model.number="cameraDistance"
            type="range"
            min="8"
            max="100"
            step="1"
            aria-label="相机距离"
          />
        </label>
        <label class="scale-control">
          <span>跟随延迟</span>
          <output>{{ cameraLag.toFixed(2) }} s</output>
          <input
            v-model.number="cameraLag"
            type="range"
            min="0"
            max="2"
            step="0.05"
            aria-label="跟随延迟"
          />
        </label>
      </template>
      <div class="setting-divider" />
      <div class="eyebrow">飞机模型</div>
      <label class="model-select-label">
        类型
        <select v-model="aircraftModel">
          <option value="fixed-wing">固定翼</option>
          <option value="quadcopter">四旋翼</option>
          <option value="helicopter">直升机</option>
        </select>
      </label>
      <label class="scale-control" :class="{ 'is-locked': snapshot.playing }">
        <span>机体最大水平尺寸</span>
        <output>{{ formatAircraftSize(aircraftSizeMeters) }}</output>
        <input
          v-model.number="aircraftSizeMeters"
          type="range"
          min="0.1"
          max="10"
          step="0.1"
          aria-label="机体最大水平尺寸"
          :disabled="snapshot.playing"
          :title="snapshot.playing ? '暂停回放后可调整模型大小' : '调整飞机相对地面参照的大小'"
        />
        <small class="scale-lock-hint">
          {{ snapshot.playing ? '暂停回放后可调整' : '真实世界比例 · 最小网格 1 米' }}
        </small>
      </label>
      <div class="body-axis-legend" aria-label="机体系三轴图例">
        <span class="axis-x">X</span><small>右</small> <span class="axis-y">Y</span
        ><small>上</small> <span class="axis-z">Z</span><small>前</small>
      </div>
      <div class="setting-divider" />
      <div class="eyebrow">高度源</div>
      <div class="altitude-mode-options">
        <button :class="{ selected: altitudeMode === 'fused' }" @click="altitudeMode = 'fused'">
          融合修正
        </button>
        <button :class="{ selected: altitudeMode === 'ekf' }" @click="altitudeMode = 'ekf'">
          原始 EKF
        </button>
        <button :class="{ selected: altitudeMode === 'gps' }" @click="altitudeMode = 'gps'">
          GPS
        </button>
      </div>
      <small class="altitude-mode-note">
        {{
          altitudeMode === 'fused'
            ? 'EKF 快速变化 + GPS 低频漂移修正（默认）'
            : altitudeMode === 'ekf'
              ? '保留 EKF Local Z 漂移，用于分析'
              : 'GPS 相对高度，可能存在上下抖动'
        }}
      </small>
      <div class="setting-divider" />
      <div class="eyebrow">场景辅助</div>
      <div class="overlay-toggles">
        <button :class="{ selected: showGrid }" @click="showGrid = !showGrid">网格</button>
        <button :class="{ selected: showWorldAxes }" @click="showWorldAxes = !showWorldAxes">
          世界轴
        </button>
        <button :class="{ selected: showBodyAxes }" @click="showBodyAxes = !showBodyAxes">
          机体轴
        </button>
      </div>
      <small class="altitude-mode-note">
        地面网格 = 起飞参考面 0 米；青色线 = 飞行轨迹；绿色竖线 = 世界坐标 Y 轴
      </small>
    </section>

    <section class="trajectory-panel panel">
      <div class="eyebrow">航迹</div>
      <div class="button-row">
        <button :class="{ selected: showFullPath }" @click="showFullPath = !showFullPath">
          完整航迹
        </button>
        <button :class="{ selected: trailOnly }" @click="trailOnly = !trailOnly">仅尾迹</button>
      </div>
      <label class="scale-control">
        <span>尾迹时长</span>
        <output>{{ trailLengthSeconds }} s</output>
        <input
          v-model.number="trailLengthSeconds"
          type="range"
          min="5"
          max="120"
          step="5"
          aria-label="尾迹时长"
        />
      </label>
      <div
        class="trajectory-legend"
        title="绿色圆锥为日志起点，黄色标记为 HOME 点，红色圆锥为日志终点"
      >
        <span class="legend-start" /> 起点 <span class="legend-home" /> 返航点
        <span class="legend-end" /> 终点
      </div>
      <small class="marker-scale-note">标记尺寸随飞机物理尺寸同步变化</small>
    </section>

    <footer class="playback panel">
      <Timeline
        :current-time-us="snapshot.currentTimeUs"
        :duration-us="snapshot.durationUs"
        :markers="timelineMarkers"
        @seek="seek"
      />
      <PlaybackControls
        :playing="snapshot.playing"
        :speed="snapshot.speed"
        @toggle="flightView?.togglePlayback()"
        @stop="flightView?.resetPlayback()"
        @step="step"
        @boundary="boundary"
        @speed="flightView?.setSpeed($event)"
      />
    </footer>
  </main>
</template>
