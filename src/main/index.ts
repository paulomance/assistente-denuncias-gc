import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { registerDemoIpcHandlers } from './ipc/demoHandlers'
import { registerCsgoveIpcHandlers } from './ipc/csgoveHandlers'
import { registerEvidenceIpcHandlers } from './ipc/evidenceHandlers'
import { registerSettingsIpcHandlers } from './ipc/settingsHandlers'
import { registerDriveIpcHandlers } from './ipc/driveHandlers'
import { registerHistoryIpcHandlers } from './ipc/historyHandlers'
import { registerSystemIpcHandlers } from './ipc/systemHandlers'
import { registerAudioIpcHandlers } from './ipc/audioHandlers'
import { registerUpdateIpcHandlers } from './ipc/updateHandlers'
import { cleanupOrphanedStagingFolders, cleanupStaleTempOutput } from './services/tempOutputCleanup'
import { applyPersistedAppearance } from './services/windowAppearance'
import { getHardwareAcceleration } from './services/AppSettings'

/**
 * Achado real ao testar o ciclo de instalacao (ver
 * .claude/skills/desktop-distribution-and-updates): como `productName`
 * tem acentos ("Assistente de Denúncias..."), o electron-builder cai
 * pro `name` tecnico do package.json ("assistente-denuncias-gc") tanto pra
 * pasta de instalacao NSIS quanto — mais importante — pro
 * `app.getName()` que o Electron usa pra calcular o `userData` padrao
 * (`%APPDATA%\<nome>`). Sem isso, um `npm run dev` rodando na mesma
 * maquina que uma instalacao real de producao LERIA/ESCREVERIA o MESMO
 * settings.json e o MESMO token OAuth criptografado da instalacao real
 * — risco real de um teste de desenvolvimento corromper dados de
 * producao. `app.setPath('userData', ...)` isola o dev num sufixo
 * proprio, tem que rodar ANTES de qualquer `app.getPath('userData')`
 * (por isso aqui, antes de app.whenReady()). Builds de teste
 * (`npm run dist:win:test`) ja ficam isolados por outro mecanismo —
 * `extraMetadata.name` sobrescrito no package.json empacotado, ver
 * package.json.
 */
if (!app.isPackaged) {
  app.setPath('userData', `${app.getPath('userData')}-dev`)
}

/**
 * Desligada por padrao (ver AppSettings.ts::getHardwareAcceleration).
 * So pode ser chamada ANTES de `app.whenReady()` — por isso aqui, no
 * nivel superior do modulo, nunca dentro do callback de whenReady().
 * Ler a preferencia AQUI (depois do isolamento de userData de dev
 * acima) garante que dev/teste/producao cada um le a sua propria
 * preferencia, nunca uma compartilhada.
 */
if (!getHardwareAcceleration()) {
  app.disableHardwareAcceleration()
}

/**
 * So relevante em desenvolvimento: o app empacotado ja tem o icone
 * embutido diretamente no .exe pelo electron-builder (`build.win.icon`
 * em package.json), o Windows usa esse recurso sozinho sem precisar
 * disto. Sem isso, `npm run dev` mostraria o icone padrao do Electron na
 * janela/taskbar em vez do icone real do app.
 */
function resolveDevIconPath(): string | undefined {
  return app.isPackaged ? undefined : join(app.getAppPath(), 'resources', 'icons', 'report-tool-icon.ico')
}

function createWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 620,
    show: false,
    autoHideMenuBar: true,
    icon: resolveDevIconPath(),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })

  applyPersistedAppearance(mainWindow)

  // Links externos (se algum dia existirem) abrem no navegador do sistema,
  // nunca em uma nova janela Electron.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  const rendererDevServerUrl = process.env['ELECTRON_RENDERER_URL']
  if (!app.isPackaged && rendererDevServerUrl) {
    mainWindow.loadURL(rendererDevServerUrl)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

app.whenReady().then(() => {
  // So em dev: marca visivel no terminal de quando o processo PRINCIPAL
  // (nao o renderer) subiu de verdade. Diferente do renderer, que
  // atualiza sozinho via HMR do Vite a cada salvamento, o processo main
  // do Electron so pega mudancas em `src/main/**` quando reinicia — o
  // electron-vite normalmente reinicia sozinho, mas se isso nao
  // acontecer por qualquer motivo, o processo continua rodando codigo
  // antigo silenciosamente. Este log deixa isso verificavel: se o
  // horario aqui for muito mais antigo que a ultima edicao de codigo,
  // o processo esta desatualizado — feche tudo (inclusive processos
  // `electron.exe` remanescentes) e rode `npm run dev` de novo.
  if (!app.isPackaged) {
    console.log(`[main] Processo principal do Electron iniciado às ${new Date().toLocaleTimeString('pt-BR')}`)
  }
  cleanupStaleTempOutput()
  cleanupOrphanedStagingFolders()
  registerDemoIpcHandlers()
  registerCsgoveIpcHandlers()
  registerEvidenceIpcHandlers()
  registerSettingsIpcHandlers()
  registerDriveIpcHandlers()
  registerHistoryIpcHandlers()
  registerSystemIpcHandlers()
  registerAudioIpcHandlers()
  const mainWindow = createWindow()
  registerUpdateIpcHandlers(mainWindow)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
