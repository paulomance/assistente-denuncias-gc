import { ipcMain } from 'electron'
import { GoogleDriveProvider } from '../services/google/GoogleDriveProvider'
import { GoogleApiError } from '../services/google/GoogleApiError'
import { readReportMetadata, updateDriveCheckpoint, updateReportStatus } from '../services/reportMetadataStore'
import { verifyDriveLink } from '../services/driveLinkVerification'
import { classifyUploadError } from '../services/classifyUploadError'
import type { CloudAuthStatus } from '../../shared/types/CloudStorage'
import type { DriveSignInResult, UploadProgress, UploadReportResult, VerifyDriveLinkResult } from '../../shared/types/Drive'

const driveProvider = new GoogleDriveProvider()

// Mesmo padrao de trava do csgoveHandlers.ts/evidenceHandlers.ts — so um
// envio por vez faz sentido nesta instancia do app.
let isUploading = false

export function registerDriveIpcHandlers(): void {
  ipcMain.handle('drive:getAuthStatus', async (): Promise<CloudAuthStatus> => {
    return driveProvider.getAuthStatus()
  })

  ipcMain.handle('drive:signIn', async (): Promise<DriveSignInResult> => {
    try {
      await driveProvider.signIn()
      return { status: 'success' }
    } catch (error) {
      const kind = error instanceof GoogleApiError ? error.kind : 'unexpected'
      return { status: 'error', errorKind: kind }
    }
  })

  ipcMain.handle('drive:signOut', async (): Promise<void> => {
    await driveProvider.signOut()
  })

  ipcMain.handle(
    'drive:verifyLink',
    async (_event, folderPathOrSyntheticId: string): Promise<VerifyDriveLinkResult> => {
      return verifyDriveLink(folderPathOrSyntheticId)
    }
  )

  ipcMain.handle(
    'drive:uploadReport',
    async (event, reportDir: string, reportId: string): Promise<UploadReportResult> => {
      if (isUploading) {
        return { status: 'error', errorKind: 'already-uploading' }
      }
      isUploading = true

      try {
        // Se uma tentativa anterior deixou um checkpoint (upload
        // parcial/interrompido), reaproveita a mesma pasta do Drive e
        // pula os arquivos ja confirmados — nunca cria pasta duplicada
        // nem reenvia o que ja foi enviado (ver ReportDriveCheckpoint).
        const existingMetadata = readReportMetadata(reportDir)
        const checkpoint = existingMetadata.driveCheckpoint
        const resumeFrom = checkpoint
          ? {
              folderId: checkpoint.folderId,
              fileIdsBySteamId64: checkpoint.fileIdsBySteamId64,
              // `?? {}`: checkpoint gravado ANTES desta rodada (so audio) nunca tem este campo.
              chatFileIdsBySteamId64: checkpoint.chatFileIdsBySteamId64 ?? {}
            }
          : undefined

        // Seguro chamar sem o 2o argumento mesmo ao retomar: `drive`
        // fica `undefined`, entao updateReportStatus so troca o status
        // e preserva o driveCheckpoint ja gravado (ver reportMetadataStore.ts).
        updateReportStatus(reportDir, 'uploading')

        const result = await driveProvider.uploadReport(
          reportDir,
          reportId,
          (progress: UploadProgress) => {
            event.sender.send('drive:upload-progress', progress)
          },
          resumeFrom,
          (progressCheckpoint) => {
            // Grava incrementalmente — sobrevive ate a um fechamento
            // inesperado do app no meio do envio, nao so a falhas de
            // arquivo individuais.
            updateDriveCheckpoint(reportDir, {
              folderId: progressCheckpoint.folderId,
              fileIdsBySteamId64: progressCheckpoint.fileIdsBySteamId64,
              chatFileIdsBySteamId64: progressCheckpoint.chatFileIdsBySteamId64,
              steamIdsFailedLastAttempt: [],
              chatSteamIdsFailedLastAttempt: []
            })
          }
        )

        if (result.status === 'partial') {
          // Pelo menos um arquivo (audio OU chat) nao foi confirmado —
          // a pasta e os arquivos que deram certo continuam no Drive
          // (nunca descartados). Guarda o checkpoint pra uma proxima
          // tentativa so reenviar quem falhou, e mapeia os steamId64
          // pro nome de exibicao pra UI mostrar quem especificamente
          // falhou (com `kind`, pra diferenciar "áudio" de "chat").
          updateDriveCheckpoint(reportDir, {
            folderId: result.folderId,
            fileIdsBySteamId64: result.fileIdsBySteamId64,
            chatFileIdsBySteamId64: result.chatFileIdsBySteamId64,
            steamIdsFailedLastAttempt: result.failedSteamIds,
            chatSteamIdsFailedLastAttempt: result.failedChatSteamIds
          })
          updateReportStatus(reportDir, 'upload-failed')

          const failedPlayers = [
            ...result.failedSteamIds.map((steamId64) => ({ steamId64, kind: 'audio' as const })),
            ...result.failedChatSteamIds.map((steamId64) => ({ steamId64, kind: 'chat' as const }))
          ].map(({ steamId64, kind }) => {
            const player = existingMetadata.players.find((p) => p.steamId64 === steamId64)
            return { steamId64, displayName: player?.displayName ?? steamId64, kind }
          })

          const completed =
            Object.keys(result.fileIdsBySteamId64).length + Object.keys(result.chatFileIdsBySteamId64).length
          const total = completed + result.failedSteamIds.length + result.failedChatSteamIds.length

          return {
            status: 'partial',
            completed,
            total,
            failedPlayers,
            errorKind: result.errorKind
          }
        }

        // So marcamos 'uploaded' depois do metodo acima ter retornado
        // com sucesso (o que so acontece com IDs reais de retorno do
        // Google em cada arquivo + link de compartilhamento confirmado
        // — ver GoogleDriveProvider.ts). Isso tambem limpa o
        // driveCheckpoint (ver updateReportStatus).
        updateReportStatus(reportDir, 'uploaded', {
          folderId: result.folderId,
          fileIdsBySteamId64: result.fileIdsBySteamId64,
          chatFileIdsBySteamId64: result.chatFileIdsBySteamId64,
          shareLink: result.shareLink,
          uploadedAt: new Date().toISOString()
        })

        return { status: 'success', shareLink: result.shareLink }
      } catch (error) {
        // Falha no envio NUNCA apaga ou invalida a copia local — so
        // registramos o status pra a UI oferecer "tentar de novo". Os
        // arquivos em reportDir/audio continuam intactos, e um
        // checkpoint eventualmente ja gravado (via onCheckpoint) permite
        // que a proxima tentativa retome de onde parou mesmo apos um
        // erro que abortou a funcao inteira (ex.: falha de rede antes de
        // sequer comecar a enviar arquivos).
        try {
          updateReportStatus(reportDir, 'upload-failed')
        } catch {
          // Se nem isso der certo (ex.: metadata.json sumiu), a copia
          // local em si continua existindo — so o status nao reflete o
          // ocorrido.
        }

        return { status: 'error', errorKind: classifyUploadError(error) }
      } finally {
        isUploading = false
      }
    }
  )
}
