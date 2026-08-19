import type { FlightData, FlightFrame } from './types'
import { Quaternion } from 'three'

const lerp = (from: number, to: number, amount: number): number => from + (to - from) * amount
const lerpAngle = (from: number, to: number, amount: number): number => {
  const difference = Math.atan2(Math.sin(to - from), Math.cos(to - from))
  return from + difference * amount
}

export const PLAYBACK_SPEEDS = [0.1, 0.25, 0.5, 1, 2, 5, 10] as const

export class PlaybackController {
  private elapsedUs = 0
  private playing = true
  private speed = 1

  constructor(private readonly data: FlightData) {}

  get currentTimeUs(): number {
    return this.elapsedUs
  }

  get durationUs(): number {
    return this.data.durationUs
  }

  get isPlaying(): boolean {
    return this.playing
  }

  get playbackSpeed(): number {
    return this.speed
  }

  get progress(): number {
    return this.durationUs === 0 ? 0 : this.elapsedUs / this.durationUs
  }

  play(): void {
    if (this.elapsedUs >= this.durationUs) this.elapsedUs = 0
    this.playing = true
  }

  pause(): void {
    this.playing = false
  }

  toggle(): void {
    if (this.playing) this.pause()
    else this.play()
  }

  reset(): void {
    this.stop()
  }

  stop(): void {
    this.elapsedUs = 0
    this.playing = false
  }

  replay(): void {
    this.elapsedUs = 0
    this.playing = true
  }

  seek(timeUs: number): FlightFrame {
    this.elapsedUs = Math.min(Math.max(timeUs, 0), this.durationUs)
    return this.frameAt(this.elapsedUs)
  }

  setSpeed(speed: number): void {
    if (!Number.isFinite(speed) || speed <= 0)
      throw new RangeError('Playback speed must be positive')
    this.speed = speed
  }

  update(deltaSeconds: number): FlightFrame {
    if (this.playing && Number.isFinite(deltaSeconds) && deltaSeconds > 0) {
      this.elapsedUs = Math.min(
        this.elapsedUs + deltaSeconds * 1_000_000 * this.speed,
        this.durationUs,
      )
      if (this.elapsedUs >= this.durationUs) this.playing = false
    }
    return this.frameAt(this.elapsedUs)
  }

  frameAt(timeUs: number): FlightFrame {
    const frames = this.data.frames
    const last = frames[frames.length - 1]
    if (!last) throw new Error('FlightData contains no frames')
    if (timeUs <= frames[0]!.timestampUs) return frames[0]!
    if (timeUs >= last.timestampUs) return last

    let low = 0
    let high = frames.length - 1
    while (low + 1 < high) {
      const middle = Math.floor((low + high) / 2)
      if (frames[middle]!.timestampUs <= timeUs) low = middle
      else high = middle
    }
    const from = frames[low]!
    const to = frames[high]!
    const amount = (timeUs - from.timestampUs) / (to.timestampUs - from.timestampUs)
    const fromQ = from.attitude.quaternion
    const toQ = to.attitude.quaternion
    const quaternion = new Quaternion(fromQ.x, fromQ.y, fromQ.z, fromQ.w).slerp(
      new Quaternion(toQ.x, toQ.y, toQ.z, toQ.w),
      amount,
    )

    return {
      timestampUs: timeUs,
      altitude:
        from.altitude && to.altitude
          ? {
              ekfRelative: lerp(from.altitude.ekfRelative, to.altitude.ekfRelative, amount),
              gpsRelative:
                from.altitude.gpsRelative !== undefined && to.altitude.gpsRelative !== undefined
                  ? lerp(from.altitude.gpsRelative, to.altitude.gpsRelative, amount)
                  : from.altitude.gpsRelative,
              globalAltitude:
                from.altitude.globalAltitude !== undefined &&
                to.altitude.globalAltitude !== undefined
                  ? lerp(from.altitude.globalAltitude, to.altitude.globalAltitude, amount)
                  : from.altitude.globalAltitude,
              fused: lerp(from.altitude.fused, to.altitude.fused, amount),
              display: lerp(from.altitude.display, to.altitude.display, amount),
              estimatedBias: lerp(from.altitude.estimatedBias, to.altitude.estimatedBias, amount),
              source: from.altitude.source,
            }
          : from.altitude,
      localPosition: {
        north: lerp(from.localPosition.north, to.localPosition.north, amount),
        east: lerp(from.localPosition.east, to.localPosition.east, amount),
        down: lerp(from.localPosition.down, to.localPosition.down, amount),
      },
      globalPosition:
        from.globalPosition && to.globalPosition
          ? {
              latitude: lerp(from.globalPosition.latitude, to.globalPosition.latitude, amount),
              longitude: lerp(from.globalPosition.longitude, to.globalPosition.longitude, amount),
              altitudeMsl: lerp(
                from.globalPosition.altitudeMsl,
                to.globalPosition.altitudeMsl,
                amount,
              ),
            }
          : from.globalPosition,
      velocity: {
        north: lerp(from.velocity.north, to.velocity.north, amount),
        east: lerp(from.velocity.east, to.velocity.east, amount),
        down: lerp(from.velocity.down, to.velocity.down, amount),
      },
      groundSpeed: lerp(from.groundSpeed, to.groundSpeed, amount),
      attitude: {
        quaternion: { w: quaternion.w, x: quaternion.x, y: quaternion.y, z: quaternion.z },
        roll: lerpAngle(from.attitude.roll, to.attitude.roll, amount),
        pitch: lerpAngle(from.attitude.pitch, to.attitude.pitch, amount),
        yaw: lerpAngle(from.attitude.yaw, to.attitude.yaw, amount),
      },
      vehicle: from.vehicle,
      battery:
        from.battery && to.battery
          ? {
              voltage: lerp(from.battery.voltage, to.battery.voltage, amount),
              current: lerp(from.battery.current, to.battery.current, amount),
              remaining: lerp(from.battery.remaining, to.battery.remaining, amount),
            }
          : from.battery,
      gps: from.gps,
    }
  }
}
