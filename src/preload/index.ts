import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { DemoValidationResult } from '../shared/types/DemoInput'
import type { CsgoveProgressStage, ExtractedVoice, ProcessDemoResult } from '../shared/types/Csgove'
import type { OrganizeEvidenceResult } from '../shared/types/Evidence'
import type { AppearanceSettings, EvidenceStorageInfo, FontSize, UiScale, WindowMode } from '../shared/types/Settings'
import type { CloudAuthStatus } from '../shared/types/CloudStorage'
import type {
  DriveSignInResult,
  UploadProgress,
  UploadReportResult,
  VerifyDriveLinkResult
} from '../shared/types/Drive'
import type {
  DeleteDriveReportResult,
  DeleteLocalCopyResult,
  ReportHistoryEntry
} from '../shared/types/History'
import type { ReadAudioFileResult } from '../shared/types/Audio'
import type { AppInfo } from '../shared/types/AppInfo'
import type { UpdateStatus } from '../shared/types/Update'

/**
 * API explicita e tipada exposta ao renderer. Metodos com nomes de
 * dominio (selectDemoViaDialog, validateDemo, getPathForFile) em vez de um
 * "send(channel, ...args)" generico — o renderer nunca enxerga ipcRenderer
 * nem nomes de canal diretamente.
 */
