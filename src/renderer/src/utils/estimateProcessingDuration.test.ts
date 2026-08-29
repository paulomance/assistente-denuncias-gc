import { describe, expect, it } from 'vitest'
import { estimateProcessingDurationMs } from './estimateProcessingDuration'

describe('estimateProcessingDurationMs', () => {
  it('estima algo perto da media real observada para uma demo do mesmo tamanho da calibracao', () => {
    const estimate = estimateProcessingDurationMs(316_640_315)
    expect(estimate).toBeCloseTo(16058, -2)
  })

  it('escala proporcionalmente ao tamanho do arquivo', () => {
    const half = estimateProcessingDurationMs(316_640_315 / 2)
    const full = estimateProcessingDurationMs(316_640_315)
    expect(half).toBeCloseTo(full / 2, 0)
  })

  it('nao quebra com tamanho zero ou negativo (usa a duracao de calibracao como base segura)', () => {
    expect(estimateProcessingDurationMs(0)).toBeGreaterThan(0)
    expect(estimateProcessingDurationMs(-1)).toBeGreaterThan(0)
  })
})
