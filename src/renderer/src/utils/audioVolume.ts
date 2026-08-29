/**
 * Unica fonte da verdade pro volume inicial dos audios de jogador (ver
 * PlayerSelectionList.tsx) — 50% por decisao explicita do usuario (era
 * 60% antes desta rodada). Extraido pra ca pra nao virar um numero
 * magico duplicado entre o estado inicial e qualquer lugar que precise
 * "resetar" ou comparar contra o padrao.
 */
export const DEFAULT_VOLUME_PERCENT = 50

/** Converte a porcentagem exibida no slider (0-100) pro valor 0-1 que `HTMLAudioElement.volume` espera, sempre dentro dos limites. */
export function percentToVolume(percent: number): number {
  return Math.min(1, Math.max(0, percent / 100))
}

/**
 * Volume/mudo efetivos, sempre derivados do mesmo par (volume, isMuted)
 * — nunca dois estados independentes que possam divergir (ex.: mudo
 * "true" mas volume ainda em 50% escondido por baixo, mostrando 50%
 * na tela por engano). Arredonda pra inteiro só aqui, na borda visual —
 * o valor 0-1 real usado no elemento `<audio>` nunca perde precisão.
 */
export function effectiveVolumePercent(volume: number, isMuted: boolean): number {
  return Math.round((isMuted ? 0 : volume) * 100)
}
