import { describe, expect, it } from 'vitest'
import { DEFAULT_VOLUME_PERCENT, effectiveVolumePercent, percentToVolume } from './audioVolume'

describe('DEFAULT_VOLUME_PERCENT', () => {
  it('é 50 — decisão explícita do usuário (era 60 antes desta rodada)', () => {
    expect(DEFAULT_VOLUME_PERCENT).toBe(50)
  })
})

describe('percentToVolume', () => {
  it('converte 50% pro valor 0.5 que HTMLAudioElement.volume espera', () => {
    expect(percentToVolume(50)).toBe(0.5)
  })

  it('converte o padrão do app (DEFAULT_VOLUME_PERCENT) pro mesmo 0.5', () => {
    expect(percentToVolume(DEFAULT_VOLUME_PERCENT)).toBe(0.5)
  })

  it('nunca ultrapassa 1, mesmo com um valor acima de 100', () => {
    expect(percentToVolume(150)).toBe(1)
  })

  it('nunca fica negativo, mesmo com um valor abaixo de 0', () => {
    expect(percentToVolume(-20)).toBe(0)
  })

  it('0% vira exatamente 0 (silêncio total, não um resíduo de ponto flutuante)', () => {
    expect(percentToVolume(0)).toBe(0)
  })
})

describe('effectiveVolumePercent', () => {
  it('reflete o volume real quando não está mudo', () => {
    expect(effectiveVolumePercent(0.5, false)).toBe(50)
  })

  it('é sempre 0 quando mudo, mesmo com um volume alto guardado por baixo', () => {
    expect(effectiveVolumePercent(0.8, true)).toBe(0)
  })

  it('arredonda pro inteiro mais próximo (borda visual, não o valor real do <audio>)', () => {
    expect(effectiveVolumePercent(0.333, false)).toBe(33)
  })
})
