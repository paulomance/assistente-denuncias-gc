import { readFileSync } from 'fs'
import { resolve, sep } from 'path'
import { getTempOutputRoot } from './tempOutputCleanup'

export class AudioPathRejectedError extends Error {
  constructor(audioPath: string) {
    super(`Caminho de áudio fora da área temporária esperada, recusado por segurança: ${audioPath}`)
    this.name = 'AudioPathRejectedError'
  }
}

/**
 * Le um .wav extraido pelo CSGOVE pra reproduzir na selecao de
 * jogadores (ver PlayerSelectionList.tsx) — a UNICA fonte de audio que
 * este canal deveria servir. `audioPath` chega do renderer como parte
 * de um `ExtractedVoice` que o proprio main process gerou e mandou pra
 * la (nunca digitado/escolhido livremente pelo usuario), mas o
 * renderer roda JS de terceiros em teoria nenhum (sandbox +
 * contextIsolation) — mesmo assim, defesa em profundidade: so aceita
 * ler um caminho que esteja DENTRO da raiz temporaria do CSGOVE
 * (`getTempOutputRoot()`), nunca um caminho arbitrario do filesystem.
 * Mesmo padrao de seguranca ja usado por
 * `localReportsStore.ts::deleteLocalReportFolder`.
 */
export function readExtractedAudioFile(audioPath: string): Buffer {
  const tempRoot = resolve(getTempOutputRoot())
  const resolvedPath = resolve(audioPath)

  if (resolvedPath !== tempRoot && !resolvedPath.startsWith(tempRoot + sep)) {
    throw new AudioPathRejectedError(audioPath)
  }

  return readFileSync(resolvedPath)
}
