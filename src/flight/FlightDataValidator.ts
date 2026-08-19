import type { FlightData } from './types'

export function validateFlightData(value: unknown): FlightData {
  if (!value || typeof value !== 'object') throw new Error('解析结果不是有效对象')
  const data = value as Partial<FlightData>
  if (!Array.isArray(data.frames) || data.frames.length === 0) throw new Error('日志没有有效飞行帧')
  if (!Number.isFinite(data.durationUs) || (data.durationUs ?? -1) < 0)
    throw new Error('日志时长无效')
  let previousTimestamp = -1
  for (const [index, frame] of data.frames.entries()) {
    if (!frame || !Number.isFinite(frame.timestampUs) || frame.timestampUs < previousTimestamp) {
      throw new Error(`第 ${index + 1} 帧时间戳异常`)
    }
    const position = frame.localPosition
    if (!position || ![position.north, position.east, position.down].every(Number.isFinite)) {
      throw new Error(`第 ${index + 1} 帧位置无效`)
    }
    const quaternion = frame.attitude?.quaternion
    const length = quaternion
      ? Math.hypot(quaternion.w, quaternion.x, quaternion.y, quaternion.z)
      : 0
    if (!Number.isFinite(length) || length < 0.5 || length > 1.5) {
      throw new Error(`第 ${index + 1} 帧四元数无效`)
    }
    previousTimestamp = frame.timestampUs
  }
  return data as FlightData
}
