import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

/**
 * Mesma tecnica ja usada em `reportDeletion.test.ts` — so `app.getPath`
 * e mockado (vitest roda em Node puro, sem Electron real), tudo o resto
 * (leitura real de arquivo, checagem de caminho) roda contra um
 * diretorio TEMPORARIO real.
 */
let tempDir: string

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => {
      if (name === 'temp') return tempDir
      throw new Error(`app.getPath('${name}') não mockado neste teste`)
    }
  }
}))

async function freshModule(): Promise<typeof import('./audioPlayback')> {
  vi.resetModules()
  return import('./audioPlayback')
}

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'gc-audio-test-'))
})

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true })
})

describe('readExtractedAudioFile — leitura de audio restrita à área temporária do CSGOVE', () => {
  it('lê um .wav real dentro da raiz temporária esperada', async () => {
    const { readExtractedAudioFile } = await freshModule()
    // getTempOutputRoot() = join(tempDir, 'assistente-denuncias-gc')
    const outputDir = join(tempDir, 'assistente-denuncias-gc', 'fake-demo-123')
    mkdirSync(outputDir, { recursive: true })
    const audioPath = join(outputDir, 'player_76561198000000001.wav')
    writeFileSync(audioPath, Buffer.from('fake-wav-bytes'))

    const buffer = readExtractedAudioFile(audioPath)

    expect(buffer.toString()).toBe('fake-wav-bytes')
  })

  it('rejeita um caminho fora da raiz temporária (segurança)', async () => {
    const { readExtractedAudioFile, AudioPathRejectedError } = await freshModule()
    const outsideDir = mkdtempSync(join(tmpdir(), 'gc-audio-outside-'))
    const outsidePath = join(outsideDir, 'not-audio.wav')
    writeFileSync(outsidePath, Buffer.from('should-not-be-readable'))

    expect(() => readExtractedAudioFile(outsidePath)).toThrow(AudioPathRejectedError)

    rmSync(outsideDir, { recursive: true, force: true })
  })

  it('rejeita um caminho que tenta escapar via "../" (path traversal)', async () => {
    const { readExtractedAudioFile } = await freshModule()
    const outputDir = join(tempDir, 'assistente-denuncias-gc', 'fake-demo-456')
    mkdirSync(outputDir, { recursive: true })
    // Fora do userData real (mas dentro do OS temp), simulando um
    // arquivo sensível que um caminho malicioso poderia tentar alcançar.
    const secretFile = join(tempDir, 'secret.txt')
    writeFileSync(secretFile, 'segredo')

    const traversalPath = join(outputDir, '..', '..', 'secret.txt')

    expect(() => readExtractedAudioFile(traversalPath)).toThrow()
  })

  it('propaga um erro real quando o arquivo não existe mais (ex.: limpeza de temporário)', async () => {
    const { readExtractedAudioFile } = await freshModule()
    const outputDir = join(tempDir, 'assistente-denuncias-gc', 'fake-demo-789')
    mkdirSync(outputDir, { recursive: true })
    const missingPath = join(outputDir, 'ja-foi-limpo.wav')

    expect(() => readExtractedAudioFile(missingPath)).toThrow()
  })
})
