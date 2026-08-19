import { describe, expect, it } from 'vitest'
import { validateFlightData } from '@/flight/FlightDataValidator'
import { generateMockFlight } from '@/mock/generateMockFlight'
import minimalFlight from '../fixtures/minimal-flight.json'

describe('validateFlightData', () => {
  it('loads the committed sanitized fixture', () => {
    expect(validateFlightData(minimalFlight).frames).toHaveLength(2)
  })

  it('accepts normalized flight data', () => {
    const data = generateMockFlight('line')
    expect(validateFlightData(data)).toBe(data)
  })

  it('rejects invalid timestamps', () => {
    const data = generateMockFlight('line')
    data.frames[1]!.timestampUs = -1
    expect(() => validateFlightData(data)).toThrow('时间戳异常')
  })

  it('rejects invalid positions and quaternions', () => {
    const invalidPosition = generateMockFlight('line')
    invalidPosition.frames[0]!.localPosition.north = Number.NaN
    expect(() => validateFlightData(invalidPosition)).toThrow('位置无效')

    const invalidAttitude = generateMockFlight('line')
    invalidAttitude.frames[0]!.attitude.quaternion = { w: 0, x: 0, y: 0, z: 0 }
    expect(() => validateFlightData(invalidAttitude)).toThrow('四元数无效')
  })
})
