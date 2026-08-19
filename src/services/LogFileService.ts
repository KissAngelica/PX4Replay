import { open } from '@tauri-apps/plugin-dialog'
import { isTauriRuntime } from './ParserService'

export interface RecentFlightFile {
  path: string
  name: string
  openedAt: number
}

const RECENT_KEY = 'px4-flight-replay.recent-files'

export async function pickUlogPath(): Promise<string | null> {
  if (!isTauriRuntime()) throw new Error('系统文件选择器需要在 Tauri 桌面应用中运行')
  const selected = await open({
    multiple: false,
    directory: false,
    filters: [{ name: 'PX4 ULog', extensions: ['ulg'] }],
  })
  return typeof selected === 'string' ? selected : null
}

export function readRecentFiles(): RecentFlightFile[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as RecentFlightFile[]
    return Array.isArray(parsed) ? parsed.slice(0, 8) : []
  } catch {
    return []
  }
}

export function rememberFile(path: string): RecentFlightFile[] {
  const name = path.split(/[\\/]/).at(-1) ?? path
  const next = [
    { path, name, openedAt: Date.now() },
    ...readRecentFiles().filter((item) => item.path !== path),
  ].slice(0, 8)
  localStorage.setItem(RECENT_KEY, JSON.stringify(next))
  return next
}
