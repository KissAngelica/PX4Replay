import { invoke } from '@tauri-apps/api/core'
import type { FlightData, UlogTopicSeries } from '@/flight/types'
import { AltitudeResolver } from '@/flight/AltitudeResolver'
import { validateFlightData } from '@/flight/FlightDataValidator'

export function isTauriRuntime(): boolean {
  return '__TAURI_INTERNALS__' in window
}

export async function parseUlogTopic(
  path: string,
  topic: string,
  field: string,
): Promise<UlogTopicSeries> {
  if (!isTauriRuntime()) throw new Error('ULog Topic 解析需要在 Tauri 桌面应用中运行')
  const json = await invoke<string>('parse_ulog_topic', { path, topic, field })
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new Error('Topic 解析器返回了无效 JSON')
  }
  if (!parsed || typeof parsed !== 'object') throw new Error('Topic 数据无效')
  return parsed as UlogTopicSeries
}

export async function parseUlogPath(path: string): Promise<FlightData> {
  if (!isTauriRuntime()) throw new Error('ULog 解析需要在 Tauri 桌面应用中运行')
  const json = await invoke<string>('parse_ulog', { path })
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new Error('解析器返回了无效 JSON')
  }
  return AltitudeResolver.resolve(validateFlightData(parsed))
}
