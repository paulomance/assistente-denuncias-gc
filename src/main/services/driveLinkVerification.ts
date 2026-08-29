import { readReportMetadata } from './reportMetadataStore'
import { syncStateAfterDriveDeletion } from './reportDeletion'
import { driveOnlyReportIdFromSyntheticPath, isDriveOnlyId, listDriveOnlyReports } from './driveOnlyReportsIndex'
import { GoogleDriveProvider } from './google/GoogleDriveProvider'
import { GoogleApiError } from './google/GoogleApiError'
import type { VerifyDriveLinkResult } from '../../shared/types/Drive'

const driveProvider = new GoogleDriveProvider()

/**
 * Confirma se o link de uma prova ainda e valido ANTES de deixar o
 * usuario copia-lo/abri-lo — chamado a partir de DriveUploadPanel.tsx
 * (link acabado de gerar) e HistoryItem.tsx ("Abrir no Drive"). Bug
 * real que motivou isto: o botao "Copiar link da prova" continuava
 * funcionando com o link antigo depois da pasta ser excluida do Drive
 * (pelo proprio app, numa aba/overlay diferente, ou diretamente em
 * drive.google.com) — o componente que mostrava o link nunca tinha
 * como saber que ele tinha morrido.
 *
 * Duas camadas, nesta ordem:
 * 1. Local (sempre rapida, sem rede): se o metadata.json (ou o indice
 *    "so Drive") ja NAO tem mais uma referencia ao Drive, a exclusao
 *    ja foi processada por este app antes — nao precisa perguntar pro
 *    Google de novo, ja sabemos que sumiu.
 * 2. Remota (drive.files.get): se a referencia local AINDA existe,
 *    confirma contra o Drive de verdade — cobre o caso de exclusao
 *    feita FORA do app (direto no site do Google Drive), que o
 *    metadata local nao tem como saber sozinho. Uma confirmacao real
 *    de "nao existe mais" AUTOCURA o metadata local nesse momento
 *    (reaproveita `syncStateAfterDriveDeletion`, a mesma funcao usada
 *    quando o usuario exclui pelo proprio app) — nunca deixa um link
 *    fantasma persistido depois de confirmado que sumiu.
 *
 * Falhas ambiguas (sessao expirada, rede indisponivel) retornam
 * `'check-failed'` e NUNCA autocuram nem afirmam que o link morreu —
 * regra explicita do usuario de nunca acusar sem confirmacao real.
 */
export async function verifyDriveLink(folderPathOrSyntheticId: string): Promise<VerifyDriveLinkResult> {
  let folderId: string
  let shareLink: string

  if (isDriveOnlyId(folderPathOrSyntheticId)) {
    const reportId = driveOnlyReportIdFromSyntheticPath(folderPathOrSyntheticId)
    const record = listDriveOnlyReports().find((r) => r.reportId === reportId)
    if (!record) return { status: 'not-found' }
    folderId = record.driveFolderId
    shareLink = record.driveShareLink
  } else {
    let metadata
    try {
      metadata = readReportMetadata(folderPathOrSyntheticId)
    } catch {
      return { status: 'not-found' }
    }
    if (!metadata.drive) return { status: 'not-found' }
    folderId = metadata.drive.folderId
    shareLink = metadata.drive.shareLink
  }

  try {
    const exists = await driveProvider.folderExists(folderId)
    if (exists) return { status: 'exists', shareLink }
    syncStateAfterDriveDeletion(folderPathOrSyntheticId)
    return { status: 'not-found' }
  } catch (error) {
    const kind = error instanceof GoogleApiError ? error.kind : 'unexpected'
    return { status: 'check-failed', errorKind: kind }
  }
}
