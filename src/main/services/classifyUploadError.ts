import { GoogleApiError } from './google/GoogleApiError'
import type { CloudStorageErrorKind } from '../../shared/types/CloudStorage'

/**
 * Extraído de `driveHandlers.ts` pra ser testável isoladamente (mesmo
 * motivo de `reportDeletion.ts`: lógica inline dentro de um callback
 * de `ipcMain.handle` não dá pra testar sem subir o `ipcMain` inteiro).
 *
 * ENOENT ao ler `metadata.json` (a pasta local da prova sumiu inteira,
 * não só os áudios dentro dela — ver checagem equivalente em
 * `GoogleDriveProvider.uploadReport` pro caso de só `audio/` estar
 * ausente/vazia) precisa da MESMA classificação que aquele outro
 * caminho: `'local-source-missing'`, nunca a mensagem genérica de
 * falha de envio do Google (achado real: antes disso caía sempre em
 * `'unexpected'`, que diz "suas evidências continuam salvas neste
 * computador" — o oposto do que de fato aconteceu).
 */
export function classifyUploadError(error: unknown): CloudStorageErrorKind {
  const isMissingLocalFolder =
    typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
  if (isMissingLocalFolder) {
    return 'local-source-missing'
  }
  return error instanceof GoogleApiError ? error.kind : 'unexpected'
}
