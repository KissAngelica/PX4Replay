import { describe, expect, it } from 'vitest'
import { PLAYBACK_SPEEDS, PlaybackController } from '../../src/flight/PlaybackController'
import { generateMockFlight } from '../../src/mock/generateMockFlight'

describe('PlaybackController', () => {
  it('advances according to playback speed', () => {
    const controller = new PlaybackController(generateMockFlight('line'))
    controller.setSpeed(2)
    controller.update(0.5)
    expect(controller.currentTimeUs).toBe(1_000_000)
  })

  it.each([2, 5])('keeps data time correct at %sx', (speed) => {
    const controller = new PlaybackController(generateMockFlight('line'))
    controller.setSpeed(speed)
    controller.update(0.25)
    expect(controller.currentTimeUs).toBe(250_000 * speed)
  })

  it('clamps seeking and stops at the end', () => {
    const data = generateMockFlight('circle')
    const controller = new PlaybackController(data)
    controller.seek(data.durationUs + 1)
    expect(controller.currentTimeUs).toBe(data.durationUs)
    controller.update(1)
    expect(controller.isPlaying).toBe(false)
  })

  it('exposes every required playback speed', () => {
    expect(PLAYBACK_SPEEDS).toEqual([0.1, 0.25, 0.5, 1, 2, 5, 10])
  })

  it('supports reset and replay', () => {
    const controller = new PlaybackController(generateMockFlight('climb'))
    controller.update(2)
    controller.reset()
    expect(controller.currentTimeUs).toBe(0)
    expect(controller.isPlaying).toBe(false)
    controller.play()
    expect(controller.isPlaying).toBe(true)
    controller.stop()
    expect(controller.currentTimeUs).toBe(0)
    expect(controller.isPlaying).toBe(false)
    controller.replay()
    expect(controller.currentTimeUs).toBe(0)
    expect(controller.isPlaying).toBe(true)
  })

  it('updates progress and returns the frame immediately after seek', () => {
    const data = generateMockFlight('circle')
    const controller = new PlaybackController(data)
    const frame = controller.seek(data.durationUs / 2)
    expect(controller.progress).toBeCloseTo(0.5)
    expect(frame.timestampUs).toBe(data.durationUs / 2)
  })

  it('uses the previous sample for discrete vehicle and GPS state', () => {
    const data = generateMockFlight('circle')
    const from = data.frames[60]!
    const to = data.frames[61]!
    from.vehicle = { armed: false, flightMode: 'FROM' }
    to.vehicle = { armed: true, flightMode: 'TO' }
    from.gps = { satellites: 0, fixType: 0 }
    to.gps = { satellites: 20, fixType: 3 }
    const controller = new PlaybackController(data)
    const frame = controller.frameAt((from.timestampUs + to.timestampUs) / 2)
    expect(frame.vehicle).toEqual(from.vehicle)
    expect(frame.gps).toEqual(from.gps)
  })

  it('does not flip when equivalent quaternions use opposite signs', () => {
    const data = generateMockFlight('line')
    const from = data.frames[10]!
    const to = data.frames[11]!
    from.attitude.quaternion = { w: 1, x: 0, y: 0, z: 0 }
    to.attitude.quaternion = { w: -1, x: 0, y: 0, z: 0 }
    const frame = new PlaybackController(data).frameAt((from.timestampUs + to.timestampUs) / 2)
    expect(Math.abs(frame.attitude.quaternion.w)).toBeCloseTo(1)
    expect(frame.attitude.quaternion.x).toBeCloseTo(0)
    expect(frame.attitude.quaternion.y).toBeCloseTo(0)
    expect(frame.attitude.quaternion.z).toBeCloseTo(0)
  })

  it('interpolates between 30 Hz samples', () => {
    const controller = new PlaybackController(generateMockFlight('line'))
    const from = controller.frameAt(0)
    const to = controller.frameAt(33_333)
    const middle = controller.frameAt(16_666)
    expect(middle.localPosition.east).toBeGreaterThan(from.localPosition.east)
    expect(middle.localPosition.east).toBeLessThan(to.localPosition.east)
    expect(
      Math.hypot(
        middle.attitude.quaternion.w,
        middle.attitude.quaternion.x,
        middle.attitude.quaternion.y,
        middle.attitude.quaternion.z,
      ),
    ).toBeCloseTo(1)
  })
})
