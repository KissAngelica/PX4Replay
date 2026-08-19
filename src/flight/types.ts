export interface NedVector {
  north: number
  east: number
  down: number
}

export interface QuaternionValue {
  w: number
  x: number
  y: number
  z: number
}

export type AltitudeMode = 'fused' | 'ekf' | 'gps'

export interface FlightAltitude {
  ekfRelative: number
  gpsRelative?: number
  globalAltitude?: number
  fused: number
  display: number
  estimatedBias: number
  source: AltitudeMode
}

export interface FlightFrame {
  timestampUs: number
  altitude?: FlightAltitude
  localPosition: NedVector
  globalPosition?: {
    latitude: number
    longitude: number
    altitudeMsl: number
  }
  velocity: NedVector
  groundSpeed: number
  attitude: {
    quaternion: QuaternionValue
    roll: number
    pitch: number
    yaw: number
  }
  vehicle: {
    armed: boolean
    flightMode: string
    landed?: boolean
  }
  battery?: {
    voltage: number
    current: number
    remaining: number
  }
  gps?: {
    satellites: number
    fixType: number
    altitudeMsl?: number
    altitudeEllipsoid?: number
    latitude?: number
    longitude?: number
  }
}

export interface FlightData {
  name: string
  durationUs: number
  sampleRateHz: number
  frames: FlightFrame[]
  homePosition?: NedVector
  metadata?: {
    source: string
    fileName: string
    fileSizeBytes: number
    logStartTimestampUs: number
    logEndTimestampUs: number
    topics: string[]
    topicFields?: Record<string, string[]>
    localOriginNed?: NedVector
    verticalReference?: {
      method: 'armed-ground'
      groundDown: number
      referenceTimestampUs: number
      landedLockApplied: boolean
    }
  }
}

export type UlogFieldValue = string | number | boolean | null | UlogFieldValue[]

export interface UlogTopicSeries {
  name: string
  timestampsUs: number[]
  fields: Record<string, UlogFieldValue[]>
}
