import { ipcMain, shell } from 'electron'
import { listLocalReports } from '../services/localReportsStore'
import { deleteLocalReportCopy, syncStateAfterDriveDeletion } from '../services/reportDeletion'
import { isDriveOnlyId, listDriveOnlyReports, syntheticPathForDriveOnlyReport } from '../services/driveOnlyReportsIndex'
import { GoogleDriveProvider } from '../services/google/GoogleDriveProvider'
import { GoogleApiError } from '../services/google/GoogleApiError'
import type {
  DeleteDriveReportResult,
  DeleteLocalCopyResult,
  ReportHistoryEntry
} from '../../shared/types/History'

const driveProvider = new GoogleDriveProvider()

export function registerHistoryIpcHandlers(): void {
  /**
   * Une duas fontes: pastas locais reais (`listLocalReports`, le
   * metadata.json de cada uma) e o indice de denuncias "so no Drive"
   * (`driveOnlyReportsIndex.ts` — denuncias cuja pasta local foi
   * excluida via "Excluir do computador", mas que continuam no Google
   * Drive). Modela os 4 estados possiveis que o usuario pediu
   * explicitamente pra representar corretamente:
   *   - local + Drive  -> `hasLocalCopy: true`,  `status: 'uploaded'`
   *   - so local        -> `hasLocalCopy: true`,  `status: 'local'|'uploading'|'upload-failed'`
   *   - so Drive         -> `hasLocalCopy: false`, `status: 'uploaded'` (vem do indice)
   *   - nenhum dos dois  -> nao aparece na lista (nada a mostrar)
   */
  ipcMain.handle('history:listReports', async (): Promise<ReportHistoryEntry[]> => {
    const local = listLocalReports().map(({ folderPath, metadata, hasLocalCopy, localSizeBytes }) => ({
      reportId: metadata.reportId,
      folderPath,
      createdAt: metadata.createdAt,
      originalDemoFileName: metadata.originalDemoFileName,
      matchId: metadata.matchId,
      // `?? null`: metadata.json de denuncias criadas antes deste campo
      // existir nao tem `map` gravado (`undefined` no JSON parseado) —
      // normaliza pro tipo declarado em vez de vazar `undefined`.
      map: metadata.map ?? null,
      players: metadata.players,
      status: metadata.status,
      hasLocalCopy,
      localSizeBytes,
      driveShareLink: metadata.drive?.shareLink ?? null,
      driveFolderId: metadata.drive?.folderId ?? null
    }))

    const driveOnly = listDriveOnlyReports().map((record) => ({
      reportId: record.reportId,
      folderPath: syntheticPathForDriveOnlyReport(record.reportId),
      createdAt: record.createdAt,
      originalDemoFileName: record.originalDemoFileName,
      matchId: record.matchId,
      map: record.map,
      players: record.players,
      status: 'uploaded' as const,
      hasLocalCopy: false,
      localSizeBytes: 0,
      driveShareLink: record.driveShareLink,
      driveFolderId: record.driveFolderId
    }))

    return [...local, ...driveOnly].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  })

  ipcMain.handle('history:openFolder', async (_event, folderPath: string): Promise<void> => {
    if (isDriveOnlyId(folderPath)) return // nao ha pasta local pra abrir
    await shell.openPath(folderPath)
  })

  /**
   * Logica real de decisao vive em `services/reportDeletion.ts`, onde e
   * testavel por si so (ver `reportDeletion.test.ts`, cenarios A-F
   * pedidos explicitamente pelo usuario apos relatar que "Excluir do
   * computador" falhava depois de "Excluir do Google Drive" — bug
   * reproduzido de ponta a ponta com essas mesmas funcoes sob Electron
   * real e NAO reproduzido: a logica como esta escrita esta correta,
   * ver comentario em `reportDeletion.ts` para a hipotese mais provavel
   * do que o usuario observou).
   */
  ipcMain.handle(
    'history:deleteLocalCopy',
    async (_event, folderPath: string): Promise<DeleteLocalCopyResult> => deleteLocalReportCopy(folderPath)
  )

  ipcMain.handle(
    'history:deleteFromDrive',
    async (_event, folderPath: string, driveFolderId: string): Promise<DeleteDriveReportResult> => {
      try {
        await driveProvider.deleteUploadedReport(driveFolderId)
        syncStateAfterDriveDeletion(folderPath)
        return { status: 'success' }
      } catch (error) {
        const kind = error instanceof GoogleApiError ? error.kind : 'unexpected'
        // 'not-found' significa que a pasta ja nao existia mais no Drive
        // (ex.: usuario excluiu manualmente por la) — tratamos como
        // sucesso do ponto de vista do app: o objetivo (nao ter mais
        // aquela denuncia no Drive) ja esta cumprido, so sincronizamos o
        // estado local.
        if (kind === 'not-found') {
          syncStateAfterDriveDeletion(folderPath)
          return { status: 'success' }
        }
        return { status: 'error', errorKind: kind }
      }
    }
  )
}
