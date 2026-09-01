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
 * Achado real de uma auditoria anterior: `registerUpdateEvents` tinha
 * um caso especial que engolia 'update-not-available'/'error' quando a
 * checagem era "automatica" — o problema é que, como não existe mais
 * NENHUMA checagem automática em lugar nenhum do app (a única forma de
 * chamar `checkForUpdates()` é o clique manual, ver
 * UpdateNotification.tsx e SettingsOverlay.tsx), esse caso especial
 * fazia o status ficar preso em `{status: 'checking'}` pra sempre toda
 * vez que não havia nada de novo — a UI nunca recebia o evento
 * seguinte que resolveria o "Verificando atualizações...". A correção
 * (ver updateChecker.ts) elimina esse caso: TODO evento agora chega
 * até o `sender`, sem exceção — os testes abaixo garantem que
 * `'checking-for-update'` sempre tem um evento terminal correspondente
 * repassado depois.
 */
describe('toda checagem sempre termina num evento visível (nunca fica presa em "checking")', () => {
  it('nenhuma atualização encontrada: chega até a UI (nunca fica em silêncio)', async () => {
    const { checkForUpdates, registerUpdateEvents } = await freshModule()
    const sender = vi.fn<(status: UpdateStatus) => void>()
    registerUpdateEvents(sender)

    await checkForUpdates()
    fakeAutoUpdater.emit('checking-for-update')
    fakeAutoUpdater.emit('update-not-available')

    expect(sender).toHaveBeenNthCalledWith(1, { status: 'checking' })
    expect(sender).toHaveBeenNthCalledWith(2, { status: 'not-available' })
    expect(sender).toHaveBeenCalledTimes(2)
  })

  it('erro durante a checagem chega até a UI com phase "check" (nunca fica em silêncio)', async () => {
    const { checkForUpdates, registerUpdateEvents } = await freshModule()
    const sender = vi.fn<(status: UpdateStatus) => void>()
    registerUpdateEvents(sender)

    await checkForUpdates()
    fakeAutoUpdater.emit('checking-for-update')
    fakeAutoUpdater.emit('error', new Error('sem internet'))

    expect(sender).toHaveBeenNthCalledWith(1, { status: 'checking' })
    expect(sender).toHaveBeenNthCalledWith(2, { status: 'error', phase: 'check', message: 'sem internet' })
  })

  it('uma atualização real encontrada chega até a UI', async () => {
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

describe('download — erro sempre chega com phase "download", nunca confundido com erro de checagem', () => {
  it('falha durante o download chega até a UI com phase "download", mesmo após uma checagem que encontrou algo', async () => {
    const { checkForUpdates, downloadUpdate, registerUpdateEvents } = await freshModule()
    const sender = vi.fn<(status: UpdateStatus) => void>()
    registerUpdateEvents(sender)

    await checkForUpdates()
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
