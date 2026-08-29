/**
 * Estimativa de duracao do processamento do CSGOVE, calibrada com um
 * ponto de referencia real: uma demo de partida completa (44 min,
 * 316.640.315 bytes) processada 4 vezes nesta maquina durante a
 * validacao empirica (B2/B3), com tempos de 18700ms, 15570ms, 16277ms e
 * 13685ms — media de 16058ms (ver docs/plano-frente-b.md).
 *
 * O CSGOVE nao expoe nenhum sinal de progresso real (confirmado no
 * --help e no stdout durante a validacao empirica: so 3 linhas de texto,
 * sem percentual nem contagem de etapas). O tamanho do arquivo e a unica
 * variavel conhecida antes de comecar o processamento, entao esta e uma
 * projecao linear simples a partir dela — uma estimativa tecnicamente
 * defensavel (baseada em medicao real), nao um numero inventado. Com
 * apenas uma demo real disponivel para calibrar, o ideal e revisar esta
 * constante se, no futuro, dados de demos de tamanhos bem diferentes
 * mostrarem que a relacao nao e linear.
 */
const CALIBRATION_FILE_SIZE_BYTES = 316_640_315
const CALIBRATION_DURATION_MS = (18700 + 15570 + 16277 + 13685) / 4 // 16058ms
const EMPIRICAL_BYTES_PER_MS = CALIBRATION_FILE_SIZE_BYTES / CALIBRATION_DURATION_MS

export function estimateProcessingDurationMs(fileSizeBytes: number): number {
  if (fileSizeBytes <= 0) {
    return CALIBRATION_DURATION_MS
  }
  return fileSizeBytes / EMPIRICAL_BYTES_PER_MS
}
