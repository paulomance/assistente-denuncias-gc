import { spawn } from 'child_process'
import { existsSync, mkdirSync, readdirSync } from 'fs'
import { basename, dirname, extname, join } from 'path'
import { app } from 'electron'
import { parseCsgoveAudioFilename } from './csgoveFilenameParser'
import { hasStartedGeneratingAudioFiles } from './csgoveStdout'
import type {
  CsgoveProgressStage,
  CsgoveResult,
  CsgoveRunOptions,
  ExtractedVoice
} from '../../shared/types/Csgove'

export class CsgoveNotFoundError extends Error {
  constructor(executablePath: string) {
    super(`Executavel do CSGOVE nao encontrado em: ${executablePath}`)
    this.name = 'CsgoveNotFoundError'
  }
}

/**
 * Em desenvolvimento, usa o binario baixado manualmente durante a
 * validacao empirica da B2 (tools/csgove/win32-x64/csgove.exe, fora do
 * controle de versao — ver README.md). Em producao, o instalador
 * (electron-builder, Fase B8) coloca o binario e as DLLs em
 * resources/csgove/ via extraResources (ver "build" em package.json) —
 * confirmado com um build real do instalador, nao so suposto.
 */
export function resolveCsgoveExecutablePath(): string {
  const executableName = process.platform === 'win32' ? 'csgove.exe' : 'csgove'

  if (app.isPackaged) {
    return join(process.resourcesPath, 'csgove', executableName)
  }

  return join(app.getAppPath(), 'tools', 'csgove', 'win32-x64', executableName)
}

/**
 * Executa exclusivamente o CSGOVE sobre uma demo. Nao sabe nada sobre UI,
 * Google Drive ou selecao de jogadores — apenas:
 * demo + diretorio de saida -> processo externo -> arquivos de audio
 * identificados.
 */
export class CsgoveRunner {
  async run(
    options: CsgoveRunOptions,
    onStage?: (stage: CsgoveProgressStage) => void
  ): Promise<CsgoveResult> {
    const executablePath = resolveCsgoveExecutablePath()

    if (!existsSync(executablePath)) {
      throw new CsgoveNotFoundError(executablePath)
    }

    mkdirSync(options.outputDir, { recursive: true })

    onStage?.('analyzing')

    const startedAt = Date.now()
    const { exitCode, stdout, stderr } = await this.spawnCsgove(executablePath, options, onStage)
    const durationMs = Date.now() - startedAt

    // O exit code e a existencia real dos arquivos de saida sao a fonte
    // de verdade. stdout e guardado so para diagnostico, nunca
    // interpretado como prova de sucesso (confirmado na validacao
    // empirica da B2: mensagens como "End processing demo" nao bastam).
    const success = exitCode === 0
    const audioFiles = success ? this.collectAudioFiles(options) : []

    return {
      success,
      exitCode,
      outputDir: options.outputDir,
      audioFiles,
      stdout,
      stderr,
      durationMs
    }
  }

  private spawnCsgove(
    executablePath: string,
    options: CsgoveRunOptions,
    onStage?: (stage: CsgoveProgressStage) => void
  ): Promise<{ exitCode: number | null; stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const child = spawn(executablePath, ['-output', options.outputDir, options.demoPath], {
        cwd: dirname(executablePath), // DLLs do CSGOVE (opus.dll, tier0.dll, vaudio_celt.dll) ficam ao lado do executavel
        windowsHide: true
      })

      let stdout = ''
      let stderr = ''
      let extractingStageEmitted = false

      child.stdout?.on('data', (chunk: Buffer) => {
        stdout += chunk.toString('utf-8')

        if (!extractingStageEmitted && hasStartedGeneratingAudioFiles(stdout)) {
          extractingStageEmitted = true
          onStage?.('extracting')
        }
      })

      child.stderr?.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf-8')
      })

      child.on('error', reject)

      child.on('close', (exitCode) => {
        resolve({ exitCode, stdout, stderr })
      })
    })
  }

  private collectAudioFiles(options: CsgoveRunOptions): ExtractedVoice[] {
    const demoBaseName = basename(options.demoPath, extname(options.demoPath))
    const entries = readdirSync(options.outputDir)
    const audioFiles: ExtractedVoice[] = []

    for (const entry of entries) {
      const parsed = parseCsgoveAudioFilename(entry, demoBaseName)
      if (parsed.ok) {
        audioFiles.push({
          audioPath: join(options.outputDir, entry),
          steamId64: parsed.steamId64,
          rawPlayerName: parsed.rawPlayerName
        })
      }
      // Arquivos que nao seguem o padrao esperado sao ignorados aqui. O
      // diretorio de saida e exclusivo desta execucao (nao reaproveitado
      // entre chamadas), entao nao deveria conter nada alem dos .wav.
    }

    return audioFiles
  }
}
