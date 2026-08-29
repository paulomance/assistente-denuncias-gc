import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

/**
 * Mesma tecnica ja usada em reportDeletion.test.ts/audioPlayback.test.ts
 * — so `app.getPath` e mockado, tudo o resto (leitura/escrita real do
 * settings.json) roda contra um diretorio temporario REAL.
 */
let userDataDir: string
let documentsDir: string

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => {
      if (name === 'userData') return userDataDir
      if (name === 'documents') return documentsDir
      throw new Error(`app.getPath('${name}') não mockado neste teste`)
    }
  }
}))

async function freshModule(): Promise<typeof import('./AppSettings')> {
  vi.resetModules()
  return import('./AppSettings')
}

beforeEach(() => {
  userDataDir = mkdtempSync(join(tmpdir(), 'gc-appsettings-userdata-'))
  documentsDir = mkdtempSync(join(tmpdir(), 'gc-appsettings-documents-'))
})

afterEach(() => {
  rmSync(userDataDir, { recursive: true, force: true })
  rmSync(documentsDir, { recursive: true, force: true })
})

describe('getUiScale', () => {
  it('é `medium` por padrão quando nenhuma preferência foi salva ainda (instalação nova)', async () => {
    const { getUiScale } = await freshModule()
    expect(getUiScale()).toBe('medium')
  })

  it('uma preferência já salva (ex.: `auto`, de uma versão anterior) nunca é sobrescrita pelo novo padrão', async () => {
    const { getUiScale, setUiScale } = await freshModule()
    setUiScale('auto')
    // Reabre o módulo (simula reiniciar o app) — o valor persistido em
    // disco continua sendo lido, o DEFAULT só vale quando NADA foi
    // salvo ainda.
    const reloaded = await freshModule()
    expect(reloaded.getUiScale()).toBe('auto')
  })
})

describe('getHardwareAcceleration / setHardwareAcceleration', () => {
  it('é `false` por padrão quando nenhuma preferência foi salva ainda', async () => {
    const { getHardwareAcceleration } = await freshModule()
    expect(getHardwareAcceleration()).toBe(false)
  })

  it('persiste `true` de verdade em disco e lê de volta', async () => {
    const { getHardwareAcceleration, setHardwareAcceleration } = await freshModule()
    setHardwareAcceleration(true)
    expect(getHardwareAcceleration()).toBe(true)

    const raw = JSON.parse(readFileSync(join(userDataDir, 'settings.json'), 'utf-8'))
    expect(raw.hardwareAcceleration).toBe(true)
  })

  it('voltar para `false` também persiste de verdade (não é só o default implícito)', async () => {
    const { getHardwareAcceleration, setHardwareAcceleration } = await freshModule()
    setHardwareAcceleration(true)
    setHardwareAcceleration(false)
    expect(getHardwareAcceleration()).toBe(false)

    const raw = JSON.parse(readFileSync(join(userDataDir, 'settings.json'), 'utf-8'))
    expect(raw.hardwareAcceleration).toBe(false)
  })

  it('não apaga outras preferências já salvas (evidenceRootDir, uiScale, windowMode, fontSize)', async () => {
    const {
      setEvidenceRootDir,
      setUiScale,
      setWindowMode,
      setFontSize,
      setHardwareAcceleration,
      getEvidenceRootDir,
      getUiScale,
      getWindowMode,
      getFontSize
    } = await freshModule()

    setEvidenceRootDir(documentsDir)
    setUiScale('large')
    setWindowMode('fullscreen')
    setFontSize('large')
    setHardwareAcceleration(true)

    expect(getEvidenceRootDir()).toBe(documentsDir)
    expect(getUiScale()).toBe('large')
    expect(getWindowMode()).toBe('fullscreen')
    expect(getFontSize()).toBe('large')
  })

  it('mudar outra preferência depois não apaga a aceleração por hardware já salva', async () => {
    const { setHardwareAcceleration, setUiScale, getHardwareAcceleration } = await freshModule()
    setHardwareAcceleration(true)
    setUiScale('small')
    expect(getHardwareAcceleration()).toBe(true)
  })

  it('um settings.json com campos desconhecidos de uma versão futura continua sendo lido sem erro', async () => {
    writeFileSync(
      join(userDataDir, 'settings.json'),
      JSON.stringify({ hardwareAcceleration: true, campoDeVersaoFutura: 'valor' }),
      'utf-8'
    )
    const { getHardwareAcceleration } = await freshModule()
    expect(getHardwareAcceleration()).toBe(true)
  })
})

describe('getFontSize / setFontSize', () => {
  it('é `medium` por padrão quando nenhuma preferência foi salva ainda', async () => {
    const { getFontSize } = await freshModule()
    expect(getFontSize()).toBe('medium')
  })

  it('persiste `small` e `large` de verdade em disco e lê de volta', async () => {
    const { getFontSize, setFontSize } = await freshModule()
    setFontSize('small')
    expect(getFontSize()).toBe('small')

    setFontSize('large')
    expect(getFontSize()).toBe('large')

    const raw = JSON.parse(readFileSync(join(userDataDir, 'settings.json'), 'utf-8'))
    expect(raw.fontSize).toBe('large')
  })
})
