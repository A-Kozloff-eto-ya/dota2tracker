import { useCallback, useEffect, useState } from 'react'

import { DEFAULT_RATING_CONFIG } from '@/lib/rating'
import { STORAGE_KEYS, loadJSON, saveJSON } from '@/lib/storage'
import type { RatingConfig } from '@/types'

function mergeConfig(partial: Partial<RatingConfig>): RatingConfig {
  return {
    ...DEFAULT_RATING_CONFIG,
    ...partial,
    weights: { ...DEFAULT_RATING_CONFIG.weights, ...(partial.weights ?? {}) },
    thresholds: { ...DEFAULT_RATING_CONFIG.thresholds, ...(partial.thresholds ?? {}) },
    benchmark: { ...DEFAULT_RATING_CONFIG.benchmark, ...(partial.benchmark ?? {}) },
  }
}

export function useRatingConfig() {
  const [config, setConfig] = useState<RatingConfig>(() =>
    mergeConfig(loadJSON<Partial<RatingConfig>>(STORAGE_KEYS.config, {})),
  )

  useEffect(() => {
    saveJSON(STORAGE_KEYS.config, config)
  }, [config])

  const resetConfig = useCallback(() => setConfig(DEFAULT_RATING_CONFIG), [])

  return { config, setConfig, resetConfig }
}
