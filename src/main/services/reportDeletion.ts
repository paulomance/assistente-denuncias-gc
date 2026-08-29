import { readReportMetadata, updateReportStatus } from './reportMetadataStore'
import { deleteLocalReportFolder } from './localReportsStore'
import {
  appendDriveOnlyReport,
  driveOnlyReportIdFromSyntheticPath,
  isDriveOnlyId,
  removeDriveOnlyReport
} from './driveOnlyReportsIndex'
import type { DeleteLocalCopyResult } from '../../shared/types/History'

/**
 * Logica de "Excluir do computador" e "Excluir do Google Drive"
 * extraida de `historyHandlers.ts` pra um modulo testavel por si so
 * (antes vivia inline dentro dos callbacks de `ipcMain.handle`, o que
 * tornava impossivel escrever um teste automatizado de verdade sem
 * bootstrapar o `ipcMain` inteiro). Bug relatado pelo usuario: "Excluir
 * do computador" retornando "Não foi possível excluir a cópia local."
 * depois de "Excluir do Google Drive" ter sido usado primeiro.
 *
 * Investigacao real (nao suposicao): reproduzido um teste real, sob
 * Electron de verdade, contra um filesystem temporario, chamando essas
 * MESMAS funcoes na mesma ordem que o cenario relatado — os 6 cenarios
 * pedidos (A-F) passaram, inclusive o cenario exato do bug relatado
 * (Local+Drive -> excluir Drive -> excluir local -> sucesso). A logica
 * como esta escrita hoje esta correta. A hipotese mais provavel pro que
 * o usuario viu: o processo PRINCIPAL do Electron (`npm run dev`)
 * rodando codigo anterior a uma correcao de 2 rodadas atras (o guard
 * antigo exigia `status === 'uploaded'`) — o processo main do Electron
 * PRECISA reiniciar pra pegar mudancas em `src/main/**`, diferente do
 * renderer (que atualiza sozinho via HMR do Vite). Evidencia indireta
 * que sustenta essa hipotese: o texto de erro generico que o usuario
 * viu bate exatamente com o que aconteceria se o BACKEND estivesse
 * rodando a razao antiga (`'not-uploaded-yet'`) mas o FRONTEND (sempre
 * atualizado via HMR) so reconhecesse a razao nova
 * (`'upload-in-progress'`) — a incompatibilidade cairia no branch de
 * mensagem generica, exatamente o texto relatado.
 *
 * `console.error` adicionado nos catches — antes o erro real era
 * silenciosamente descartado, dificultando diagnosticar qualquer
 * problema real (diferente de um processo desatualizado) no futuro.
 */
export function deleteLocalReportCopy(folderPath: string): DeleteLocalCopyResult {
  try {
    const metadata = readReportMetadata(folderPath)
    if (metadata.status === 'uploading') {
      return { status: 'error', reason: 'upload-in-progress' }
    }
    if (metadata.drive) {
      appendDriveOnlyReport({
        reportId: metadata.reportId,
        createdAt: metadata.createdAt,
        originalDemoFileName: metadata.originalDemoFileName,
        matchId: metadata.matchId,
        map: metadata.map ?? null,
        players: metadata.players,
        driveFolderId: metadata.drive.folderId,
        driveShareLink: metadata.drive.shareLink,
        localDeletedAt: new Date().toISOString()
      })
    }
    deleteLocalReportFolder(folderPath)
    return { status: 'success' }
  } catch (error) {
    console.error('[reportDeletion] deleteLocalReportCopy falhou:', folderPath, error)
    return { status: 'error', reason: 'unexpected' }
  }
}

/**
 * Roda depois que o Drive confirma a exclusao (ou confirma que a
 * pasta ja nao existia mais lá — `not-found`, ver `historyHandlers.ts`).
 * Trata os dois formatos possiveis de `folderPath`: um caminho real
 * (denuncia que ainda tem copia local) ou o identificador sintetico
 * `drive-only:<reportId>` (denuncia cuja copia local ja tinha sido
 * excluida antes — so existe no indice `driveOnlyReportsIndex.ts`).
 */
export function syncStateAfterDriveDeletion(folderPath: string): void {
  if (isDriveOnlyId(folderPath)) {
    removeDriveOnlyReport(driveOnlyReportIdFromSyntheticPath(folderPath))
  } else {
    updateReportStatus(folderPath, 'local', null)
  }
}
