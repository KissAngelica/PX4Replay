import type { FlightData, FlightFrame } from '@/flight/types'
import { AltitudeResolver } from '@/flight/AltitudeResolver'
import { CoordinateConverter } from '@/three/CoordinateConverter'

export type MockRoute = 'circle' | 'line' | 'climb'

const DURATION_SECONDS = 5 * 60
const SAMPLE_RATE_HZ = 30
const HOME_LATITUDE = 31.2304
const HOME_LONGITUDE = 121.4737
const HOME_ALTITUDE_MSL = 12

function routePosition(
  route: MockRoute,
  time: number,
): { north: number; east: number; down: number } {
  const phase = (time / 48) * Math.PI * 2
  if (route === 'line') {
    return { north: 0, east: time * 0.8 - 120, down: -(18 + Math.sin(time / 8) * 6) }
  }
  if (route === 'climb') {
    return { north: Math.cos(phase) * 55, east: Math.sin(phase) * 55, down: -(8 + time * 0.22) }
  }
  const radius = 82 + Math.sin(time / 18) * 12
  return {
    north: Math.cos(phase) * radius,
    east: Math.sin(phase) * radius,
    down: -(30 + Math.sin(time / 11) * 14),
  }
}

export function generateMockFlight(route: MockRoute = 'circle'): FlightData {
  const count = DURATION_SECONDS * SAMPLE_RATE_HZ + 1
  const frames: FlightFrame[] = []

  for (let index = 0; index < count; index += 1) {
    const time = index / SAMPLE_RATE_HZ
    const nextTime = Math.min(time + 1 / SAMPLE_RATE_HZ, DURATION_SECONDS)
    const localPosition = routePosition(route, time)
    const next = routePosition(route, nextTime)
    const velocity = {
      north: (next.north - localPosition.north) * SAMPLE_RATE_HZ,
      east: (next.east - localPosition.east) * SAMPLE_RATE_HZ,
      down: (next.down - localPosition.down) * SAMPLE_RATE_HZ,
    }
    const yaw = Math.atan2(velocity.east, velocity.north)
    const horizontalSpeed = Math.hypot(velocity.north, velocity.east)
    const pitch = Math.atan2(-velocity.down, Math.max(horizontalSpeed, 0.001))
    const roll = Math.sin(time / 4.8) * 0.32
    const quaternion = CoordinateConverter.px4EulerToQuaternion(roll, pitch, yaw)
    const progress = time / DURATION_SECONDS
    const latitude = HOME_LATITUDE + localPosition.north / 111_320
    const longitude =
      HOME_LONGITUDE + localPosition.east / (111_320 * Math.cos((HOME_LATITUDE * Math.PI) / 180))
    const gpsLoss = time < 2 || (time >= 142 && time < 148)
    const flightMode = time < 5 ? '手动' : time > DURATION_SECONDS - 15 ? '返航' : '自动任务'

    frames.push({
      timestampUs: Math.round(time * 1_000_000),
      localPosition,
      globalPosition: {
        latitude,
        longitude,
        altitudeMsl: HOME_ALTITUDE_MSL - localPosition.down,
      },
      velocity,
      groundSpeed: horizontalSpeed,
      attitude: {
        quaternion,
        roll,
        pitch,
        yaw,
      },
      vehicle: {
        armed: time > 2 && time < DURATION_SECONDS - 2,
        landed: time <= 2 || time >= DURATION_SECONDS - 2,
        flightMode,
      },
      battery: {
        voltage: 25.2 - progress * 5.2,
        current: 7.5 + Math.sin(time / 5) * 2.8,
        remaining: Math.max(0.15, 1 - progress * 0.85),
      },
      gps: {
        satellites: gpsLoss ? 0 : 16 + Math.round(Math.sin(time / 13) * 3),
        fixType: gpsLoss ? 0 : 3,
        altitudeMsl: HOME_ALTITUDE_MSL - localPosition.down,
        altitudeEllipsoid: HOME_ALTITUDE_MSL - localPosition.down + 8,
        latitude,
        longitude,
      },
    })
  }

  const data: FlightData = {
    name: `${route === 'circle' ? '环形任务' : route === 'line' ? '直线飞行' : '螺旋爬升'} / 5 分钟`,
    durationUs: DURATION_SECONDS * 1_000_000,
    sampleRateHz: SAMPLE_RATE_HZ,
    frames,
    homePosition: { north: 0, east: 0, down: 0 },
    metadata: {
      source: 'mock',
      fileName: '内置模拟数据',
      fileSizeBytes: 0,
      logStartTimestampUs: 0,
      logEndTimestampUs: DURATION_SECONDS * 1_000_000,
      topics: [
        'vehicle_status',
        'vehicle_local_position',
        'vehicle_attitude',
        'vehicle_global_position',
        'vehicle_gps_position',
        'battery_status',
      ],
      topicFields: {
        vehicle_status: ['arming_state', 'nav_state'],
        vehicle_local_position: ['x', 'y', 'z', 'vx', 'vy', 'vz'],
        vehicle_attitude: ['q[0]', 'q[1]', 'q[2]', 'q[3]'],
        vehicle_global_position: ['lat', 'lon', 'alt'],
        vehicle_gps_position: ['satellites_used', 'fix_type'],
        battery_status: ['voltage_v', 'current_a', 'remaining'],
      },
      verticalReference: {
        method: 'armed-ground',
        groundDown: 0,
        referenceTimestampUs: 0,
        landedLockApplied: false,
      },
    },
  }
  return AltitudeResolver.resolve(data)
}
