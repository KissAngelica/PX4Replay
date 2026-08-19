<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import type { UlogFieldValue, UlogTopicSeries } from '@/flight/types'
import { parseUlogTopic } from '@/services/ParserService'
import type { SceneSnapshot } from '@/three/FlightScene'
import { formatNumber, formatPercent, formatTimeUs, radiansToDegrees } from '@/utils/units'

type HudTopic =
  | 'vehicle_status'
  | 'vehicle_local_position'
  | 'vehicle_attitude'
  | 'vehicle_global_position'
  | 'vehicle_gps_position'
  | 'battery_status'

const props = defineProps<{
  snapshot: SceneSnapshot
  topicFields?: Record<string, string[]>
  ulogPath?: string
  logStartTimestampUs?: number
}>()
const showSettings = ref(false)
const topicSearch = ref('')
const expandedTopics = reactive(new Set<string>())
const selectedRawFields = reactive(new Set<string>())
const topicSeries = reactive(new Map<string, UlogTopicSeries>())
const loadingFields = reactive(new Set<string>())
const topicError = ref('')

watch(
  () => props.ulogPath,
  () => {
    expandedTopics.clear()
    selectedRawFields.clear()
    topicSeries.clear()
    loadingFields.clear()
    topicError.value = ''
  },
)
const visible = reactive<Record<HudTopic, boolean>>({
  vehicle_status: true,
  vehicle_local_position: true,
  vehicle_attitude: true,
  vehicle_global_position: true,
  vehicle_gps_position: true,
  battery_status: true,
})

const filteredTopics = computed(() => {
  const query = topicSearch.value.trim().toLowerCase()
  return Object.entries(props.topicFields ?? {})
    .filter(([topic]) => !query || topic.toLowerCase().includes(query))
    .sort(([first], [second]) => first.localeCompare(second))
})

const selectedFields = computed(() =>
  Array.from(selectedRawFields, (key) => {
    const separator = key.indexOf('\u0000')
    return { topic: key.slice(0, separator), field: key.slice(separator + 1) }
  }),
)

const gpsBad = computed(() => !props.snapshot.frame.gps || props.snapshot.frame.gps.fixType < 3)
const batteryLow = computed(
  () => props.snapshot.frame.battery !== undefined && props.snapshot.frame.battery.remaining <= 0.2,
)
const ended = computed(
  () =>
    props.snapshot.durationUs > 0 &&
    props.snapshot.currentTimeUs >= props.snapshot.durationUs &&
    !props.snapshot.playing,
)

function gpsFixLabel(fixType: number | undefined): string {
  if (fixType === undefined) return '--'
  return ['NO FIX', 'DR', '2D', '3D', 'DGPS', 'RTK FLOAT', 'RTK FIX'][fixType] ?? `FIX ${fixType}`
}

function fieldKey(topic: string, field: string): string {
  return `${topic}\u0000${field}`
}

function toggleTopic(topic: string): void {
  if (expandedTopics.has(topic)) expandedTopics.delete(topic)
  else expandedTopics.add(topic)
}

async function ensureTopicFieldLoaded(topic: string, field: string): Promise<void> {
  const key = fieldKey(topic, field)
  if (!props.ulogPath || topicSeries.get(topic)?.fields[field] || loadingFields.has(key)) return
  loadingFields.add(key)
  topicError.value = ''
  try {
    const loaded = await parseUlogTopic(props.ulogPath, topic, field)
    const existing = topicSeries.get(topic)
    if (existing) existing.fields[field] = loaded.fields[field] ?? []
    else topicSeries.set(topic, loaded)
  } catch (reason) {
    topicError.value = reason instanceof Error ? reason.message : String(reason)
  } finally {
    loadingFields.delete(key)
  }
}

function toggleRawField(topic: string, field: string, checked: boolean): void {
  const key = fieldKey(topic, field)
  if (checked) {
    selectedRawFields.add(key)
    void ensureTopicFieldLoaded(topic, field)
  } else selectedRawFields.delete(key)
}

function previousSampleIndex(timestamps: number[], timestampUs: number): number {
  if (!timestamps.length) return -1
  if (timestampUs < timestamps[0]!) return -1
  let low = 0
  let high = timestamps.length
  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    if (timestamps[middle]! <= timestampUs) low = middle + 1
    else high = middle
  }
  return Math.max(0, low - 1)
}

