import type { AltitudeMode, FlightAltitude, FlightData, FlightFrame } from './types'

export const ALTITUDE_BIAS_TIME_CONSTANT_SECONDS = 60

function finite(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value)
}

function gpsAltitudeValid(frame: FlightFrame): boolean {
  return (frame.gps?.fixType ?? 0) >= 3 && finite(frame.gps?.altitudeMsl)
}

function referenceFrame(data: FlightData): FlightFrame {
  const timestamp = data.metadata?.verticalReference?.referenceTimestampUs ?? 0
  return (
    data.frames.find((frame) => frame.timestampUs >= timestamp && frame.vehicle.armed) ??
    data.frames.find((frame) => frame.vehicle.armed) ??
    data.frames[0]!
  )
}

function gpsReferenceAltitude(
  data: FlightData,
  reference: FlightFrame,
  ekfReferenceDown: number,
): number | undefined {
  const beforeReference = data.frames.filter(
    (frame) => frame.timestampUs <= reference.timestampUs && gpsAltitudeValid(frame),
  )
  const frame = beforeReference.at(-1) ?? data.frames.find(gpsAltitudeValid)
  if (!frame || !finite(frame.gps?.altitudeMsl)) return undefined
  const ekfRelativeAtGpsReference = -(frame.localPosition.down - ekfReferenceDown)
  return frame.gps.altitudeMsl - ekfRelativeAtGpsReference
}

export class AltitudeResolver {
  static resolve(data: FlightData, mode: AltitudeMode = 'fused'): FlightData {
    if (!data.frames.length) return data
    const reference = referenceFrame(data)
    const ekfReferenceDown = reference.localPosition.down
    const gpsReference = gpsReferenceAltitude(data, reference, ekfReferenceDown)
    let bias = 0
    let lastTimestampUs = data.frames[0]!.timestampUs

    data.frames.forEach((frame) => {
      const ekfRelative = -(frame.localPosition.down - ekfReferenceDown)
      const gpsRelative =
        gpsReference !== undefined && gpsAltitudeValid(frame)
          ? frame.gps!.altitudeMsl! - gpsReference
          : undefined
      const deltaSeconds = Math.max(0, (frame.timestampUs - lastTimestampUs) / 1_000_000)
      lastTimestampUs = frame.timestampUs

      if (gpsRelative !== undefined) {
        const error = ekfRelative - gpsRelative
        const alpha = 1 - Math.exp(-deltaSeconds / ALTITUDE_BIAS_TIME_CONSTANT_SECONDS)
        bias += alpha * (error - bias)
      }

      let fused = ekfRelative - bias
      if (frame.vehicle.landed) fused = 0
      frame.altitude = {
        ekfRelative,
        gpsRelative,
        globalAltitude: frame.globalPosition?.altitudeMsl,
        fused,
        display: fused,
        estimatedBias: bias,
        source: 'fused',
      }
    })

    return this.applyMode(data, mode)
  }

  static applyMode(data: FlightData, mode: AltitudeMode): FlightData {
    data.frames.forEach((frame) => {
      const altitude = frame.altitude ?? this.fallbackAltitude(frame)
      const requested = mode === 'gps' ? altitude.gpsRelative : altitude[mode]
      altitude.display = finite(requested) ? requested : altitude.ekfRelative
      altitude.source = mode === 'gps' && !finite(altitude.gpsRelative) ? 'ekf' : mode
      frame.altitude = altitude
    })
    return data
  }

  private static fallbackAltitude(frame: FlightFrame): FlightAltitude {
    const ekfRelative = -frame.localPosition.down
    return {
      ekfRelative,
      fused: ekfRelative,
      display: ekfRelative,
      estimatedBias: 0,
      source: 'ekf',
    }
  }
}
