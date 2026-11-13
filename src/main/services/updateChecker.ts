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
 * Historico desta flag (pra nao reintroduzir nenhum dos dois bugs ja
 * encontrados de verdade):
 *
 * 1ª versao: checagem automatica ao abrir o app, SEM distincao
 * manual/automatica — qualquer erro de fundo (ex.: sem internet)
 * aparecia pro usuario como "Nao foi possivel baixar a atualizacao",
 * sem ele ter pedido nada.
 *
 * 2ª versao (pedido do usuario): removeu a checagem automatica por
 * completo — so o clique manual dispara `checkForUpdates()`. Resolveu
 * o alarme falso, mas criou um problema de distribuicao real: com ~300
 * instalacoes existentes e uma correcao critica pra publicar (troca do
 * binario do CSGOVE apos o CS2 quebrar compatibilidade em 11/11),
 * ninguem seria avisado sozinho ao abrir o app — dependeria de cada
 * usuario clicar "Verificar atualizacoes" por conta propria.
 *
 * 3ª versao (esta): reintroduz a checagem automatica ao abrir o app,
 * mas com uma regra estrita pedida explicitamente: uma checagem
 * automatica que falhar (sem internet, timeout, feed fora do ar, o que
 * for) tem que ficar 100% invisivel — nunca um estado "verificando"
 * nem um erro, nunca preso em lugar nenhum. So aparece alguma coisa pro
 * usuario se uma atualizacao de verdade for encontrada. Isso e
 * diferente de "esconder o erro": o erro continua acontecendo e pode
 * ser investigado via log (ver abaixo), so nao vira uma mensagem pro
 * usuario sem ele ter pedido. Uma checagem MANUAL (clique no botao)
 * sempre mostra tudo — checando, erro, ou "ja esta atualizado" — com a
 * mensagem certa pro estagio certo (`phase: 'check' | 'download'`).
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
  autoUpdater.on('checking-for-update', () => {
    // So mostra "Verificando..." numa checagem manual — numa checagem
    // automatica isso nunca aparece, pra nunca correr risco de ficar
    // visivelmente "preso" se a rede demorar ou falhar.
    if (activeCheck?.manual) sender({ status: 'checking' })
  })
  autoUpdater.on('update-available', (info) => {
    activeCheck = null
    // Unica coisa que SEMPRE aparece, mesmo vinda de uma checagem
    // automatica — e a informacao que realmente importa pro usuario.
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
    // download e sempre de uma acao manual, sempre visivel.
    if (wasDownload) {
      sender({ status: 'error', phase: 'download', message: error.message })
      return
    }
    if (manual) {
      sender({ status: 'error', phase: 'check', message: error.message })
      return
    }
    // Falha na checagem automatica de fundo — nunca vira alarme pro
    // usuario, que nao pediu nada e nao pode ficar com o app menos
    // usavel por causa disso. Fica registrado aqui pra quem for
    // depurar, nunca escondido de verdade.
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
  // erro de verdade (ou ficou em silencio de proposito) antes desse
  // catch rodar.
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
