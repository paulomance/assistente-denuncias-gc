import type { CloudStorageErrorKind } from './CloudStorage'

export type DriveSignInResult =
  | { status: 'success' }
  | { status: 'error'; errorKind: CloudStorageErrorKind }

/**
 * Resultado de confirmar, contra o Drive de verdade (nao so o metadata
 * local), se o link de uma prova ainda e valido — ver
 * driveLinkVerification.ts. `'not-found'` so e retornado apos uma
 * confirmacao real do Google (ou porque o app ja sabia localmente que
 * a pasta tinha sido excluida) — nunca por suposicao. `'check-failed'`
 * cobre falhas ambiguas (rede, sessao expirada): a UI deve seguir
 * tratando o link como valido nesse caso, nunca acusar exclusao sem
 * confirmacao real.
 */
export type VerifyDriveLinkResult =
  | { status: 'exists'; shareLink: string }
  | { status: 'not-found' }
  | { status: 'check-failed'; errorKind: CloudStorageErrorKind }

export type UploadReportResult =
  | { status: 'success'; shareLink: string }
  | {
      status: 'partial'
      completed: number
      total: number
      /** `kind` distingue qual evidência falhou pra este jogador — áudio e chat são enviados/rastreados independentemente (ver GoogleDriveProvider.ts). */
      failedPlayers: { steamId64: string; displayName: string; kind: 'audio' | 'chat' }[]
      errorKind: CloudStorageErrorKind
    }
  | { status: 'error'; errorKind: CloudStorageErrorKind }

/**
 * Progresso REAL do upload, nunca uma porcentagem inventada — `total` e
 * `completed` refletem a contagem real de arquivos de audio da
 * denuncia (conhecida antes de comecar, ver GoogleDriveProvider.ts).
 * Sem suporte a progresso por bytes: a API do Google Drive usada aqui
 * (`drive.files.create` com `media.body` de um stream) nao expoe um
 * callback de bytes enviados sem trocar pra upload resumable — contagem
 * de arquivo e honesta e suficiente pro usuario entender que o
 * aplicativo esta trabalhando e quanto falta.
 */
export interface UploadProgress {
  stage: 'creating-folder' | 'uploading' | 'finalizing'
  completed: number
  total: number
}
