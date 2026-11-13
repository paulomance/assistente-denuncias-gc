import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UpdateStatus } from '../../shared/types/Update'

/**
 * Dublê real do `autoUpdater` do `electron-updater` — um EventEmitter
 * de verdade, pra disparar exatamente os mesmos eventos
 * ('checking-for-update', 'update-available', 'error' etc.) que a
 * biblioteca real dispara, sem precisar de rede nem do Electron.
 */
class FakeAutoUpdater extends EventEmitter {
  autoDownload = true
  autoInstallOnAppQuit = true
  checkForUpdates = vi.fn(() => Promise.resolve())
  downloadUpdate = vi.fn(() => Promise.resolve())
  quitAndInstall = vi.fn()
}

let fakeAutoUpdater = new FakeAutoUpdater()
let releaseChannel: 'development' | 'test' | 'production' = 'production'

vi.mock('electron-updater', () => ({
  get autoUpdater() {
    return fakeAutoUpdater
  }
}))

vi.mock('./releaseChannel', () => ({
  getReleaseChannel: () => releaseChannel
}))

async function freshModule(): Promise<typeof import('./updateChecker')> {
  vi.resetModules()
  fakeAutoUpdater = new FakeAutoUpdater()
  return import('./updateChecker')
}

beforeEach(() => {
  releaseChannel = 'production'
})

describe('checkForUpdates/downloadUpdate — desligados fora do canal production', () => {
  it('nunca chama o electron-updater quando o canal não é production', async () => {
    releaseChannel = 'development'
    const { checkForUpdates, downloadUpdate } = await freshModule()
    await checkForUpdates()
    await downloadUpdate()
    expect(fakeAutoUpdater.checkForUpdates).not.toHaveBeenCalled()
    expect(fakeAutoUpdater.downloadUpdate).not.toHaveBeenCalled()
  })
})

/**
 * Histórico real (3 rodadas, não reintroduzir nenhum dos dois bugs já
 * encontrados):
 *
 * 1ª: checagem automática sem distinção manual/automática — qualquer
 * erro de fundo (sem internet, feed fora do ar) virava "Não foi
 * possível baixar a atualização" sem o usuário ter pedido nada.
 *
 * 2ª (a pedido do usuário): removida a checagem automática por
 * completo — só o clique manual dispara `checkForUpdates()`. Resolveu
 * o alarme falso, mas criou um problema real de distribuição: com
 * ~300 instalações existentes e uma correção crítica (troca do
 * binário do CSGOVE após o CS2 quebrar compatibilidade em 11/11),
 * ninguém seria avisado sozinho ao abrir o app.
 *
 * 3ª (esta): reintroduzida a checagem automática no startup, mas com
 * uma regra estrita: se ela falhar ou não encontrar nada, tem que
 * ficar 100% invisível — nunca mostra "checking", nunca mostra erro,
 * nunca fica presa em lugar nenhum. Só aparece algo pro usuário se uma
 * atualização de verdade for encontrada. Uma checagem MANUAL (clique
 * no botão) continua mostrando tudo.
 */
