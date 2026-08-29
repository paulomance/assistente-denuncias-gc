import { autoUpdater } from 'electron-updater'
import { getReleaseChannel } from './releaseChannel'
import type { UpdateStatus } from '../../shared/types/Update'

/**
 * PENDENTE DE INFRAESTRUTURA — nao decidido nesta rodada de proposito
 * (depende de escolha de hosting, decisao comercial/externa fora do
 * escopo de decisao unilateral, ver docs/HANDOFF.md). Enquanto
 * permanecer `false`, `isUpdateCheckingAvailable()` sempre retorna
 * `false` e NENHUMA chamada de rede de atualizacao acontece — a UI
 * (ver UpdateNotification.tsx) simplesmente nao mostra nada, nunca
 * finge estar "verificando" ou "atualizado" sem checar de verdade.
 *
 * Pra ativar em producao, depois de escolher o hosting (ver skill
 * desktop-distribution-and-updates): (1) configurar `build.publish` em
 * package.json apontando pro feed real (provider `generic` com a URL
 * HTTPS, ou `github` se o repositorio for publico); (2) publicar pelo
 * menos uma release real la (instalador + `latest.yml` + blockmap,
 * gerados automaticamente por `electron-builder --publish=always`);
 * (3) trocar esta constante pra `true`. Nenhuma mudanca de codigo alem
 * disso e necessaria — todo o resto deste arquivo ja e real.
 */
const UPDATE_FEED_CONFIGURED = false

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
  autoUpdater.on('update-downloaded', (info) => sender({ status: 'ready', version: info.version }))
  autoUpdater.on('error', (error) => sender({ status: 'error', message: error.message }))
}

export async function checkForUpdates(): Promise<void> {
  if (!isUpdateCheckingAvailable()) return
  await autoUpdater.checkForUpdates()
}

export async function downloadUpdate(): Promise<void> {
  if (!isUpdateCheckingAvailable()) return
  await autoUpdater.downloadUpdate()
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
