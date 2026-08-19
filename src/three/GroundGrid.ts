import { GridHelper, Group } from 'three'

export const GROUND_GRID_SIZE_METERS = 600
export const MINOR_GRID_STEP_METERS = 1
export const MAJOR_GRID_STEP_METERS = 10

export function createGroundGrid(): Group {
  const group = new Group()
  // Three.js world units are metres: minor cells are exactly 1 m and major
  // cells are exactly 10 m, matching ULog NED positions without visual scaling.
  const minor = new GridHelper(
    GROUND_GRID_SIZE_METERS,
    GROUND_GRID_SIZE_METERS / MINOR_GRID_STEP_METERS,
    0x24526a,
    0x16303d,
  )
  minor.material.transparent = true
  minor.material.opacity = 0.24
  const major = new GridHelper(
    GROUND_GRID_SIZE_METERS,
    GROUND_GRID_SIZE_METERS / MAJOR_GRID_STEP_METERS,
    0x4ba7c6,
    0x224b5e,
  )
  major.position.y = 0.01
  major.material.transparent = true
  major.material.opacity = 0.3
  group.add(minor, major)
  return group
}