function normalizedFieldValue(topic: string, field: string): UlogFieldValue | undefined {
  const frame = props.snapshot.frame
  const values: Record<string, Record<string, UlogFieldValue | undefined>> = {
    vehicle_local_position: {
      x: frame.localPosition.north,
      y: frame.localPosition.east,
      z: frame.localPosition.down,
      vx: frame.velocity.north,
      vy: frame.velocity.east,
      vz: frame.velocity.down,
    },
    vehicle_attitude: {
      'q[0]': frame.attitude.quaternion.w,
      'q[1]': frame.attitude.quaternion.x,
      'q[2]': frame.attitude.quaternion.y,
      'q[3]': frame.attitude.quaternion.z,
    },
    vehicle_status: {
      arming_state: frame.vehicle.armed ? 2 : 1,
    },
    vehicle_global_position: {
      lat: frame.globalPosition?.latitude,
      lon: frame.globalPosition?.longitude,
      alt: frame.globalPosition?.altitudeMsl,
    },
    vehicle_gps_position: {
      satellites_used: frame.gps?.satellites,
      fix_type: frame.gps?.fixType,
      latitude_deg: frame.gps?.latitude,
      longitude_deg: frame.gps?.longitude,
      altitude_msl_m: frame.gps?.altitudeMsl,
      altitude_ellipsoid_m: frame.gps?.altitudeEllipsoid,
    },
    battery_status: {
      voltage_v: frame.battery?.voltage,
      current_a: frame.battery?.current,
      remaining: frame.battery?.remaining,
    },
  }
  return values[topic]?.[field]
}

function rawFieldValue(topic: string, field: string): string {
  const series = topicSeries.get(topic)
  let value: UlogFieldValue | undefined
  if (series) {
    const rawTimestampUs = (props.logStartTimestampUs ?? 0) + props.snapshot.currentTimeUs
    const index = previousSampleIndex(series.timestampsUs, rawTimestampUs)
    value = index >= 0 ? series.fields[field]?.[index] : undefined
  } else value = normalizedFieldValue(topic, field)
  if (value === undefined) return loadingFields.has(fieldKey(topic, field)) ? '加载中…' : '--'
  if (value === null) return 'null'
  if (Array.isArray(value)) return JSON.stringify(value)
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '--'
    return Number.isInteger(value)
      ? String(value)
      : value.toFixed(6).replace(/0+$/, '').replace(/\.$/, '')
  }
  return String(value)
}
</script>

