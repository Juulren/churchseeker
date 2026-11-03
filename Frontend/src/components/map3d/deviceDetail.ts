import type { Detail } from './kit/facadeKit.ts'

interface Hints { deviceMemory?: number; hardwareConcurrency?: number; connection?: { saveData?: boolean } }

/**
 * The level of detail the church viewer builds: the light map level on a weak device (little memory, two cores or fewer,
 * or the data saver on), the full level everywhere else. The map always uses the light level.
 */
export function deviceDetail(nav: Hints | null = typeof navigator === 'undefined' ? null : (navigator as Hints)): Detail {
  if (!nav) return 'high'
  if (nav.connection?.saveData) return 'low'
  if (nav.deviceMemory !== undefined && nav.deviceMemory <= 2) return 'low'
  if (nav.hardwareConcurrency !== undefined && nav.hardwareConcurrency <= 2) return 'low'
  return 'high'
}
