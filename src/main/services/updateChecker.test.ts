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
    await checkForUpdates(true)
    await downloadUpdate()
    expect(fakeAutoUpdater.checkForUpdates).not.toHaveBeenCalled()
    expect(fakeAutoUpdater.downloadUpdate).not.toHaveBeenCalled()
  })
})

describe('checagem automática (ao abrir o app) — nunca gera alarme sozinha', () => {
  it('falha na checagem automática nunca chega até a UI', async () => {
    const { checkForUpdates, registerUpdateEvents } = await freshModule()
    const sender = vi.fn<(status: UpdateStatus) => void>()
    registerUpdateEvents(sender)
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await checkForUpdates() // manual=false (default) — igual ao que UpdateNotification chama ao montar
    fakeAutoUpdater.emit('error', new Error('sem internet'))

    const errorCalls = sender.mock.calls.filter(([status]) => status.status === 'error')
    expect(errorCalls).toHaveLength(0)
    // Nunca some sem deixar rastro: fica no log do processo principal
    // pra quem estiver depurando, só não vira alarme pro usuário.
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('checagem automatica'), 'sem internet')
    consoleSpy.mockRestore()
  })

  it('"nenhuma atualização" na checagem automática nunca chega até a UI', async () => {
    const { checkForUpdates, registerUpdateEvents } = await freshModule()
    const sender = vi.fn<(status: UpdateStatus) => void>()
    registerUpdateEvents(sender)

    await checkForUpdates()
    fakeAutoUpdater.emit('update-not-available')

    expect(sender.mock.calls.filter(([status]) => status.status === 'not-available')).toHaveLength(0)
  })

  it('uma atualização real encontrada sempre chega até a UI, mesmo vinda da checagem automática', async () => {
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

describe('checagem manual (botão "Verificar atualizações") — sempre informa o resultado', () => {
  it('falha na checagem manual chega até a UI com phase "check" (nunca "baixar")', async () => {
    const { checkForUpdates, registerUpdateEvents } = await freshModule()
    const sender = vi.fn<(status: UpdateStatus) => void>()
    registerUpdateEvents(sender)

    await checkForUpdates(true)
    fakeAutoUpdater.emit('error', new Error('feed indisponível'))

    expect(sender).toHaveBeenCalledWith({ status: 'error', phase: 'check', message: 'feed indisponível' })
  })

  it('"nenhuma atualização" na checagem manual informa o usuário', async () => {
    const { checkForUpdates, registerUpdateEvents } = await freshModule()
    const sender = vi.fn<(status: UpdateStatus) => void>()
    registerUpdateEvents(sender)

    await checkForUpdates(true)
    fakeAutoUpdater.emit('update-not-available')

    expect(sender).toHaveBeenCalledWith({ status: 'not-available' })
  })
})

describe('download — sempre uma ação real do usuário, erro sempre visível', () => {
  it('falha durante o download chega até a UI com phase "download", mesmo após uma checagem automática', async () => {
    const { checkForUpdates, downloadUpdate, registerUpdateEvents } = await freshModule()
    const sender = vi.fn<(status: UpdateStatus) => void>()
    registerUpdateEvents(sender)

    // Checagem automática encontra uma versão nova primeiro (fluxo real).
    await checkForUpdates()
    fakeAutoUpdater.emit('update-available', { version: '1.2.3', releaseNotes: null, files: [{ size: 10 }] })

    // Usuário clica em "Atualizar agora" — o download em si falha.
    await downloadUpdate()
    fakeAutoUpdater.emit('error', new Error('conexão perdida'))

    expect(sender).toHaveBeenCalledWith({ status: 'error', phase: 'download', message: 'conexão perdida' })
  })

  it('download concluído sempre chega até a UI', async () => {
    const { downloadUpdate, registerUpdateEvents } = await freshModule()
    const sender = vi.fn<(status: UpdateStatus) => void>()
    registerUpdateEvents(sender)

    await downloadUpdate()
    fakeAutoUpdater.emit('update-downloaded', { version: '1.2.3' })

    expect(sender).toHaveBeenCalledWith({ status: 'ready', version: '1.2.3' })
  })
})
