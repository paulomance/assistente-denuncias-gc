import { ipcMain } from 'electron'
import { basename, extname, join } from 'path'
import { DemoManager } from '../services/DemoManager'
import { CsgoveNotFoundError, CsgoveRunner } from '../services/CsgoveRunner'
import { getTempOutputRoot } from '../services/tempOutputCleanup'
import { getMatchTeams } from '../services/matchTeams'
import { getMatchChat } from '../services/matchChat'
import { buildPlayerList } from '../services/buildPlayerList'
import type { ProcessDemoResult } from '../../shared/types/Csgove'

const demoManager = new DemoManager()
const csgoveRunner = new CsgoveRunner()

// Trava global e simples: so faz sentido processar uma demo por vez
// nesta instancia do app (CSGOVE ja usa bastante CPU/disco sozinho — ver
// docs/plano-frente-b.md). Protege contra cliques duplos, mais de uma
// janela, ou qualquer outra forma de disparar duas chamadas quase ao
// mesmo tempo, o que causaria dois processos csgove.exe concorrentes e
// eventos de estagio (demo:process-stage) misturados na UI.
let isProcessing = false

export function registerCsgoveIpcHandlers(): void {
  ipcMain.handle('demo:process', async (event, localPath: string): Promise<ProcessDemoResult> => {
    if (isProcessing) {
      return { status: 'already-processing' }
    }
    isProcessing = true

    try {
      return await processDemo(event, localPath)
    } finally {
      isProcessing = false
    }
  })
}

async function processDemo(
  event: Electron.IpcMainInvokeEvent,
  localPath: string
): Promise<ProcessDemoResult> {
  const validation = demoManager.validate(localPath, 'manual')

  if (!validation.valid) {
    // Nao deveria acontecer no fluxo normal (o renderer so chega aqui
    // depois de uma validacao bem-sucedida na B1), mas o arquivo pode ter
    // sido movido/apagado entre a selecao e o clique em "Continuar".
    // Tratamos como falha, nao como crash.
    return { status: 'unexpected-error' }
  }

  const demoBaseName = basename(validation.demoInput.localPath, extname(validation.demoInput.localPath))
  // Diretorio de trabalho fora da pasta do projeto e exclusivo desta
  // execucao (timestamp no nome) — nunca reaproveitado entre chamadas.
  // Limpo pelo EvidenceOrganizer apos a copia dos arquivos selecionados
  // (ver evidenceHandlers.ts) ou, se abandonado, no proximo start do app
  // (ver cleanupStaleTempOutput em main/index.ts).
  const outputDir = join(getTempOutputRoot(), `${demoBaseName}-${Date.now()}`)

  try {
    // `getMatchTeams()` roda ANTES do CSGOVE de proposito (reordenado
    // nesta rodada) — le a propria demo via @laihoe/demoparser2,
    // totalmente independente do CSGOVE, e pode levar alguns segundos
    // numa demo real (ver matchTeams.test.ts). Antes essa chamada
    // acontecia DEPOIS do CSGOVE terminar, sem nenhum estagio visivel
    // pra ela — o usuario via "Extraindo os áudios..." parado enquanto
    // uma operacao diferente rodava silenciosamente. Agora e um estagio
    // real e visivel proprio (`identifying-players`).
    event.sender.send('demo:process-stage', 'identifying-players')
    const teams = getMatchTeams(validation.demoInput.localPath)
    // Mesmo estagio/chamada de leitura da propria demo que getMatchTeams
    // (independente do CSGOVE, nunca pode fazer a extracao de audio
    // falhar) — le o chat de texto. Nunca lanca (ver matchChat.ts).
    const chat = getMatchChat(validation.demoInput.localPath)

    const result = await csgoveRunner.run(
      { demoPath: validation.demoInput.localPath, outputDir },
      (stage) => event.sender.send('demo:process-stage', stage)
    )

    if (!result.success) {
      return { status: 'csgove-failed', exitCode: result.exitCode }
    }

    return {
      status: 'success',
      audioFiles: buildPlayerList(result.audioFiles, teams, chat),
      outputDir: result.outputDir,
      durationMs: result.durationMs
    }
  } catch (error) {
    if (error instanceof CsgoveNotFoundError) {
      return { status: 'csgove-not-found' }
    }
    return { status: 'unexpected-error' }
  }
}

