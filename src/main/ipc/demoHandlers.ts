import { BrowserWindow, dialog, ipcMain } from 'electron'
import { DemoManager } from '../services/DemoManager'
import type { DemoValidationResult } from '../../shared/types/DemoInput'

const demoManager = new DemoManager()

/**
 * Canais IPC da etapa B1. Nomes explicitos e tipados propositalmente
 * (nada de um canal generico tipo "invoke(channel, ...args)" exposto ao
 * renderer) para manter a superficie de IPC pequena e auditavel.
 */
export function registerDemoIpcHandlers(): void {
  ipcMain.handle('demo:validate', (_event, localPath: string): DemoValidationResult => {
    return demoManager.validate(localPath, 'manual')
  })

  ipcMain.handle('demo:selectViaDialog', async (event): Promise<DemoValidationResult | null> => {
    const window = BrowserWindow.fromWebContents(event.sender)
    const dialogOptions: Electron.OpenDialogOptions = {
      title: 'Selecionar demo',
      filters: [{ name: 'CS Demo', extensions: ['dem'] }],
      properties: ['openFile']
    }
    const result = window
      ? await dialog.showOpenDialog(window, dialogOptions)
      : await dialog.showOpenDialog(dialogOptions)

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    return demoManager.validate(result.filePaths[0], 'manual')
  })
}