const gcReportApi = {
  /**
   * O objeto File do drag-and-drop, quando o renderer roda com
   * contextIsolation, nao expoe mais `.path` (removido/depreciado pelo
   * Electron por seguranca). webUtils.getPathForFile e a API oficial para
   * recuperar o caminho absoluto no filesystem a partir do File.
   */
  getPathForFile: (file: File): string => webUtils.getPathForFile(file),

  validateDemo: (localPath: string): Promise<DemoValidationResult> =>
    ipcRenderer.invoke('demo:validate', localPath),

  selectDemoViaDialog: (): Promise<DemoValidationResult | null> =>
    ipcRenderer.invoke('demo:selectViaDialog'),

  processDemo: (localPath: string): Promise<ProcessDemoResult> =>
    ipcRenderer.invoke('demo:process', localPath),

  /**
   * Assina atualizacoes de estagio real de processamento (ver
   * CsgoveRunner.ts) para a UI mostrar o que esta acontecendo em vez de um
   * "Processando..." generico. Retorna uma funcao para cancelar a
   * assinatura.
   */
  onProcessingStage: (callback: (stage: CsgoveProgressStage) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, stage: CsgoveProgressStage): void =>
      callback(stage)
    ipcRenderer.on('demo:process-stage', listener)
    return () => ipcRenderer.removeListener('demo:process-stage', listener)
  },

  organizeEvidence: (
    demoPath: string,
    csgoveOutputDir: string,
    selectedPlayers: ExtractedVoice[]
  ): Promise<OrganizeEvidenceResult> =>
    ipcRenderer.invoke('evidence:organize', demoPath, csgoveOutputDir, selectedPlayers),

  openEvidenceFolder: (folderPath: string): Promise<void> =>
    ipcRenderer.invoke('evidence:openFolder', folderPath),

  getEvidenceStorageInfo: (): Promise<EvidenceStorageInfo> =>
    ipcRenderer.invoke('settings:getEvidenceStorageInfo'),

  chooseEvidenceRootDir: (): Promise<EvidenceStorageInfo | null> =>
    ipcRenderer.invoke('settings:chooseEvidenceRootDir'),

  getDriveAuthStatus: (): Promise<CloudAuthStatus> => ipcRenderer.invoke('drive:getAuthStatus'),

  signInToDrive: (): Promise<DriveSignInResult> => ipcRenderer.invoke('drive:signIn'),

  signOutOfDrive: (): Promise<void> => ipcRenderer.invoke('drive:signOut'),

  /**
   * Confirma se o link de uma prova ainda e valido antes de deixar o
   * usuario copia-lo/abri-lo — ver driveLinkVerification.ts. Aceita
   * tanto um `reportDir` real quanto o identificador sintetico
   * `drive-only:<reportId>` (denuncia sem copia local, ver
   * driveOnlyReportsIndex.ts).
   */
  verifyDriveLink: (folderPathOrSyntheticId: string): Promise<VerifyDriveLinkResult> =>
    ipcRenderer.invoke('drive:verifyLink', folderPathOrSyntheticId),

  uploadReportToDrive: (reportDir: string, reportId: string): Promise<UploadReportResult> =>
    ipcRenderer.invoke('drive:uploadReport', reportDir, reportId),

  /**
   * Progresso real do upload em andamento (contagem de arquivos, ver
   * UploadProgress) — mesmo padrao de `onProcessingStage`. So dispara
   * durante uma chamada a `uploadReportToDrive` em andamento.
   */
  onDriveUploadProgress: (callback: (progress: UploadProgress) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: UploadProgress): void =>
      callback(progress)
    ipcRenderer.on('drive:upload-progress', listener)
    return () => ipcRenderer.removeListener('drive:upload-progress', listener)
  },

  listReportHistory: (): Promise<ReportHistoryEntry[]> => ipcRenderer.invoke('history:listReports'),

  deleteLocalReportCopy: (folderPath: string): Promise<DeleteLocalCopyResult> =>
    ipcRenderer.invoke('history:deleteLocalCopy', folderPath),

  deleteReportFromDrive: (folderPath: string, driveFolderId: string): Promise<DeleteDriveReportResult> =>
    ipcRenderer.invoke('history:deleteFromDrive', folderPath, driveFolderId),

  /**
   * Usado so pra investigar/avisar sobre um problema real de drag-and-
   * drop no Windows: UIPI bloqueia silenciosamente drag-and-drop de OLE
   * entre processos com nivel de privilegio diferente (ex.: app rodando
   * como Administrador enquanto o Explorer nao) — ver
   * services/elevationCheck.ts.
   */
  isRunningElevated: (): Promise<boolean> => ipcRenderer.invoke('system:isRunningElevated'),

  /** Versão real (`app.getVersion()`) e canal de distribuição do build atual — ver AppInfo.ts. */
  getAppInfo: (): Promise<AppInfo> => ipcRenderer.invoke('system:getAppInfo'),

  /**
   * `false` sempre que nenhum feed de atualização estiver configurado
   * ou o build não for de produção — ver UPDATE_FEED_CONFIGURED em
   * updateChecker.ts. A UI nunca deve oferecer "verificar atualizações"
   * quando isto for `false`.
   */
  isUpdateCheckingAvailable: (): Promise<boolean> => ipcRenderer.invoke('update:isAvailable'),

  /**
   * A UNICA forma de disparar isso e o clique no botao "Verificar
   * atualizacoes" (ver SettingsOverlay.tsx) — nao existe checagem
   * automatica em lugar nenhum do app (ver updateChecker.ts).
   */
  checkForUpdates: (): Promise<void> => ipcRenderer.invoke('update:check'),

  downloadUpdate: (): Promise<void> => ipcRenderer.invoke('update:download'),

  quitAndInstallUpdate: (): Promise<void> => ipcRenderer.invoke('update:quitAndInstall'),

  /** Progresso/estado real do fluxo de atualização — ver UpdateStatus. */
  onUpdateStatus: (callback: (status: UpdateStatus) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: UpdateStatus): void => callback(status)
    ipcRenderer.on('update:status', listener)
    return () => ipcRenderer.removeListener('update:status', listener)
  },

  getAppearanceSettings: (): Promise<AppearanceSettings> => ipcRenderer.invoke('settings:getAppearance'),

  setUiScale: (scale: UiScale): Promise<AppearanceSettings> =>
    ipcRenderer.invoke('settings:setUiScale', scale),

  setWindowMode: (mode: WindowMode): Promise<AppearanceSettings> =>
    ipcRenderer.invoke('settings:setWindowMode', mode),

  setFontSize: (size: FontSize): Promise<AppearanceSettings> =>
    ipcRenderer.invoke('settings:setFontSize', size),

  /**
   * Só persiste a preferência — nunca tem efeito imediato (aceleração
   * por GPU só pode ser configurada antes do Electron inicializar).
   * Precisa de `restartApp()` pra aplicar de verdade.
   */
  setHardwareAcceleration: (enabled: boolean): Promise<AppearanceSettings> =>
    ipcRenderer.invoke('settings:setHardwareAcceleration', enabled),

  /** Fecha e reabre o app de verdade — usado após mudar a aceleração por hardware. */
  restartApp: (): Promise<void> => ipcRenderer.invoke('system:restartApp'),

  /** Abre licenses/THIRD-PARTY-NOTICES.txt (CSGOVE + dependências npm) no leitor de texto padrão do sistema. */
  openThirdPartyNotices: (): Promise<void> => ipcRenderer.invoke('system:openThirdPartyNotices'),

  /**
   * Le os bytes reais de um .wav extraido pelo CSGOVE, pra reproduzir
   * na tela de selecao de jogadores — nunca uma URL `file://` direta
   * (bloqueada pelo CSP de proposito). O main process valida que o
   * caminho esta dentro da area temporaria esperada antes de ler (ver
   * services/audioPlayback.ts).
   */
  readAudioFile: (audioPath: string): Promise<ReadAudioFileResult> =>
    ipcRenderer.invoke('audio:read', audioPath)
}

contextBridge.exposeInMainWorld('gcReport', gcReportApi)

export type GcReportApi = typeof gcReportApi