describe('checagem automática (manual=false) — silenciosa a menos que encontre uma atualização', () => {
  it('"checking-for-update" nunca chega até a UI numa checagem automática', async () => {
    const { checkForUpdates, registerUpdateEvents } = await freshModule()
    const sender = vi.fn<(status: UpdateStatus) => void>()
    registerUpdateEvents(sender)

    await checkForUpdates() // manual=false (default) — igual ao que roda sozinho ao abrir o app
    fakeAutoUpdater.emit('checking-for-update')

    expect(sender).not.toHaveBeenCalled()
  })

  it('"nenhuma atualização" numa checagem automática fica em silêncio total (nunca aparece nada)', async () => {
    const { checkForUpdates, registerUpdateEvents } = await freshModule()
    const sender = vi.fn<(status: UpdateStatus) => void>()
    registerUpdateEvents(sender)

    await checkForUpdates()
    fakeAutoUpdater.emit('checking-for-update')
    fakeAutoUpdater.emit('update-not-available')

    expect(sender).not.toHaveBeenCalled()
  })

  it('erro numa checagem automática (ex.: sem internet) fica em silêncio total — nunca trava, nunca aparece, mas fica registrado pra quem for depurar', async () => {
    const { checkForUpdates, registerUpdateEvents } = await freshModule()
    const sender = vi.fn<(status: UpdateStatus) => void>()
    registerUpdateEvents(sender)
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await checkForUpdates()
    fakeAutoUpdater.emit('checking-for-update')
    fakeAutoUpdater.emit('error', new Error('sem internet'))

    expect(sender).not.toHaveBeenCalled()
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('checagem automatica'), 'sem internet')
    consoleSpy.mockRestore()
  })

  it('uma atualização real encontrada SEMPRE aparece, mesmo vinda de uma checagem automática', async () => {
    const { checkForUpdates, registerUpdateEvents } = await freshModule()
    const sender = vi.fn<(status: UpdateStatus) => void>()
    registerUpdateEvents(sender)

    await checkForUpdates()
    fakeAutoUpdater.emit('update-available', { version: '9.9.9', releaseNotes: null, files: [{ size: 123 }] })

    expect(sender).toHaveBeenCalledWith({
      status: 'available',
      version: '9.9.9',
      releaseNotes: null,
      sizeBytes: 123
    })
  })
})

describe('checagem manual (manual=true) — sempre mostra o resultado', () => {
  it('"checking" aparece', async () => {
    const { checkForUpdates, registerUpdateEvents } = await freshModule()
    const sender = vi.fn<(status: UpdateStatus) => void>()
    registerUpdateEvents(sender)

    await checkForUpdates(true)
    fakeAutoUpdater.emit('checking-for-update')

    expect(sender).toHaveBeenCalledWith({ status: 'checking' })
  })

  it('"nenhuma atualização" aparece pro usuário', async () => {
    const { checkForUpdates, registerUpdateEvents } = await freshModule()
    const sender = vi.fn<(status: UpdateStatus) => void>()
    registerUpdateEvents(sender)

    await checkForUpdates(true)
    fakeAutoUpdater.emit('update-not-available')

    expect(sender).toHaveBeenCalledWith({ status: 'not-available' })
  })

  it('erro aparece com phase "check" (nunca "download")', async () => {
    const { checkForUpdates, registerUpdateEvents } = await freshModule()
    const sender = vi.fn<(status: UpdateStatus) => void>()
    registerUpdateEvents(sender)

    await checkForUpdates(true)
    fakeAutoUpdater.emit('error', new Error('feed indisponível'))

    expect(sender).toHaveBeenCalledWith({ status: 'error', phase: 'check', message: 'feed indisponível' })
  })
})

describe('download — sempre uma ação real do usuário, erro sempre visível', () => {
  it('falha durante o download chega até a UI com phase "download", mesmo após uma checagem automática ter encontrado algo', async () => {
    const { checkForUpdates, downloadUpdate, registerUpdateEvents } = await freshModule()
    const sender = vi.fn<(status: UpdateStatus) => void>()
    registerUpdateEvents(sender)

    await checkForUpdates() // automática encontra a atualização
    fakeAutoUpdater.emit('update-available', { version: '1.2.3', releaseNotes: null, files: [{ size: 10 }] })

    // Usuário clica em "Atualizar agora" — o download em si falha.
    await downloadUpdate()
    fakeAutoUpdater.emit('error', new Error('conexão perdida'))

    expect(sender).toHaveBeenCalledWith({ status: 'error', phase: 'download', message: 'conexão perdida' })
  })

  it('download concluído chega até a UI', async () => {
    const { downloadUpdate, registerUpdateEvents } = await freshModule()
    const sender = vi.fn<(status: UpdateStatus) => void>()
    registerUpdateEvents(sender)

    await downloadUpdate()
    fakeAutoUpdater.emit('update-downloaded', { version: '1.2.3' })

    expect(sender).toHaveBeenCalledWith({ status: 'ready', version: '1.2.3' })
  })
})
