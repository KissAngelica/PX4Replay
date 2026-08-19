export function formatNumber(value: number | undefined, digits: number, unit = ''): string {
  if (value === undefined || !Number.isFinite(value)) return '--'
  return `${value.toFixed(digits)}${unit ? ` ${unit}` : ''}`
}

export function formatPercent(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return '--'
  return `${Math.round(Math.min(Math.max(value, 0), 1) * 100)} %`
}

export function radiansToDegrees(value: number | undefined, wrap = false): string {
  if (value === undefined || !Number.isFinite(value)) return '--'
  let degrees = (value * 180) / Math.PI
  if (wrap) degrees = ((degrees % 360) + 360) % 360
  return `${degrees.toFixed(1)}°`
}

export function formatTimeUs(timeUs: number | undefined): string {
  if (timeUs === undefined || !Number.isFinite(timeUs)) return '--'
  const totalMs = Math.max(0, Math.floor(timeUs / 1000))
  const hours = Math.floor(totalMs / 3_600_000)
  const minutes = Math.floor((totalMs % 3_600_000) / 60_000)
  const seconds = Math.floor((totalMs % 60_000) / 1000)
  const milliseconds = totalMs % 1000
  const prefix = hours > 0 ? `${hours.toString().padStart(2, '0')}:` : ''
  return `${prefix}${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`
}
