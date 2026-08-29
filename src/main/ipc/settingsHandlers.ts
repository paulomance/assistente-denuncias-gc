import { BrowserWindow, dialog, ipcMain } from 'electron'
import {
  getEvidenceRootDir,
  getFontSize,
  getHardwareAcceleration,
  getManagedEvidenceDir,
  getUiScale,
  getWindowMode,
  hasExplicitlyChosenEvidenceRootDir,
  isEvidenceRootDirMissing,
  setEvidenceRootDir,
  setFontSize,
  setHardwareAcceleration,
  setUiScale,
  setWindowMode
} from '../services/AppSettings'
import { reapplyUiScale, reapplyWindowMode } from '../services/windowAppearance'
import type {
  AppearanceSettings,
  EvidenceStorageInfo,
  FontSize,
  UiScale,
  WindowMode
} from '../../shared/types/Settings'

function buildAppearanceSettings(): AppearanceSettings {
  return {
    uiScale: getUiScale(),
    windowMode: getWindowMode(),
    fontSize: getFontSize(),
    hardwareAcceleration: getHardwareAcceleration()
  }
}

function buildStorageInfo(): EvidenceStorageInfo {
  return {
    rootDir: getEvidenceRootDir(),
    managedDir: getManagedEvidenceDir(),
    isConfigured: hasExplicitlyChosenEvidenceRootDir(),
    rootDirMissing: isEvidenceRootDirMissing()
  }
}

export function registerSettingsIpcHandlers(): void {
  ipcMain.handle('settings:getEvidenceStorageInfo', async (): Promise<EvidenceStorageInfo> => {
    return buildStorageInfo()
  })

  ipcMain.handle(
    'settings:chooseEvidenceRootDir',
    async (event): Promise<EvidenceStorageInfo | null> => {
      const window = BrowserWindow.fromWebContents(event.sender)
      const dialogOptions: Electron.OpenDialogOptions = {
        title: 'Escolher pasta para guardar as evidências',
        properties: ['openDirectory']
      }
      const result = window
        ? await dialog.showOpenDialog(window, dialogOptions)
        : await dialog.showOpenDialog(dialogOptions)

      if (result.canceled || result.filePaths.length === 0) {
        return null
      }

      setEvidenceRootDir(result.filePaths[0])
      return buildStorageInfo()
    }
  )

  ipcMain.handle('settings:getAppearance', async (): Promise<AppearanceSettings> => {
    return buildAppearanceSettings()
  })

  ipcMain.handle(
    'settings:setUiScale',
    async (event, scale: UiScale): Promise<AppearanceSettings> => {
      setUiScale(scale)
      const window = BrowserWindow.fromWebContents(event.sender)
      if (window) reapplyUiScale(window)
      return buildAppearanceSettings()
    }
  )

  ipcMain.handle(
    'settings:setWindowMode',
    async (event, mode: WindowMode): Promise<AppearanceSettings> => {
      setWindowMode(mode)
      const window = BrowserWindow.fromWebContents(event.sender)
      if (window) reapplyWindowMode(window)
      return buildAppearanceSettings()
    }
  )

  /**
   * Sem `reapply*` aqui de proposito: diferente de escala/modo de janela
   * (APIs do BrowserWindow, so no processo main), o tamanho de fonte e
   * puramente uma variavel CSS aplicada no processo renderer (ver
   * global.css e SettingsOverlay.tsx) — so persiste aqui.
   */
  ipcMain.handle(
    'settings:setFontSize',
    async (_event, size: FontSize): Promise<AppearanceSettings> => {
      setFontSize(size)
      return buildAppearanceSettings()
    }
  )

  /**
   * So persiste — nunca chama `app.disableHardwareAcceleration()` aqui
   * (so pode ser chamada antes de `app.whenReady()`, ver main/index.ts).
   * A mudança só tem efeito depois de reiniciar o app de verdade
   * (`system:restartApp`, em systemHandlers.ts) — a UI é responsável
   * por deixar isso claro e oferecer o reinício.
   */
  ipcMain.handle(
    'settings:setHardwareAcceleration',
    async (_event, enabled: boolean): Promise<AppearanceSettings> => {
      setHardwareAcceleration(enabled)
      return buildAppearanceSettings()
    }
  )
}
