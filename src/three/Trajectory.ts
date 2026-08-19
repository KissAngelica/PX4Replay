import {
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  RingGeometry,
  SphereGeometry,
} from 'three'
import type { FlightData, FlightFrame, NedVector } from '@/flight/types'
import { CoordinateConverter } from './CoordinateConverter'
import { disposeObject3D } from './ThreeResourceManager'
import { AIRCRAFT_SIZE_RANGE_METERS } from './Aircraft'

export class Trajectory {
  readonly object = new Group()
  readonly pointCount: number
  private readonly timestamps: Float64Array
  private readonly fullPath: Line
  private readonly traveledPath: Line
  private readonly currentMarker: Mesh
  private readonly referenceMarkers: Object3D[] = []
  private showFullPath = true
  private trailOnly = false
  private trailDurationUs = 30_000_000

  constructor(data: FlightData, referenceSizeMeters = 2) {
    this.object.name = 'Flight trajectory'
    this.pointCount = data.frames.length
    this.timestamps = new Float64Array(this.pointCount)
    const positions = new Float32Array(this.pointCount * 3)
    const colors = new Float32Array(this.pointCount * 3)
    let minimumAltitude = Infinity
    let maximumAltitude = -Infinity

    data.frames.forEach((frame, index) => {
      const offset = index * 3
      positions[offset] = frame.localPosition.east
      positions[offset + 1] = frame.altitude?.display ?? -frame.localPosition.down
      positions[offset + 2] = frame.localPosition.north
      this.timestamps[index] = frame.timestampUs
      minimumAltitude = Math.min(minimumAltitude, positions[offset + 1]!)
      maximumAltitude = Math.max(maximumAltitude, positions[offset + 1]!)
    })

    const altitudeRange = Math.max(maximumAltitude - minimumAltitude, 1)
    const color = new Color()
    for (let index = 0; index < this.pointCount; index += 1) {
      const altitude = positions[index * 3 + 1]!
      color.setHSL(0.55 - ((altitude - minimumAltitude) / altitudeRange) * 0.45, 0.82, 0.58)
      color.toArray(colors, index * 3)
    }

    const fullGeometry = new BufferGeometry()
    fullGeometry.setAttribute('position', new BufferAttribute(positions, 3))
    fullGeometry.setAttribute('color', new BufferAttribute(colors, 3))
    this.fullPath = new Line(
      fullGeometry,
      new LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.3 }),
    )
    this.fullPath.name = 'Full altitude-colored path'

    const traveledGeometry = new BufferGeometry()
    traveledGeometry.setAttribute('position', new BufferAttribute(positions.slice(), 3))
    traveledGeometry.setDrawRange(0, Math.min(1, this.pointCount))
    this.traveledPath = new Line(
      traveledGeometry,
      new LineBasicMaterial({ color: 0x68efff, transparent: true, opacity: 0.96 }),
    )
    this.traveledPath.name = 'Traveled path'

    this.currentMarker = new Mesh(
      new SphereGeometry(0.18, 12, 8),
      new MeshBasicMaterial({ color: 0xffd166, wireframe: true }),
    )
    this.currentMarker.name = 'Current position marker'

    this.object.add(this.fullPath, this.traveledPath, this.currentMarker)
    const first = data.frames[0]
    const last = data.frames[data.frames.length - 1]
    if (first) this.referenceMarkers.push(this.createPointMarker('Start point', first, 0x54e572))
    if (last) this.referenceMarkers.push(this.createPointMarker('End point', last, 0xff5f5f))
    this.referenceMarkers.push(
      this.createHomeMarker(
        data.homePosition ?? first?.localPosition ?? { north: 0, east: 0, down: 0 },
      ),
    )
    this.object.add(...this.referenceMarkers)
    this.setReferenceSizeMeters(referenceSizeMeters)
  }

  get visibleRange(): { start: number; count: number } {
    return { ...this.traveledPath.geometry.drawRange }
  }

  setFullPathVisible(visible: boolean): void {
    this.showFullPath = visible
    this.updateVisibility()
  }

  setTrailOnly(enabled: boolean): void {
    this.trailOnly = enabled
    this.updateVisibility()
  }

  setTrailLengthSeconds(seconds: number): void {
    if (Number.isFinite(seconds)) this.trailDurationUs = Math.max(1, seconds) * 1_000_000
  }

  setReferenceSizeMeters(sizeMeters: number): void {
    if (!Number.isFinite(sizeMeters)) return
    const scale = Math.min(
      Math.max(sizeMeters, AIRCRAFT_SIZE_RANGE_METERS.min),
      AIRCRAFT_SIZE_RANGE_METERS.max,
    )
    this.referenceMarkers.forEach((marker) => marker.scale.setScalar(scale))
    this.currentMarker.scale.setScalar(scale)
  }

  refreshAltitudes(frames: FlightFrame[]): void {
    const fullPositions = this.fullPath.geometry.getAttribute('position') as BufferAttribute
    const traveledPositions = this.traveledPath.geometry.getAttribute('position') as BufferAttribute
    const colors = this.fullPath.geometry.getAttribute('color') as BufferAttribute
    let minimumAltitude = Infinity
    let maximumAltitude = -Infinity
    frames.forEach((frame, index) => {
      const altitude = frame.altitude?.display ?? -frame.localPosition.down
      fullPositions.setY(index, altitude)
      traveledPositions.setY(index, altitude)
      minimumAltitude = Math.min(minimumAltitude, altitude)
      maximumAltitude = Math.max(maximumAltitude, altitude)
    })
    const range = Math.max(maximumAltitude - minimumAltitude, 1)
    const color = new Color()
    frames.forEach((frame, index) => {
      const altitude = frame.altitude?.display ?? -frame.localPosition.down
      color.setHSL(0.55 - ((altitude - minimumAltitude) / range) * 0.45, 0.82, 0.58)
      colors.setXYZ(index, color.r, color.g, color.b)
    })
    fullPositions.needsUpdate = true
    traveledPositions.needsUpdate = true
    colors.needsUpdate = true
    const start = this.object.getObjectByName('Start point')
    const end = this.object.getObjectByName('End point')
    if (start && frames[0])
      CoordinateConverter.flightFrameToThreePosition(frames[0], start.position)
    if (end && frames.at(-1))
      CoordinateConverter.flightFrameToThreePosition(frames.at(-1)!, end.position)
  }

  update(timeUs: number, frame: FlightFrame): void {
    const end = this.indexAtOrBefore(timeUs)
    const start = this.trailOnly ? this.indexAtOrBefore(timeUs - this.trailDurationUs) : 0
    this.traveledPath.geometry.setDrawRange(start, Math.max(0, end - start + 1))
    CoordinateConverter.flightFrameToThreePosition(frame, this.currentMarker.position)
  }

  dispose(): void {
    disposeObject3D(this.object)
    this.object.removeFromParent()
  }

  private updateVisibility(): void {
    this.fullPath.visible = this.showFullPath && !this.trailOnly
  }

  private indexAtOrBefore(timeUs: number): number {
    if (this.pointCount === 0 || timeUs <= this.timestamps[0]!) return 0
    if (timeUs >= this.timestamps[this.pointCount - 1]!) return this.pointCount - 1
    let low = 0
    let high = this.pointCount - 1
    while (low + 1 < high) {
      const middle = Math.floor((low + high) / 2)
      if (this.timestamps[middle]! <= timeUs) low = middle
      else high = middle
    }
    return low
  }

  private createPointMarker(name: string, frame: FlightFrame, color: number): Mesh {
    const geometry = new ConeGeometry(0.25, 0.65, 10)
    geometry.translate(0, 0.325, 0)
    const marker = new Mesh(geometry, new MeshBasicMaterial({ color }))
    marker.name = name
    CoordinateConverter.flightFrameToThreePosition(frame, marker.position)
    return marker
  }

  private createHomeMarker(ned: NedVector): Group {
    const marker = new Group()
    marker.name = 'Home point'
    CoordinateConverter.nedToThreePosition({ ...ned, down: 0 }, marker.position)
    const ring = new Mesh(
      new RingGeometry(0.32, 0.42, 24),
      new MeshBasicMaterial({ color: 0xffd166, side: 2 }),
    )
    ring.rotation.x = -Math.PI / 2
    ring.position.y = 0.015
    const flag = new Mesh(
      new ConeGeometry(0.12, 0.45, 4),
      new MeshBasicMaterial({ color: 0xffd166 }),
    )
    flag.position.y = 0.24
    marker.add(ring, flag)
    return marker
  }
}
