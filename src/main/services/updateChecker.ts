import { autoUpdater } from 'electron-updater'
import { getReleaseChannel } from './releaseChannel'
import type { UpdateStatus } from '../../shared/types/Update'

/**
 * Feed de atualizacao ativado: `build.publish` em package.json ja
 * aponta pro provider `github` (owner/repo reais) e todo build de
 * producao a partir de agora e publicado com esse feed configurado
 * desde a compilacao — condicao necessaria, ja que isto e uma
 * constante compilada no binario, nunca lida em runtime. Enquanto
 * fosse `false`, `isUpdateCheckingAvailable()` sempre retornava
 * `false` e nenhuma chamada de rede de atualizacao acontecia.
 */
const UPDATE_FEED_CONFIGURED = true

autoUpdater.autoDownload = false
autoUpdater.autoInstallOnAppQuit = false

/**
 * Atualizacao automatica so faz sentido pra um build de producao real —
 * nunca em dev (nada pra atualizar, `npm run dev` sempre "recompila" na
 * hora) e nunca no canal `test` por ora (nao existe um feed de teste
 * separado do de producao ainda; mixar os dois arriscaria um instalador
 * de teste instavel sendo oferecido como "atualizacao" — ver item 9 do
 * pedido original sobre nao confundir ambientes).
 */
export function isUpdateCheckingAvailable(): boolean {
  return UPDATE_FEED_CONFIGURED && getReleaseChannel() === 'production'
}

function toReleaseNotesText(releaseNotes: string | { note: string | null }[] | null | undefined): string | null {
  if (!releaseNotes) return null
  if (typeof releaseNotes === 'string') return releaseNotes
  return releaseNotes.map((entry) => entry.note).filter(Boolean).join('\n\n') || null
}

/**
 * Rastreia qual operacao esta em andamento pra saber, quando o
 * `electron-updater` emitir `'error'`, se ele estava checando ou
 * baixando — o evento em si nao diferencia (ver
 * `registerUpdateEvents` abaixo). `checkIsManual` diferencia a
 * checagem automatica (disparada sozinha ao abrir o app, ver
 * UpdateNotification.tsx) de uma checagem que o usuario pediu de
 * verdade (botao "Verificar atualizacoes") — achado real: antes essa
 * distincao nao existia, entao QUALQUER falha da checagem automatica
 * (ex.: sem internet no momento em que o app abre) aparecia pro
 * usuario como "Nao foi possivel baixar a atualizacao", mesmo sem
 * nenhum download ter sido tentado e sem o usuario ter pedido nada.
 */
let activeCheck: { manual: boolean } | null = null
let downloadInFlight = false

/**
 * Assina os eventos reais do `electron-updater` e repassa pro `sender`
 * (tipicamente `mainWindow.webContents.send`, ver ipc/updateHandlers.ts)
 * — nunca uma porcentagem/estado calculado aqui, so o que o
 * `electron-updater` de fato reportou.
 */
export function registerUpdateEvents(sender: (status: UpdateStatus) => void): void {
  autoUpdater.on('checking-for-update', () => sender({ status: 'checking' }))
  autoUpdater.on('update-available', (info) => {
    activeCheck = null
    sender({
      status: 'available',
      version: info.version,
      releaseNotes: toReleaseNotesText(info.releaseNotes),
      sizeBytes: info.files[0]?.size ?? null
    })
  })
  autoUpdater.on('update-not-available', () => {
    const manual = activeCheck?.manual ?? false
    activeCheck = null
    // So informa "nenhuma atualizacao" quando o usuario pediu a
    // checagem de verdade — a checagem automatica de fundo nunca deve
    // gerar nenhum feedback visivel quando nao ha nada de novo (ver
    // comentario de isUpdateCheckingAvailable acima).
    if (manual) sender({ status: 'not-available' })
  })
  autoUpdater.on('download-progress', (progress) => {
    sender({
      status: 'downloading',
      percent: Math.round(progress.percent),
      transferredBytes: progress.transferred,
      totalBytes: progress.total
    })
  })
  autoUpdater.on('update-downloaded', (info) => {
    downloadInFlight = false
    sender({ status: 'ready', version: info.version })
  })
  autoUpdater.on('error', (error) => {
    const wasDownload = downloadInFlight
    const manual = activeCheck?.manual ?? false
    downloadInFlight = false
    activeCheck = null
    // Download so acontece apos o usuario clicar em "Atualizar agora"
    // (autoDownload e sempre false, ver abaixo) — entao um erro de
    // download e sempre real e sempre visivel, com a mensagem certa
    // pro estagio certo (nunca "baixar" pra um erro que aconteceu so
    // checando se existe atualizacao).
    if (wasDownload) {
      sender({ status: 'error', phase: 'download', message: error.message })
      return
    }
    if (manual) {
      sender({ status: 'error', phase: 'check', message: error.message })
      return
    }
    // Falha na checagem automatica de fundo (ex.: sem internet, feed
    // temporariamente fora do ar) — nunca vira alarme pro usuario, que
    // nao pediu nada. Fica registrado aqui pra quem estiver depurando,
    // nunca escondido de verdade — so nao e um erro acionavel pelo
    // usuario nesse momento.
    console.error('[updateChecker] checagem automatica de atualizacao falhou (silenciosa):', error.message)
  })
}

export async function checkForUpdates(manual = false): Promise<void> {
  if (!isUpdateCheckingAvailable()) return
  activeCheck = { manual }
  // O proprio evento 'error' (ver acima) e o canal real de erro — a
  // promise tambem pode rejeitar pro mesmo erro, mas so seria uma
  // segunda notificacao redundante (e um unhandled rejection se
  // ninguem desse lado desse `.catch`, ja que quem chama isso e
  // fire-and-forget). Nao esconde nada: o `sender` acima ja recebeu o
  // erro de verdade antes desse catch rodar.
  await autoUpdater.checkForUpdates().catch(() => {})
}

export async function downloadUpdate(): Promise<void> {
  if (!isUpdateCheckingAvailable()) return
  downloadInFlight = true
  await autoUpdater.downloadUpdate().catch(() => {})
}

/**
 * Fecha o app e instala a atualizacao ja baixada — so deve ser chamado
 * depois do evento `'ready'` (update-downloaded). Nunca preserva estado
 * em memoria: os dados do usuario (metadata.json, checkpoints,
 * configuracoes) ja vivem em disco (userData/pastas de evidencia), nao
 * na memoria do processo, entao reiniciar o app pra instalar nunca
 * perde nada — ver auditoria de compatibilidade de dados no HANDOFF.
 */
export function quitAndInstall(): void {
  autoUpdater.quitAndInstall()
}
