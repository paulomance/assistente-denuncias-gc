/**
 * Interpreta o stdout do CSGOVE apenas para decidir QUANDO mudar a
 * mensagem de progresso na UI — nunca para decidir sucesso/falha (isso
 * continua sendo responsabilidade exclusiva do exit code, ver
 * CsgoveRunner.ts e docs/plano-frente-b.md, Fase B2).
 *
 * Texto real observado na validacao empirica: o CSGOVE imprime
 * "Parsing done, generating audio files..." quando termina de ler a demo
 * e comeca a gerar os arquivos de audio.
 */
export function hasStartedGeneratingAudioFiles(accumulatedStdout: string): boolean {
  return accumulatedStdout.includes('generating audio files')
}
