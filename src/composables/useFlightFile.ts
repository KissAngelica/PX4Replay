import { computed, ref } from 'vue'
import type { FlightData } from '@/flight/types'
import { parseUlogPath } from '@/services/ParserService'
import { pickUlogPath, readRecentFiles, rememberFile } from '@/services/LogFileService'

export type FileLoadStatus = 'idle' | 'selecting' | 'parsing' | 'ready' | 'error'

export function useFlightFile(onLoaded: (data: FlightData) => void) {
  const status = ref<FileLoadStatus>('idle')
  const progress = ref(0)
  const error = ref('')
  const recentFiles = ref(readRecentFiles())
  const currentPath = ref('')
  const currentData = ref<FlightData | null>(null)
  const fileName = computed(
    () => currentData.value?.metadata?.fileName ?? currentData.value?.name ?? '',
  )

  async function openPath(path: string): Promise<void> {
    if (!path.toLowerCase().endsWith('.ulg')) {
      status.value = 'error'
      error.value = '请选择 .ulg 文件'
      return
    }
    status.value = 'parsing'
    progress.value = 15
    error.value = ''
    try {
      const data = await parseUlogPath(path)
      progress.value = 90
      currentPath.value = path
      currentData.value = data
      recentFiles.value = rememberFile(path)
      onLoaded(data)
      progress.value = 100
      status.value = 'ready'
    } catch (reason) {
      status.value = 'error'
      progress.value = 0
      error.value = reason instanceof Error ? reason.message : String(reason)
    }
  }

  async function openPicker(): Promise<void> {
    status.value = 'selecting'
    error.value = ''
    try {
      const path = await pickUlogPath()
      if (path) await openPath(path)
      else status.value = currentData.value ? 'ready' : 'idle'
    } catch (reason) {
      status.value = 'error'
      error.value = reason instanceof Error ? reason.message : String(reason)
    }
  }

  function clearError(): void {
    error.value = ''
    status.value = currentData.value ? 'ready' : 'idle'
  }

  function useMockData(): void {
    currentPath.value = ''
    currentData.value = null
    error.value = ''
    progress.value = 0
    status.value = 'idle'
  }

  return {
    status,
    progress,
    error,
    recentFiles,
    currentPath,
    currentData,
    fileName,
    openPath,
    openPicker,
    clearError,
    useMockData,
  }
}
