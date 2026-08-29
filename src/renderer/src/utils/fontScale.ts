import type { FontSize } from '../../../shared/types/Settings'

/**
 * Mesma proporcao usada pelos fatores fixos de UiScale (ver
 * FIXED_SCALE_FACTORS em windowAppearance.ts) — mantem a sensacao de
 * "pequeno/medio/grande" consistente entre as duas preferencias, mesmo
 * sendo mecanismos tecnicos diferentes (zoom nativo do Chromium vs.
 * variavel CSS só de fonte).
 */
const FONT_SCALE_FACTORS: Record<FontSize, number> = {
  small: 0.9,
  medium: 1,
  large: 1.15
}

/** Aplica a preferencia de tamanho de fonte na raiz do documento (ver --gc-font-scale em global.css). */
export function applyFontScale(size: FontSize): void {
  document.documentElement.style.setProperty('--gc-font-scale', String(FONT_SCALE_FACTORS[size]))
}
