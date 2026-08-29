import { ipcMain } from 'electron'
import { readExtractedAudioFile } from '../services/audioPlayback'
import type { ReadAudioFileResult } from '../../shared/types/Audio'

/**
 * Serve o conteudo de um .wav extraido pelo CSGOVE pra reproducao na
 * tela de selecao de jogadores (item novo desta rodada — antes o
 * usuario so descobria se o audio "pegou" no fim de todo o fluxo).
 * `ArrayBuffer` (nao `Buffer`, que nao cruza IPC de forma previsivel em
 * todo cenario) — o renderer monta um `Blob`/`URL.createObjectURL` a
 * partir dele.
 */
export function registerAudioIpcHandlers(): void {
  ipcMain.handle('audio:read', async (_event, audioPath: string): Promise<ReadAudioFileResult> => {
    try {
      const buffer = readExtractedAudioFile(audioPath)
      // `new Uint8Array(buffer)` copia os bytes pra um ArrayBuffer novo e
      // proprio (Buffer.buffer pode ser um SharedArrayBuffer internamente
      // dependendo de como o Node alocou, incompativel com o tipo
      // ArrayBuffer que o IPC/Blob esperam do outro lado).
      const arrayBuffer = new Uint8Array(buffer).buffer
      return { status: 'success', data: arrayBuffer }
    } catch {
      return { status: 'error' }
    }
  })
}
