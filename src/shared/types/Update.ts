/**
 * Estados reais do fluxo de atualizacao via `electron-updater`
 * (ver services/updateChecker.ts) — nunca uma porcentagem/estado
 * inventado. `disabled` e o estado padrao enquanto nenhum feed de
 * atualizacao estiver configurado (ver UPDATE_FEED_CONFIGURED em
 * updateChecker.ts) ou fora do canal `production` — a UI simplesmente
 * nao mostra nada nesse caso, nunca finge estar verificando.
 */
export type UpdateStatus =
  | { status: 'disabled' }
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'not-available' }
  | {
      status: 'available'
      version: string
      releaseNotes: string | null
      sizeBytes: number | null
    }
  | { status: 'downloading'; percent: number; transferredBytes: number; totalBytes: number }
  | { status: 'ready'; version: string }
  | { status: 'error'; message: string }
