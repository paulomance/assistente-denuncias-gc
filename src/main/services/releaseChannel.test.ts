import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

let appDir: string
let isPackaged = false
const version = '1.2.3'

vi.mock('electron', () => ({
  app: {
    get isPackaged() {
      return isPackaged
    },
    getAppPath: () => appDir,
    getVersion: () => version
  }
}))

async function freshModule(): Promise<typeof import('./releaseChannel')> {
  vi.resetModules()
  return import('./releaseChannel')
}

beforeEach(() => {
  appDir = mkdtempSync(join(tmpdir(), 'gc-release-channel-test-'))
  isPackaged = false
})

afterEach(() => {
  rmSync(appDir, { recursive: true, force: true })
})

describe('getReleaseChannel', () => {
  it('é sempre "development" quando o app não está empacotado, mesmo que o package.json diga outra coisa', async () => {
    writeFileSync(join(appDir, 'package.json'), JSON.stringify({ gcReleaseChannel: 'test' }))
    isPackaged = false
    const { getReleaseChannel } = await freshModule()
    expect(getReleaseChannel()).toBe('development')
  })

  it('é "production" quando empacotado sem nenhuma marcação explícita', async () => {
    writeFileSync(join(appDir, 'package.json'), JSON.stringify({}))
    isPackaged = true
    const { getReleaseChannel } = await freshModule()
    expect(getReleaseChannel()).toBe('production')
  })

  it('é "test" quando empacotado com gcReleaseChannel=test', async () => {
    writeFileSync(join(appDir, 'package.json'), JSON.stringify({ gcReleaseChannel: 'test' }))
    isPackaged = true
    const { getReleaseChannel } = await freshModule()
    expect(getReleaseChannel()).toBe('test')
  })

  it('ignora um valor desconhecido no campo (nunca trata como "test" por engano)', async () => {
    writeFileSync(join(appDir, 'package.json'), JSON.stringify({ gcReleaseChannel: 'beta' }))
    isPackaged = true
    const { getReleaseChannel } = await freshModule()
    expect(getReleaseChannel()).toBe('production')
  })

  it('cai para "production" se o package.json não existir/não puder ser lido — nunca trava', async () => {
    rmSync(join(appDir, 'package.json'), { force: true })
    isPackaged = true
    const { getReleaseChannel } = await freshModule()
    expect(getReleaseChannel()).toBe('production')
  })
})

describe('getAppInfo', () => {
  it('combina a versão real (app.getVersion) com o canal calculado', async () => {
    writeFileSync(join(appDir, 'package.json'), JSON.stringify({}))
    isPackaged = true
    const { getAppInfo } = await freshModule()
    expect(getAppInfo()).toEqual({ version: '1.2.3', channel: 'production' })
  })
})
