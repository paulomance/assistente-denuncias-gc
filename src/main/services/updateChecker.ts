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
 * So existe pra saber, quando o `electron-updater` emitir `'error'`,
 * se ele estava checando ou baixando — o evento em si nao diferencia
 * (ver `registerUpdateEvents` abaixo), e a mensagem certa pro usuario
 * depende disso ("verificar" vs "baixar").
 *
 * Achado real (ver auditoria do looping de "Verificando
 * atualizacoes..."): nao existe mais nenhuma checagem automatica em
 * lugar nenhum do projeto — a UNICA forma de disparar
 * `checkForUpdates()` e o clique no botao "Verificar atualizacoes"
 * (ver SettingsOverlay.tsx). Por isso todo evento aqui e sempre
 * repassado pro `sender` sem excecao: nao ha mais um caso "checagem
 * de fundo, nunca vira alarme" pra filtrar — se `'checking-for-
 * update'` disparou, foi porque o usuario pediu, e o fluxo tem que
 * terminar (sucesso, "nenhuma atualizacao" ou erro) sempre visivel,
 * nunca preso num estado que nunca resolve.
 */
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
    sender({
      status: 'available',
      version: info.version,
      releaseNotes: toReleaseNotesText(info.releaseNotes),
      sizeBytes: info.files[0]?.size ?? null
    })
  })
  autoUpdater.on('update-not-available', () => sender({ status: 'not-available' }))
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
    downloadInFlight = false
    // Download so acontece apos o usuario clicar em "Atualizar agora"
    // (autoDownload e sempre false, ver abaixo) — a mensagem certa pro
    // estagio certo (nunca "baixar" pra um erro que aconteceu so
    // checando se existe atualizacao, nem o contrario).
    sender({ status: 'error', phase: wasDownload ? 'download' : 'check', message: error.message })
  })
}

export async function checkForUpdates(): Promise<void> {
  if (!isUpdateCheckingAvailable()) return
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
