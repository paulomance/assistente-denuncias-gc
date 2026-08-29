import { ipcMain, shell } from 'electron'
import { EvidenceOrganizer } from '../services/EvidenceOrganizer'
import { cleanupRunOutput } from '../services/tempOutputCleanup'
import type { ExtractedVoice } from '../../shared/types/Csgove'
import type { OrganizeEvidenceResult } from '../../shared/types/Evidence'

const evidenceOrganizer = new EvidenceOrganizer()

// Mesma logica de trava do csgoveHandlers.ts — evita duas organizacoes
// simultaneas (o que poderia gerar duas pastas de denuncia pra uma unica
// intencao do usuario se ele clicar duas vezes rapido).
let isOrganizing = false

export function registerEvidenceIpcHandlers(): void {
  ipcMain.handle(
    'evidence:organize',
    async (
      _event,
      demoPath: string,
      csgoveOutputDir: string,
      selectedPlayers: ExtractedVoice[]
    ): Promise<OrganizeEvidenceResult> => {
      if (isOrganizing) {
        return { status: 'error' }
      }
      isOrganizing = true

      try {
        const result = evidenceOrganizer.organize(demoPath, selectedPlayers)
        // So limpa o temporario do CSGOVE depois que a copia para o
        // destino persistente foi confirmada — nunca antes, para nunca
        // arriscar apagar a unica copia existente do audio.
        cleanupRunOutput(csgoveOutputDir)
        return { status: 'success', ...result }
      } catch {
        return { status: 'error' }
      } finally {
        isOrganizing = false
      }
    }
  )

  ipcMain.handle('evidence:openFolder', async (_event, folderPath: string): Promise<void> => {
    await shell.openPath(folderPath)
  })
}
