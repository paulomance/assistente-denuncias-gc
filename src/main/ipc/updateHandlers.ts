import { ipcMain, type BrowserWindow } from 'electron'
import {
  checkForUpdates,
  downloadUpdate,
  isUpdateCheckingAvailable,
  quitAndInstall,
  registerUpdateEvents
} from '../services/updateChecker'
import type { UpdateStatus } from '../../shared/types/Update'

/**
 * App de janela unica (ver main/index.ts) — recebe a janela ja criada
 * pra poder transmitir os eventos de atualizacao a qualquer momento
 * (chegam de forma assincrona e independente de qual chamada de IPC os
 * disparou, ver updateChecker.ts::registerUpdateEvents).
 */
export function registerUpdateIpcHandlers(mainWindow: BrowserWindow): void {
  registerUpdateEvents((status: UpdateStatus) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update:status', status)
    }
  })

  ipcMain.handle('update:isAvailable', async (): Promise<boolean> => isUpdateCheckingAvailable())

  ipcMain.handle('update:check', async (): Promise<void> => {
    await checkForUpdates()
  })

  ipcMain.handle('update:download', async (): Promise<void> => {
    await downloadUpdate()
  })

  ipcMain.handle('update:quitAndInstall', async (): Promise<void> => {
    quitAndInstall()
  })
}
