import { Euler, Quaternion, Vector3 } from 'three'
import type { FlightFrame, NedVector, QuaternionValue } from '@/flight/types'

/** Three world coordinates are right-handed: +X East, +Y Up, +Z North. */
export const THREE_WORLD_AXES = Object.freeze({
  x: 'east',
  y: 'up',
  z: 'north',
} as const)

/** Every aircraft asset must use +Z Forward, +X Right, +Y Up. */
export const AIRCRAFT_BODY_AXES = Object.freeze({
  x: 'right',
  y: 'up',
  z: 'forward',
} as const)

export class CoordinateConverter {
  static nedToThreePosition(ned: NedVector, target = new Vector3()): Vector3 {
    return target.set(ned.east, -ned.down, ned.north)
  }

  static flightFrameToThreePosition(frame: FlightFrame, target = new Vector3()): Vector3 {
    return target.set(
      frame.localPosition.east,
      frame.altitude?.display ?? -frame.localPosition.down,
      frame.localPosition.north,
    )
  }

  static threeToNedPosition(three: Vector3): NedVector {
    return { north: three.z, east: three.x, down: -three.y }
  }

  /**
   * Converts a PX4 Hamilton quaternion (body FRD -> world NED) to a Three.js
   * quaternion (model Right/Up/Forward -> world East/Up/North).
   */
  static px4QuaternionToThree(px4: QuaternionValue, target = new Quaternion()): Quaternion {
    const lengthSquared = px4.w ** 2 + px4.x ** 2 + px4.y ** 2 + px4.z ** 2
    if (!Number.isFinite(lengthSquared) || lengthSquared < Number.EPSILON) return target.identity()

    return target.set(-px4.y, px4.z, -px4.x, px4.w).normalize()
  }

  /** PX4 aerospace Euler order: yaw(D) * pitch(E) * roll(N/body-forward). */
  static px4EulerToQuaternion(roll: number, pitch: number, yaw: number): QuaternionValue {
    const quaternion = new Quaternion().setFromEuler(new Euler(roll, pitch, yaw, 'ZYX')).normalize()
    return { w: quaternion.w, x: quaternion.x, y: quaternion.y, z: quaternion.z }
  }
}
