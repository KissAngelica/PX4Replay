import { describe, expect, it } from 'vitest'
import { Vector3 } from 'three'
import {
  AIRCRAFT_BODY_AXES,
  CoordinateConverter,
  THREE_WORLD_AXES,
} from '../../src/three/CoordinateConverter'

const degrees = (value: number): number => (value * Math.PI) / 180

function expectVector(actual: Vector3, expected: [number, number, number]): void {
  expect(actual.x).toBeCloseTo(expected[0], 6)
  expect(actual.y).toBeCloseTo(expected[1], 6)
  expect(actual.z).toBeCloseTo(expected[2], 6)
}

function direction(roll: number, pitch: number, yaw: number, axis: Vector3): Vector3 {
  const px4 = CoordinateConverter.px4EulerToQuaternion(roll, pitch, yaw)
  return axis.clone().applyQuaternion(CoordinateConverter.px4QuaternionToThree(px4))
}

describe('CoordinateConverter positions', () => {
  it('defines the only supported world and model axes', () => {
    expect(THREE_WORLD_AXES).toEqual({ x: 'east', y: 'up', z: 'north' })
    expect(AIRCRAFT_BODY_AXES).toEqual({ x: 'right', y: 'up', z: 'forward' })
  })

  it('maps NED to East/Up/North and back without loss', () => {
    const ned = { north: 12, east: -7, down: 3.5 }
    expectVector(CoordinateConverter.nedToThreePosition(ned), [-7, -3.5, 12])
    expect(CoordinateConverter.threeToNedPosition(new Vector3(-7, -3.5, 12))).toEqual(ned)
  })
})

describe('CoordinateConverter PX4 attitude', () => {
  const forward = new Vector3(0, 0, 1)
  const right = new Vector3(1, 0, 0)

  it('keeps a level yaw 0 aircraft pointing north', () => {
    expectVector(direction(0, 0, 0, forward), [0, 0, 1])
  })

  it('turns positive yaw 90 degrees from north to east', () => {
    expectVector(direction(0, 0, degrees(90), forward), [1, 0, 0])
  })

  it('maps positive and negative pitch to nose up and nose down', () => {
    expectVector(direction(0, degrees(30), 0, forward), [0, 0.5, Math.sqrt(3) / 2])
    expectVector(direction(0, degrees(-30), 0, forward), [0, -0.5, Math.sqrt(3) / 2])
  })

  it('maps positive roll to right wing down and negative roll to right wing up', () => {
    expectVector(direction(degrees(30), 0, 0, right), [Math.sqrt(3) / 2, -0.5, 0])
    expectVector(direction(degrees(-30), 0, 0, right), [Math.sqrt(3) / 2, 0.5, 0])
  })

  it('returns a normalized identity for an invalid zero quaternion', () => {
    const converted = CoordinateConverter.px4QuaternionToThree({ w: 0, x: 0, y: 0, z: 0 })
    expect([converted.x, converted.y, converted.z, converted.w]).toEqual([0, 0, 0, 1])
  })
})
