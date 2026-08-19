import { describe, expect, it, vi } from 'vitest'
import type { BufferGeometry, Material, Object3D } from 'three'
import type { FlightData, FlightFrame } from '../../src/flight/types'
import { Trajectory } from '../../src/three/Trajectory'
import { CoordinateConverter } from '../../src/three/CoordinateConverter'

function createLargeFlightData(pointCount: number): FlightData {
  const quaternion = CoordinateConverter.px4EulerToQuaternion(0, 0, 0)
  const frames: FlightFrame[] = Array.from({ length: pointCount }, (_, index) => ({
    timestampUs: index * 18_000,
    localPosition: { north: index * 0.01, east: index % 100, down: -20 },
    velocity: { north: 1, east: 0, down: 0 },
    groundSpeed: 1,
    attitude: { quaternion, roll: 0, pitch: 0, yaw: 0 },
    vehicle: { armed: true, flightMode: 'TEST' },
  }))
  return {
    name: '100k / 30 minute fixture',
    durationUs: frames.at(-1)?.timestampUs ?? 0,
    sampleRateHz: 55.5,
    frames,
    homePosition: { north: 0, east: 0, down: 0 },
  }
}

describe('Trajectory', () => {
  it.each([100_001, 500_001])(
    'constructs and updates a %i point path without rebuilding geometry',
    (pointCount) => {
      const data = createLargeFlightData(pointCount)
      const trajectory = new Trajectory(data)
      expect(trajectory.pointCount).toBe(pointCount)
      const geometry = trajectory.object.getObjectByName('Traveled path')
      const middle = Math.floor(pointCount / 2)
      trajectory.update(data.durationUs / 2, data.frames[middle]!)
      expect(trajectory.object.getObjectByName('Traveled path')).toBe(geometry)
      expect(trajectory.visibleRange).toEqual({ start: 0, count: middle + 1 })
      trajectory.dispose()
    },
    15_000,
  )

  it('disposes every trajectory geometry and material', () => {
    const data = createLargeFlightData(101)
    const trajectory = new Trajectory(data)
    const disposeSpies: Array<ReturnType<typeof vi.spyOn>> = []
    trajectory.object.traverse((child: Object3D) => {
      const renderable = child as Object3D & {
        geometry?: BufferGeometry
        material?: Material | Material[]
      }
      if (renderable.geometry) disposeSpies.push(vi.spyOn(renderable.geometry, 'dispose'))
      const materials = renderable.material
        ? Array.isArray(renderable.material)
          ? renderable.material
          : [renderable.material]
        : []
      materials.forEach((material) => disposeSpies.push(vi.spyOn(material, 'dispose')))
    })
    trajectory.dispose()
    expect(disposeSpies.length).toBeGreaterThan(0)
    disposeSpies.forEach((spy) => expect(spy).toHaveBeenCalledOnce())
  })

  it('limits draw range in trail-only mode and provides all markers', () => {
    const data = createLargeFlightData(1_001)
    const trajectory = new Trajectory(data)
    trajectory.setTrailOnly(true)
    trajectory.setTrailLengthSeconds(2)
    trajectory.update(data.frames[800]!.timestampUs, data.frames[800]!)
    expect(trajectory.visibleRange.start).toBeGreaterThan(0)
    expect(trajectory.object.getObjectByName('Home point')).toBeDefined()
    expect(trajectory.object.getObjectByName('Start point')).toBeDefined()
    expect(trajectory.object.getObjectByName('End point')).toBeDefined()
    expect(trajectory.object.getObjectByName('Current position marker')).toBeDefined()
    trajectory.dispose()
  })

  it('keeps trajectory reference markers proportional to aircraft physical size', () => {
    const trajectory = new Trajectory(createLargeFlightData(10), 0.2)
    const start = trajectory.object.getObjectByName('Start point')!
    const end = trajectory.object.getObjectByName('End point')!
    const home = trajectory.object.getObjectByName('Home point')!
    expect(start.scale.toArray()).toEqual([0.2, 0.2, 0.2])
    expect(end.scale.toArray()).toEqual([0.2, 0.2, 0.2])
    expect(home.scale.toArray()).toEqual([0.2, 0.2, 0.2])

    trajectory.setReferenceSizeMeters(3)
    expect(start.scale.toArray()).toEqual([3, 3, 3])
    expect(end.scale.toArray()).toEqual([3, 3, 3])
    expect(home.scale.toArray()).toEqual([3, 3, 3])

    trajectory.setReferenceSizeMeters(100)
    expect(start.scale.toArray()).toEqual([10, 10, 10])
    trajectory.setReferenceSizeMeters(0.01)
    expect(start.scale.toArray()).toEqual([0.1, 0.1, 0.1])
    trajectory.dispose()
  })
})
