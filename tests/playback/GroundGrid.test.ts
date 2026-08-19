import { describe, expect, it } from 'vitest'
import {
  GROUND_GRID_SIZE_METERS,
  MAJOR_GRID_STEP_METERS,
  MINOR_GRID_STEP_METERS,
} from '../../src/three/GroundGrid'

describe('GroundGrid', () => {
  it('uses exact metre-based minor and major references', () => {
    expect(GROUND_GRID_SIZE_METERS).toBe(600)
    expect(MINOR_GRID_STEP_METERS).toBe(1)
    expect(MAJOR_GRID_STEP_METERS).toBe(10)
    expect(GROUND_GRID_SIZE_METERS / MINOR_GRID_STEP_METERS).toBe(600)
    expect(GROUND_GRID_SIZE_METERS / MAJOR_GRID_STEP_METERS).toBe(60)
  })
})
