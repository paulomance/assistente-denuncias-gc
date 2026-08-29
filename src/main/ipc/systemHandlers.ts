import { app, ipcMain, shell } from 'electron'
import { isRunningElevated } from '../services/elevationCheck'
import { getAppInfo } from '../services/releaseChannel'
import { getThirdPartyNoticesPath } from '../services/thirdPartyNotices'
import type { AppInfo } from '../../shared/types/AppInfo'

/**
 * Calculado uma unica vez no startup (nao muda durante a execucao do
 * processo) — evita rodar `net session` a cada chamada da UI.
 */
const elevated = isRunningElevated()

export function registerSystemIpcHandlers(): void {
  ipcMain.handle('system:isRunningElevated', async (): Promise<boolean> => elevated)
  ipcMain.handle('system:getAppInfo', async (): Promise<AppInfo> => getAppInfo())

  /**
   * Fecha e reabre o app de verdade — usado depois de mudar a
   * aceleração por hardware (única configuração que exige reinício
   * completo pra ter efeito, ver settingsHandlers.ts). `relaunch()`
   * agenda a reabertura, `exit()` encerra o processo atual sem esperar
   * o ciclo normal de `before-quit`/`window-all-closed` — comportamento
   * padrão do Electron pra um reinício deliberado.
   */
  ipcMain.handle('system:restartApp', async (): Promise<void> => {
    app.relaunch()
    app.exit(0)
  })

  /**
   * Abre o arquivo de avisos de terceiros (CSGOVE + dependências npm,
   * ver thirdPartyNotices.ts) no leitor de texto padrão do sistema —
   * mesmo mecanismo já usado pra abrir a pasta de uma denúncia
   * (`evidence:openFolder`). `shell.openPath` funciona tanto pra
   * arquivo quanto pra pasta, e devolve uma string de erro (nunca
   * lança exceção) quando falha — por isso o log aqui, só em dev, pra
   * nunca esconder silenciosamente um caminho quebrado.
   */
  ipcMain.handle('system:openThirdPartyNotices', async (): Promise<void> => {
    const errorMessage = await shell.openPath(getThirdPartyNoticesPath())
    if (errorMessage && !app.isPackaged) {
      console.error(`[system] Não foi possível abrir o arquivo de licenças: ${errorMessage}`)
    }
  })
}
