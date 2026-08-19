import {
  AmbientLight,
  AxesHelper,
  Clock,
  Color,
  DirectionalLight,
  FogExp2,
  HemisphereLight,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from 'three'
import { AltitudeResolver } from '@/flight/AltitudeResolver'
import type { AltitudeMode, FlightData, FlightFrame } from '@/flight/types'
import { PlaybackController } from '@/flight/PlaybackController'
import { Aircraft, type AircraftModel } from './Aircraft'
import { CameraController, type CameraMode } from './CameraController'
import { createFlightEnvironment } from './FlightEnvironment'
import { createGroundGrid } from './GroundGrid'
import { disposeObject3D, disposeRenderer } from './ThreeResourceManager'
import { Trajectory } from './Trajectory'

export interface SceneSnapshot {
  frame: FlightFrame
  currentTimeUs: number
  durationUs: number
  playing: boolean
  speed: number
  progress: number
  fps: number
}

export class FlightScene {
  private readonly scene = new Scene()
  private readonly camera = new PerspectiveCamera(50, 1, 0.1, 3000)
  private readonly renderer: WebGLRenderer
  private readonly aircraft: Aircraft
  private readonly cameraController: CameraController
  private readonly playback: PlaybackController
  private readonly trajectory: Trajectory
  private readonly clock = new Clock()
  private readonly grid = createGroundGrid()
  private readonly worldAxes = new AxesHelper(18)
  private animationFrame = 0
  private disposed = false
  private lastSnapshotAt = 0
  private fps = 0
  private fpsElapsed = 0
  private fpsFrames = 0
  private pixelRatio = 0
  private readonly resizeObserver: ResizeObserver

  constructor(
    private readonly container: HTMLElement,
    private readonly data: FlightData,
    private readonly onSnapshot: (snapshot: SceneSnapshot) => void,
    model: AircraftModel = 'quadcopter',
    modelSizeMeters = 2,
  ) {
    this.playback = new PlaybackController(data)
    this.aircraft = new Aircraft(model, modelSizeMeters)
    this.trajectory = new Trajectory(data, modelSizeMeters)
    this.scene.background = new Color(0x7897a2)
    this.scene.fog = new FogExp2(0x7897a2, 0.00135)

    this.renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
    this.renderer.outputColorSpace = 'srgb'
    this.renderer.shadowMap.enabled = true
    this.container.appendChild(this.renderer.domElement)

    this.cameraController = new CameraController(this.camera, this.renderer.domElement)
    this.scene.add(new AmbientLight(0xc9dbea, 0.65), new HemisphereLight(0x9ed5f0, 0x52603b, 1.5))
    const sun = new DirectionalLight(0xfff1cf, 2.4)
    sun.position.set(80, 160, 60)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    sun.shadow.camera.left = -220
    sun.shadow.camera.right = 220
    sun.shadow.camera.top = 220
    sun.shadow.camera.bottom = -220
    this.scene.add(
      sun,
      createFlightEnvironment(),
      this.grid,
      this.worldAxes,
      this.trajectory.object,
      this.aircraft.object,
    )

    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(container)
    this.resize()
    this.emitSnapshot(this.playback.frameAt(0), true)
  }

  start(): void {
    this.clock.start()
    this.animate()
  }

  togglePlayback(): void {
    this.playback.toggle()
    this.emitSnapshot(this.playback.frameAt(this.playback.currentTimeUs), true)
  }

  resetPlayback(): void {
    this.playback.reset()
    const frame = this.playback.frameAt(0)
    this.aircraft.update(frame)
    this.trajectory.update(0, frame)
    this.emitSnapshot(frame, true)
  }

  seekPlayback(timeUs: number): void {
    const frame = this.playback.seek(timeUs)
    this.aircraft.update(frame)
    this.trajectory.update(this.playback.currentTimeUs, frame)
    this.emitSnapshot(frame, true)
  }

  setSpeed(speed: number): void {
    this.playback.setSpeed(speed)
    this.emitSnapshot(this.playback.frameAt(this.playback.currentTimeUs), true)
  }

  setCameraMode(mode: CameraMode): void {
    this.cameraController.setMode(mode)
  }

  setCameraDistance(distance: number): void {
    this.cameraController.setDistance(distance)
  }

  setCameraLag(seconds: number): void {
    this.cameraController.setLagSeconds(seconds)
  }

  setAircraftModel(model: AircraftModel): void {
    this.aircraft.setModel(model)
  }

  setAircraftSizeMeters(sizeMeters: number): void {
    this.aircraft.setSizeMeters(sizeMeters)
    this.trajectory.setReferenceSizeMeters(this.aircraft.modelSizeMeters)
  }

  setAltitudeMode(mode: AltitudeMode): void {
    AltitudeResolver.applyMode(this.data, mode)
    this.trajectory.refreshAltitudes(this.data.frames)
    const frame = this.playback.frameAt(this.playback.currentTimeUs)
    this.aircraft.update(frame)
    this.trajectory.update(this.playback.currentTimeUs, frame)
    this.emitSnapshot(frame, true)
  }

  setGridVisible(visible: boolean): void {
    this.grid.visible = visible
  }

  setWorldAxesVisible(visible: boolean): void {
    this.worldAxes.visible = visible
  }

  setBodyAxesVisible(visible: boolean): void {
    this.aircraft.setBodyAxesVisible(visible)
  }

  setFullPathVisible(visible: boolean): void {
    this.trajectory.setFullPathVisible(visible)
  }

  setTrailOnly(enabled: boolean): void {
    this.trajectory.setTrailOnly(enabled)
    this.trajectory.update(
      this.playback.currentTimeUs,
      this.playback.frameAt(this.playback.currentTimeUs),
    )
  }

  setTrailLengthSeconds(seconds: number): void {
    this.trajectory.setTrailLengthSeconds(seconds)
    this.trajectory.update(
      this.playback.currentTimeUs,
      this.playback.frameAt(this.playback.currentTimeUs),
    )
  }

  resetCamera(): void {
    this.cameraController.reset()
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    cancelAnimationFrame(this.animationFrame)
    this.resizeObserver.disconnect()
    this.cameraController.dispose()
    this.aircraft.dispose()
    this.trajectory.dispose()
    disposeObject3D(this.scene)
    this.scene.clear()
    disposeRenderer(this.renderer)
  }

  private animate = (): void => {
    if (this.disposed) return
    const deltaSeconds = Math.min(this.clock.getDelta(), 0.1)
    this.fpsElapsed += deltaSeconds
    this.fpsFrames += 1
    if (this.fpsElapsed >= 0.5) {
      this.fps = this.fpsFrames / this.fpsElapsed
      this.fpsElapsed = 0
      this.fpsFrames = 0
    }
    const frame = this.playback.update(deltaSeconds)
    this.aircraft.update(frame)
    this.trajectory.update(this.playback.currentTimeUs, frame)
    this.cameraController.update(
      deltaSeconds,
      this.aircraft.object.position,
      this.aircraft.object.quaternion,
    )
    this.renderer.render(this.scene, this.camera)
    this.emitSnapshot(frame)
    this.animationFrame = requestAnimationFrame(this.animate)
  }

  private emitSnapshot(frame: FlightFrame, force = false): void {
    const now = performance.now()
    if (!force && now - this.lastSnapshotAt < 50) return
    this.lastSnapshotAt = now
    this.onSnapshot({
      frame,
      currentTimeUs: this.playback.currentTimeUs,
      durationUs: this.playback.durationUs,
      playing: this.playback.isPlaying,
      speed: this.playback.playbackSpeed,
      progress: this.playback.progress,
      fps: this.fps,
    })
  }

  private resize(): void {
    const width = Math.max(this.container.clientWidth, 1)
    const height = Math.max(this.container.clientHeight, 1)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    const nextPixelRatio = Math.min(Math.max(window.devicePixelRatio || 1, 1), 2)
    if (nextPixelRatio !== this.pixelRatio) {
      this.pixelRatio = nextPixelRatio
      this.renderer.setPixelRatio(nextPixelRatio)
    }
    this.renderer.setSize(width, height, false)
  }
}
