import {
  ArrowHelper,
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three'
import type { FlightFrame } from '@/flight/types'
import { disposeObject3D } from './ThreeResourceManager'
import { CoordinateConverter } from './CoordinateConverter'

export type AircraftModel = 'fixed-wing' | 'quadcopter' | 'helicopter'

const material = (color: number, metalness = 0.15): MeshStandardMaterial =>
  new MeshStandardMaterial({ color, roughness: 0.46, metalness })

export const BODY_AXIS_COLORS = Object.freeze({
  rightX: 0xff4d4d,
  upY: 0x65e572,
  forwardZ: 0x4dabff,
})

function addBodyAxes(group: Group, length: number): void {
  const axes = new Group()
  axes.name = 'Body axes: X Right, Y Up, Z Forward'

  const definitions = [
    ['Body X / Right', new Vector3(1, 0, 0), BODY_AXIS_COLORS.rightX],
    ['Body Y / Up', new Vector3(0, 1, 0), BODY_AXIS_COLORS.upY],
    ['Body Z / Forward', new Vector3(0, 0, 1), BODY_AXIS_COLORS.forwardZ],
  ] as const

  definitions.forEach(([name, direction, color]) => {
    const arrow = new ArrowHelper(
      direction,
      new Vector3(),
      length,
      color,
      length * 0.18,
      length * 0.11,
    )
    arrow.name = name
    axes.add(arrow)
  })
  group.add(axes)
}

function createFixedWing(): Group {
  const group = new Group()
  group.name = 'Fixed wing (+Z forward)'
  const body = new Mesh(new BoxGeometry(1.4, 0.62, 4.2), material(0xe8f5fa, 0.25))
  const nose = new Mesh(new ConeGeometry(0.72, 1.8, 12), material(0xff735c))
  nose.rotation.x = Math.PI / 2
  nose.position.z = 2.85
  const wing = new Mesh(new BoxGeometry(6.3, 0.15, 1.15), material(0x132b38))
  wing.position.z = 0.1
  const tailWing = new Mesh(new BoxGeometry(2.7, 0.12, 0.62), material(0xff735c))
  tailWing.position.z = -1.65
  const tail = new Mesh(new BoxGeometry(0.16, 1.25, 0.8), material(0x132b38))
  tail.position.set(0, 0.55, -1.65)
  group.add(body, nose, wing, tailWing, tail)
  addBodyAxes(group, 4.8)
  return group
}

function createQuadcopter(): Group {
  const group = new Group()
  group.name = 'Quadcopter (+Z forward)'
  const body = new Mesh(new SphereGeometry(0.9, 18, 10), material(0x243e4c, 0.35))
  body.scale.set(1, 0.46, 1.35)
  const nose = new Mesh(new ConeGeometry(0.58, 1.55, 12), material(0xff5f48))
  nose.rotation.x = Math.PI / 2
  nose.position.z = 1.75
  const tailBoom = new Mesh(new BoxGeometry(0.24, 0.18, 1.9), material(0x6e8992))
  tailBoom.position.z = -1.55
  const tailFin = new Mesh(new BoxGeometry(0.14, 0.95, 0.62), material(0x54d9ed))
  tailFin.position.set(0, 0.45, -2.35)
  const armA = new Mesh(new BoxGeometry(0.18, 0.14, 5.6), material(0xb7c9ce, 0.3))
  armA.rotation.y = Math.PI / 4
  const armB = new Mesh(new BoxGeometry(0.18, 0.14, 5.6), material(0xb7c9ce, 0.3))
  armB.rotation.y = -Math.PI / 4
  group.add(body, nose, tailBoom, tailFin, armA, armB)

  const rotorPositions = [
    [-2, 0.16, 2],
    [2, 0.16, 2],
    [-2, 0.16, -2],
    [2, 0.16, -2],
  ] as const
  rotorPositions.forEach(([x, y, z], index) => {
    const front = z > 0
    const motor = new Mesh(
      new CylinderGeometry(0.24, 0.3, 0.38, 12),
      material(front ? 0xff735c : 0x244653),
    )
    motor.position.set(x, y, z)
    const rotorColor = front ? (index === 0 ? 0xffd166 : 0xff735c) : 0x54d9ed
    const rotor = new Mesh(new TorusGeometry(0.78, 0.055, 6, 28), material(rotorColor))
    rotor.rotation.x = Math.PI / 2
    rotor.position.set(x, y + 0.25, z)
    group.add(motor, rotor)
  })
  addBodyAxes(group, 4.6)
  return group
}

function createHelicopter(): Group {
  const group = new Group()
  group.name = 'Helicopter (+Z forward)'
  const cabin = new Mesh(new SphereGeometry(1.05, 18, 12), material(0xe6f3f5, 0.25))
  cabin.scale.set(0.95, 0.8, 1.45)
  cabin.position.z = 0.9
  const windscreen = new Mesh(new SphereGeometry(0.72, 16, 10), material(0x1c9bb8, 0.4))
  windscreen.scale.set(0.93, 0.65, 0.7)
  windscreen.position.set(0, 0.08, 1.78)
  const tailBoom = new Mesh(new ConeGeometry(0.35, 4.2, 8), material(0x536b74))
  tailBoom.rotation.x = -Math.PI / 2
  tailBoom.position.set(0, 0.1, -1.75)
  const tailFin = new Mesh(new BoxGeometry(0.14, 1.45, 0.82), material(0xff735c))
  tailFin.position.set(0, 0.65, -3.55)
  const mast = new Mesh(new CylinderGeometry(0.1, 0.12, 1.1, 10), material(0xb8cbd0, 0.35))
  mast.position.y = 1.15
  const mainRotor = new Mesh(new BoxGeometry(7.2, 0.055, 0.18), material(0x54d9ed, 0.4))
  mainRotor.position.y = 1.72
  const skidLeft = new Mesh(new BoxGeometry(0.12, 0.12, 3.3), material(0x172b34, 0.4))
  skidLeft.position.set(-0.85, -0.88, 0.25)
  const skidRight = new Mesh(new BoxGeometry(0.12, 0.12, 3.3), material(0x172b34, 0.4))
  skidRight.position.set(0.85, -0.88, 0.25)
  group.add(cabin, windscreen, tailBoom, tailFin, mast, mainRotor, skidLeft, skidRight)
  addBodyAxes(group, 4.8)
  return group
}

const modelFactories: Record<AircraftModel, () => Group> = {
  'fixed-wing': createFixedWing,
  quadcopter: createQuadcopter,
  helicopter: createHelicopter,
}

// The procedural geometry uses metre-like units. These values are the exact
// maximum horizontal footprint (X/Z) of each unscaled visual, excluding axes.
export const AIRCRAFT_BASE_FOOTPRINT_METERS: Readonly<Record<AircraftModel, number>> =
  Object.freeze({
    'fixed-wing': 6.3,
    quadcopter: 5.67,
    helicopter: 7.2,
  })

export const AIRCRAFT_SIZE_RANGE_METERS = Object.freeze({ min: 0.1, max: 10 })

export class Aircraft {
  readonly object = new Group()
  private visual: Group
  private selectedModel: AircraftModel
  private selectedSizeMeters: number
  private bodyAxesVisible = true

  constructor(model: AircraftModel = 'quadcopter', sizeMeters = 2) {
    this.object.name = 'Aircraft transform'
    this.selectedModel = model
    this.selectedSizeMeters = sizeMeters
    this.visual = modelFactories[model]()
    this.object.add(this.visual)
    this.setSizeMeters(sizeMeters)
  }

  get currentModel(): AircraftModel {
    return this.selectedModel
  }
  get modelSizeMeters(): number {
    return this.selectedSizeMeters
  }

  setModel(model: AircraftModel): void {
    if (model === this.selectedModel) return
    const nextVisual = modelFactories[model]()
    // Keep the observation scale on the visual only. The transform root remains
    // at world scale so position, trajectory, runway and grid stay in metres.
    nextVisual.scale.setScalar(this.selectedSizeMeters / AIRCRAFT_BASE_FOOTPRINT_METERS[model])
    this.object.remove(this.visual)
    disposeObject3D(this.visual)
    this.visual = nextVisual
    this.selectedModel = model
    this.object.add(nextVisual)
    this.setBodyAxesVisible(this.bodyAxesVisible)
  }

  setSizeMeters(sizeMeters: number): void {
    if (!Number.isFinite(sizeMeters)) return
    this.selectedSizeMeters = Math.min(
      Math.max(sizeMeters, AIRCRAFT_SIZE_RANGE_METERS.min),
      AIRCRAFT_SIZE_RANGE_METERS.max,
    )
    // Never scale the world transform: only the aircraft grows relative to the
    // fixed-size ground references and flight path.
    this.visual.scale.setScalar(
      this.selectedSizeMeters / AIRCRAFT_BASE_FOOTPRINT_METERS[this.selectedModel],
    )
  }

  setBodyAxesVisible(visible: boolean): void {
    this.bodyAxesVisible = visible
    const axes = this.visual.getObjectByName('Body axes: X Right, Y Up, Z Forward')
    if (axes) axes.visible = visible
  }

  update(frame: FlightFrame): void {
    CoordinateConverter.flightFrameToThreePosition(frame, this.object.position)
    CoordinateConverter.px4QuaternionToThree(frame.attitude.quaternion, this.object.quaternion)
  }

  dispose(): void {
    disposeObject3D(this.visual)
    this.object.removeFromParent()
  }
}
