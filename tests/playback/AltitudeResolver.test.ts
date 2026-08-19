import { describe, expect, it } from 'vitest'
import { AltitudeResolver } from '../../src/flight/AltitudeResolver'
import type { FlightData, FlightFrame } from '../../src/flight/types'

function frame(
  second: number,
  ekfAltitude: number,
  gpsAltitude?: number,
  landed = false,
): FlightFrame {
  return {
    timestampUs: second * 1_000_000,
    localPosition: { north: 0, east: 0, down: -ekfAltitude },
    velocity: { north: 0, east: 0, down: 0 },
    groundSpeed: 0,
    attitude: {
      quaternion: { w: 1, x: 0, y: 0, z: 0 },
      roll: 0,
      pitch: 0,
      yaw: 0,
    },
    vehicle: { armed: true, landed, flightMode: 'POSITION' },
    gps: {
      satellites: gpsAltitude === undefined ? 0 : 18,
      fixType: gpsAltitude === undefined ? 0 : 3,
      altitudeMsl: gpsAltitude,
    },
  }
}

function data(frames: FlightFrame[]): FlightData {
  return {
    name: 'altitude fixture',
    durationUs: frames.at(-1)?.timestampUs ?? 0,
    sampleRateHz: 1,
    frames,
  }
}

describe('AltitudeResolver', () => {
  it('reduces slow EKF drift without directly injecting GPS noise', () => {
    const frames = Array.from({ length: 121 }, (_, second) => {
      if (second === 0) return frame(0, 0, 100, true)
      const ekf = 10 + second * 0.1
      const noisyGps = 110 + (second % 2 === 0 ? 2 : -2)
      return frame(second, ekf, noisyGps)
    })
    AltitudeResolver.resolve(data(frames))
    const last = frames.at(-1)!.altitude!
    expect(Math.abs(last.fused - 10)).toBeLessThan(Math.abs(last.ekfRelative - 10))
    expect(last.estimatedBias).toBeGreaterThan(0)
    expect(Math.abs(frames[60]!.altitude!.fused - frames[59]!.altitude!.fused)).toBeLessThan(1)
  })

  it('keeps rapid climb response and holds bias while GPS is unavailable', () => {
    const frames = [frame(0, 0, 100, true), frame(1, 20, 120), frame(2, 25)]
    AltitudeResolver.resolve(data(frames))
    expect(frames[1]!.altitude!.fused).toBeCloseTo(20)
    expect(frames[2]!.altitude!.fused).toBeCloseTo(25)
    expect(frames[2]!.altitude!.estimatedBias).toBe(frames[1]!.altitude!.estimatedBias)
  })

  it('aligns a late first GPS fix to the current EKF relative altitude', () => {
    const frames = [frame(0, 0, undefined, true), frame(1, 10), frame(2, 20, 120)]
    AltitudeResolver.resolve(data(frames))
    expect(frames[2]!.altitude?.gpsRelative).toBeCloseTo(20)
    expect(frames[2]!.altitude?.fused).toBeCloseTo(20)
  })

  it('switches display source without modifying EKF, GPS or fused values', () => {
    const flight = data([frame(0, 0, 100, true), frame(1, 8, 106)])
    AltitudeResolver.resolve(flight)
    const altitude = flight.frames[1]!.altitude!
    const preserved = {
      ekf: altitude.ekfRelative,
      gps: altitude.gpsRelative,
      fused: altitude.fused,
    }
    AltitudeResolver.applyMode(flight, 'gps')
    expect(altitude.display).toBe(altitude.gpsRelative)
    AltitudeResolver.applyMode(flight, 'ekf')
    expect(altitude.display).toBe(altitude.ekfRelative)
    expect({ ekf: altitude.ekfRelative, gps: altitude.gpsRelative, fused: altitude.fused }).toEqual(
      preserved,
    )
  })

  it('uses a ground constraint only for fused display altitude', () => {
    const flight = data([frame(0, 0, 100, true), frame(1, 3, 100, true)])
    AltitudeResolver.resolve(flight)
    expect(flight.frames[1]!.altitude?.ekfRelative).toBe(3)
    expect(flight.frames[1]!.altitude?.fused).toBe(0)
  })
})
