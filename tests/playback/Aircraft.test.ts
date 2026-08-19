import { describe, expect, it } from 'vitest'
import { AIRCRAFT_BASE_FOOTPRINT_METERS, Aircraft } from '../../src/three/Aircraft'
import type { FlightFrame } from '../../src/flight/types'

describe('Aircraft', () => {
  it('switches models without replacing its transform root', () => {
    const aircraft = new Aircraft('fixed-wing')
    const root = aircraft.object
    aircraft.setModel('quadcopter')
    expect(aircraft.object).toBe(root)
    expect(aircraft.currentModel).toBe('quadcopter')
    expect(aircraft.object.children).toHaveLength(1)
    aircraft.setModel('helicopter')
    expect(aircraft.currentModel).toBe('helicopter')
    aircraft.dispose()
  })

  it('clamps physical size to the supported observation range', () => {
    const aircraft = new Aircraft('quadcopter', 1)
    aircraft.setSizeMeters(80)
    expect(aircraft.modelSizeMeters).toBe(10)
    aircraft.setSizeMeters(0.01)
    expect(aircraft.modelSizeMeters).toBe(0.1)
    aircraft.dispose()
  })

  it('uses the quadcopter as the default model', () => {
    const aircraft = new Aircraft()
    expect(aircraft.currentModel).toBe('quadcopter')
    aircraft.dispose()
  })

  it('keeps its visual scale when switching models without scaling the world transform', () => {
    const aircraft = new Aircraft('fixed-wing', 3)
    const fixedWingScale = 3 / AIRCRAFT_BASE_FOOTPRINT_METERS['fixed-wing']
    expect(aircraft.object.scale.toArray()).toEqual([1, 1, 1])
    expect(aircraft.object.children[0]?.scale.toArray()).toEqual([
      fixedWingScale,
      fixedWingScale,
      fixedWingScale,
    ])

    aircraft.setModel('quadcopter')

    const quadcopterScale = 3 / AIRCRAFT_BASE_FOOTPRINT_METERS.quadcopter
    expect(aircraft.modelSizeMeters).toBe(3)
    expect(aircraft.object.scale.toArray()).toEqual([1, 1, 1])
    expect(aircraft.object.children[0]?.scale.toArray()).toEqual([
      quadcopterScale,
      quadcopterScale,
      quadcopterScale,
    ])
    aircraft.dispose()
  })

  it('moves five 20 cm body lengths when ULog east position changes by one metre', () => {
    const aircraft = new Aircraft('quadcopter', 0.2)
    const frame = (east: number) =>
      ({
        timestampUs: 0,
        localPosition: { north: 0, east, down: 0 },
        velocity: { north: 0, east: 0, down: 0 },
        groundSpeed: 0,
        attitude: {
          quaternion: { w: 1, x: 0, y: 0, z: 0 },
          roll: 0,
          pitch: 0,
          yaw: 0,
        },
        vehicle: { armed: false, flightMode: 'MANUAL' },
      }) satisfies FlightFrame

    aircraft.update(frame(0))
    const startX = aircraft.object.position.x
    aircraft.update(frame(1))

    expect((aircraft.object.position.x - startX) / aircraft.modelSizeMeters).toBe(5)
    aircraft.dispose()
  })

  it.each(['fixed-wing', 'quadcopter', 'helicopter'] as const)(
    'draws all three body axes on the %s model',
    (model) => {
      const aircraft = new Aircraft(model)
      const axes = aircraft.object.getObjectByName('Body axes: X Right, Y Up, Z Forward')
      expect(axes).toBeDefined()
      expect(axes?.position.toArray()).toEqual([0, 0, 0])
      expect(axes?.children.map((child) => child.name)).toEqual([
        'Body X / Right',
        'Body Y / Up',
        'Body Z / Forward',
      ])
      aircraft.dispose()
    },
  )
})