<template>
  <aside class="hud panel">
    <div class="hud-heading">
      <div class="eyebrow">飞行遥测</div>
      <output class="fps-counter" :class="{ warning: snapshot.fps > 0 && snapshot.fps < 30 }">
        {{ snapshot.fps > 0 ? `${Math.round(snapshot.fps)} FPS` : '-- FPS' }}
      </output>
      <button
        class="hud-config-button"
        aria-label="选择 HUD 数据"
        @click="showSettings = !showSettings"
      >
        数据
      </button>
    </div>

    <div v-if="showSettings" class="hud-settings">
      <div class="hud-settings-title">选择真实 ULog Topic 字段</div>
      <input v-model="topicSearch" class="topic-search" type="search" placeholder="搜索 Topic" />
      <div class="topic-tree">
        <div v-for="[topic, fields] in filteredTopics" :key="topic" class="topic-node">
          <button class="topic-toggle" @click="toggleTopic(topic)">
            <span>{{ expandedTopics.has(topic) ? '▾' : '▸' }}</span>
            <code>{{ topic }}</code>
            <small>{{ fields.length }}</small>
          </button>
          <div v-if="expandedTopics.has(topic)" class="topic-fields">
            <label v-for="field in fields" :key="field">
              <input
                type="checkbox"
                :checked="selectedRawFields.has(fieldKey(topic, field))"
                @change="toggleRawField(topic, field, ($event.target as HTMLInputElement).checked)"
              />
              <code>{{ field }}</code>
            </label>
          </div>
        </div>
      </div>
      <div v-if="topicError" class="topic-error">{{ topicError }}</div>
      <p>勾选字段后会按需读取该 Topic，并在 HUD 底部显示当前回放时刻之前的最新样本。</p>
    </div>

    <div v-if="visible.vehicle_status" class="mode-row">
      <strong>{{ snapshot.frame.vehicle.flightMode || '--' }}</strong>
      <span :class="['armed-state', { active: snapshot.frame.vehicle.armed }]">
        {{ snapshot.frame.vehicle.armed ? 'ARMED' : 'DISARMED' }}
      </span>
    </div>

    <div class="status-chips">
      <span v-if="gpsBad" class="status-chip warning">GPS NO FIX</span>
      <span v-if="batteryLow" class="status-chip danger">电量低</span>
      <span v-if="ended" class="status-chip ended">日志结束</span>
    </div>

    <dl>
      <dt>TIME</dt>
      <dd>{{ formatTimeUs(snapshot.currentTimeUs) }}</dd>

      <template v-if="visible.vehicle_local_position">
        <dt>ALT DISPLAY</dt>
        <dd>{{ formatNumber(snapshot.frame.altitude?.display, 1, 'm') }}</dd>
        <dt>ALT EKF</dt>
        <dd>{{ formatNumber(snapshot.frame.altitude?.ekfRelative, 1, 'm') }}</dd>
        <dt>ALT GPS</dt>
        <dd>{{ formatNumber(snapshot.frame.altitude?.gpsRelative, 1, 'm') }}</dd>
        <dt>ALT BIAS</dt>
        <dd>{{ formatNumber(snapshot.frame.altitude?.estimatedBias, 2, 'm') }}</dd>
        <dt title="水平地速：√(VN² + VE²)，不包含垂直速度">GND SPEED</dt>
        <dd>{{ formatNumber(snapshot.frame.groundSpeed, 1, 'm/s') }}</dd>
        <dt>NORTH</dt>
        <dd>{{ formatNumber(snapshot.frame.localPosition.north, 1, 'm') }}</dd>
        <dt>EAST</dt>
        <dd>{{ formatNumber(snapshot.frame.localPosition.east, 1, 'm') }}</dd>
        <dt>DOWN</dt>
        <dd>{{ formatNumber(snapshot.frame.localPosition.down, 1, 'm') }}</dd>
        <dt>VN</dt>
        <dd>{{ formatNumber(snapshot.frame.velocity.north, 1, 'm/s') }}</dd>
        <dt>VE</dt>
        <dd>{{ formatNumber(snapshot.frame.velocity.east, 1, 'm/s') }}</dd>
        <dt>VD</dt>
        <dd>{{ formatNumber(snapshot.frame.velocity.down, 1, 'm/s') }}</dd>
      </template>

      <template v-if="visible.vehicle_attitude">
        <dt>ROLL</dt>
        <dd>{{ radiansToDegrees(snapshot.frame.attitude.roll) }}</dd>
        <dt>PITCH</dt>
        <dd>{{ radiansToDegrees(snapshot.frame.attitude.pitch) }}</dd>
        <dt>YAW</dt>
        <dd>{{ radiansToDegrees(snapshot.frame.attitude.yaw, true) }}</dd>
      </template>

      <template v-if="visible.vehicle_global_position">
        <dt>LAT</dt>
        <dd>{{ formatNumber(snapshot.frame.globalPosition?.latitude, 6, '°') }}</dd>
        <dt>LON</dt>
        <dd>{{ formatNumber(snapshot.frame.globalPosition?.longitude, 6, '°') }}</dd>
        <dt>MSL ALT</dt>
        <dd>{{ formatNumber(snapshot.frame.globalPosition?.altitudeMsl, 1, 'm') }}</dd>
      </template>

      <template v-if="visible.vehicle_gps_position">
        <dt>GPS</dt>
        <dd>{{ formatNumber(snapshot.frame.gps?.satellites, 0, 'SAT') }}</dd>
        <dt>GPS FIX</dt>
        <dd :class="{ 'warning-text': gpsBad }">{{ gpsFixLabel(snapshot.frame.gps?.fixType) }}</dd>
      </template>

      <template v-if="visible.battery_status">
        <dt>BAT VOLT</dt>
        <dd>{{ formatNumber(snapshot.frame.battery?.voltage, 1, 'V') }}</dd>
        <dt>BAT CURR</dt>
        <dd>{{ formatNumber(snapshot.frame.battery?.current, 1, 'A') }}</dd>
        <dt>BAT REM</dt>
        <dd :class="{ 'danger-text': batteryLow }">
          {{ formatPercent(snapshot.frame.battery?.remaining) }}
        </dd>
      </template>

      <template v-for="item in selectedFields" :key="fieldKey(item.topic, item.field)">
        <dt class="raw-topic-field" :title="`${item.topic}.${item.field}`">
          {{ item.topic }}.{{ item.field }}
        </dt>
        <dd class="raw-topic-value">{{ rawFieldValue(item.topic, item.field) }}</dd>
      </template>
    </dl>
  </aside>
</template>
