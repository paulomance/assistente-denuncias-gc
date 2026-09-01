/**
 * Estados reais do fluxo de atualizacao via `electron-updater`
 * (ver services/updateChecker.ts) — nunca uma porcentagem/estado
 * inventado. `disabled` e o estado padrao enquanto nenhum feed de
 * atualizacao estiver configurado (ver UPDATE_FEED_CONFIGURED em
 * updateChecker.ts) ou fora do canal `production` — a UI simplesmente
 * nao mostra nada nesse caso, nunca finge estar verificando.
 *
 * `not-available` e `error` so chegam ate aqui quando resultam de uma
 * checagem/download que o usuario pediu de verdade (botao "Verificar
 * atualizacoes" ou "Atualizar agora") — a checagem automatica que roda
 * sozinha ao abrir o app nunca gera nenhum desses dois pro usuario
 * quando falha ou nao encontra nada, so quando encontra uma versao
 * nova de verdade (`available`). Ver `registerUpdateEvents` em
 * updateChecker.ts pra onde essa distincao e feita.
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
  // `phase` distingue um erro checando se existe atualizacao de um
  // erro baixando uma ja encontrada — sao causas e mensagens
  // diferentes, nunca a mesma frase generica pras duas.
  | { status: 'error'; phase: 'check' | 'download'; message: string }
