import { PerspectiveCamera, Quaternion, Vector3 } from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

export type CameraMode = 'free' | 'follow' | 'chase' | 'fpv'

const INITIAL_POSITION = new Vector3(115, 90, 145)
const WORLD_UP = new Vector3(0, 1, 0)

export class CameraController {
  readonly controls: OrbitControls
  private mode: CameraMode = 'free'
  private distance = 32
  private lagSeconds = 0.32
  private readonly followOffset = new Vector3()
  private readonly desiredPosition = new Vector3()
  private readonly lookTarget = new Vector3()
  private readonly lookOffset = new Vector3(0, 1.2, 0)
  private readonly headingForward = new Vector3()
  private readonly bodyForward = new Vector3(0, 0, 1)
  private readonly fpvOffset = new Vector3(0, 0.72, 1.05)
  private readonly fpvWorldOffset = new Vector3()
  private readonly fpvRotation = new Quaternion().setFromAxisAngle(WORLD_UP, Math.PI)
  private readonly desiredQuaternion = new Quaternion()

  constructor(
    private readonly camera: PerspectiveCamera,
    element: HTMLElement,
  ) {
    this.controls = new OrbitControls(camera, element)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.075
    this.controls.screenSpacePanning = true
    this.controls.minDistance = 4
    this.controls.maxDistance = 900
    this.controls.maxPolarAngle = Math.PI * 0.495
    this.updateFollowOffset()
    this.reset()
  }

  get currentMode(): CameraMode {
    return this.mode
  }

  setMode(mode: CameraMode): void {
    this.mode = mode
    this.controls.enabled = mode === 'free'
  }

  setDistance(distance: number): void {
    if (!Number.isFinite(distance)) return
    this.distance = Math.min(Math.max(distance, 8), 100)
    this.updateFollowOffset()
  }

  setLagSeconds(seconds: number): void {
    if (Number.isFinite(seconds)) this.lagSeconds = Math.min(Math.max(seconds, 0), 2)
  }

  reset(): void {
    this.setMode('free')
    this.camera.position.copy(INITIAL_POSITION)
    this.controls.target.set(0, 24, 0)
    this.controls.update()
  }

  update(deltaSeconds: number, target: Vector3, attitude: Quaternion): void {
    if (this.mode === 'free') {
      this.controls.update()
      return
    }

    const smoothness =
      this.lagSeconds <= 0 ? 1 : 1 - Math.exp(-deltaSeconds / Math.max(this.lagSeconds, 0.01))

    if (this.mode === 'follow') {
      this.desiredPosition.copy(target).add(this.followOffset)
      this.camera.position.lerp(this.desiredPosition, smoothness)
      this.lookTarget.copy(target).add(this.lookOffset)
      this.camera.lookAt(this.lookTarget)
      return
    }

    if (this.mode === 'chase') {
      this.headingForward.copy(this.bodyForward).applyQuaternion(attitude)
      this.headingForward.y = 0
      if (this.headingForward.lengthSq() < 1e-8) this.headingForward.set(0, 0, 1)
      else this.headingForward.normalize()
      this.desiredPosition.copy(target).addScaledVector(this.headingForward, -this.distance)
      this.desiredPosition.y += Math.max(5, this.distance * 0.32)
      this.camera.position.lerp(this.desiredPosition, smoothness)
      this.lookTarget.copy(target).add(this.lookOffset)
      this.camera.lookAt(this.lookTarget)
      return
    }

    this.fpvWorldOffset.copy(this.fpvOffset).applyQuaternion(attitude)
    this.desiredPosition.copy(target).add(this.fpvWorldOffset)
    this.camera.position.lerp(this.desiredPosition, smoothness)
    this.desiredQuaternion.copy(attitude).multiply(this.fpvRotation)
    this.camera.quaternion.slerp(this.desiredQuaternion, smoothness)
  }

  dispose(): void {
    this.controls.dispose()
  }

  private updateFollowOffset(): void {
    this.followOffset.set(-this.distance * 0.45, this.distance * 0.32, -this.distance * 0.78)
  }
}
