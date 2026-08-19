<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { AltitudeMode, FlightData } from '@/flight/types'
import { FlightScene, type SceneSnapshot } from '@/three/FlightScene'
import type { CameraMode } from '@/three/CameraController'
import type { AircraftModel } from '@/three/Aircraft'

const props = defineProps<{
  flightData: FlightData
  aircraftModel: AircraftModel
  aircraftSizeMeters: number
  altitudeMode: AltitudeMode
  showFullPath: boolean
  trailOnly: boolean
  trailLengthSeconds: number
  showGrid: boolean
  showWorldAxes: boolean
  showBodyAxes: boolean
  cameraDistance: number
  cameraLag: number
  cameraMode: CameraMode
}>()
const emit = defineEmits<{ snapshot: [value: SceneSnapshot] }>()

const container = ref<HTMLElement | null>(null)
let flightScene: FlightScene | undefined

function createScene(): void {
  flightScene?.dispose()
  if (!container.value) return
  flightScene = new FlightScene(
    container.value,
    props.flightData,
    (snapshot) => emit('snapshot', snapshot),
    props.aircraftModel,
    props.aircraftSizeMeters,
  )
  flightScene.setFullPathVisible(props.showFullPath)
  flightScene.setTrailOnly(props.trailOnly)
  flightScene.setTrailLengthSeconds(props.trailLengthSeconds)
  flightScene.setGridVisible(props.showGrid)
  flightScene.setWorldAxesVisible(props.showWorldAxes)
  flightScene.setBodyAxesVisible(props.showBodyAxes)
  flightScene.setCameraDistance(props.cameraDistance)
  flightScene.setCameraLag(props.cameraLag)
  flightScene.setCameraMode(props.cameraMode)
  flightScene.setAltitudeMode(props.altitudeMode)
  flightScene.start()
}

defineExpose({
  togglePlayback: () => flightScene?.togglePlayback(),
  resetPlayback: () => flightScene?.resetPlayback(),
  seekPlayback: (timeUs: number) => flightScene?.seekPlayback(timeUs),
  setSpeed: (speed: number) => flightScene?.setSpeed(speed),
  setCameraMode: (mode: CameraMode) => flightScene?.setCameraMode(mode),
  setCameraDistance: (distance: number) => flightScene?.setCameraDistance(distance),
  setCameraLag: (seconds: number) => flightScene?.setCameraLag(seconds),
  setAircraftModel: (model: AircraftModel) => flightScene?.setAircraftModel(model),
  setAircraftSizeMeters: (sizeMeters: number) => flightScene?.setAircraftSizeMeters(sizeMeters),
  setAltitudeMode: (mode: AltitudeMode) => flightScene?.setAltitudeMode(mode),
  setGridVisible: (visible: boolean) => flightScene?.setGridVisible(visible),
  setWorldAxesVisible: (visible: boolean) => flightScene?.setWorldAxesVisible(visible),
  setBodyAxesVisible: (visible: boolean) => flightScene?.setBodyAxesVisible(visible),
  setFullPathVisible: (visible: boolean) => flightScene?.setFullPathVisible(visible),
  setTrailOnly: (enabled: boolean) => flightScene?.setTrailOnly(enabled),
  setTrailLengthSeconds: (seconds: number) => flightScene?.setTrailLengthSeconds(seconds),
  resetCamera: () => flightScene?.resetCamera(),
})

onMounted(createScene)
watch(() => props.flightData, createScene)
watch(
  () => props.cameraMode,
  (mode) => flightScene?.setCameraMode(mode),
)
watch(
  () => props.aircraftModel,
  (model) => flightScene?.setAircraftModel(model),
)
watch(
  () => props.showFullPath,
  (visible) => flightScene?.setFullPathVisible(visible),
)
watch(
  () => props.trailOnly,
  (enabled) => flightScene?.setTrailOnly(enabled),
)
watch(
  () => props.trailLengthSeconds,
  (seconds) => flightScene?.setTrailLengthSeconds(seconds),
)
watch(
  () => props.aircraftSizeMeters,
  (sizeMeters) => flightScene?.setAircraftSizeMeters(sizeMeters),
)
watch(
  () => props.altitudeMode,
  (mode) => flightScene?.setAltitudeMode(mode),
)
watch(
  () => props.showGrid,
  (visible) => flightScene?.setGridVisible(visible),
)
watch(
  () => props.showWorldAxes,
  (visible) => flightScene?.setWorldAxesVisible(visible),
)
watch(
  () => props.showBodyAxes,
  (visible) => flightScene?.setBodyAxesVisible(visible),
)
watch(
  () => props.cameraDistance,
  (distance) => flightScene?.setCameraDistance(distance),
)
watch(
  () => props.cameraLag,
  (seconds) => flightScene?.setCameraLag(seconds),
)
onBeforeUnmount(() => flightScene?.dispose())
</script>

<template>
  <div ref="container" class="flight-view" />
</template>
