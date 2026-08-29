import { existsSync, readdirSync, rmSync, statSync } from 'fs'
import { dirname, join } from 'path'
import { getManagedEvidenceDir } from './AppSettings'
import { readReportMetadata } from './reportMetadataStore'
import type { ReportMetadata } from '../../shared/types/Evidence'

export interface LocalReportSummary {
  folderPath: string
  metadata: ReportMetadata
  hasLocalCopy: boolean
  localSizeBytes: number
}

function getDirectorySizeBytes(dirPath: string): number {
  let total = 0
  for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
    const entryPath = join(dirPath, entry.name)
    if (entry.isDirectory()) {
      total += getDirectorySizeBytes(entryPath)
    } else if (entry.isFile()) {
      total += statSync(entryPath).size
    }
  }
  return total
}

/**
 * Le todas as denuncias organizadas localmente a partir dos
 * metadata.json existentes — nao ha indice/banco separado (ver
 * docs/plano-frente-b.md, "Preparacao para funcionalidades futuras").
 * `localSizeBytes` e calculado na hora, nunca lido de um campo salvo
 * (evita numero desatualizado se o usuario mexer nos arquivos pelo
 * Explorer).
 */
export function listLocalReports(): LocalReportSummary[] {
  const managedDir = getManagedEvidenceDir()
  if (!existsSync(managedDir)) {
    return []
  }

  const summaries: LocalReportSummary[] = []

  for (const entry of readdirSync(managedDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue

    const folderPath = join(managedDir, entry.name)
    const metadataPath = join(folderPath, 'metadata.json')
    if (!existsSync(metadataPath)) continue // pasta sem metadata.json nao e uma denuncia nossa

    try {
      const metadata = readReportMetadata(folderPath)
      const audioDir = join(folderPath, 'audio')
      const hasLocalCopy = existsSync(audioDir) && readdirSync(audioDir).length > 0
      const localSizeBytes = hasLocalCopy ? getDirectorySizeBytes(audioDir) : 0
      summaries.push({ folderPath, metadata, hasLocalCopy, localSizeBytes })
    } catch {
      // metadata.json corrompido/ilegivel — ignora essa pasta em vez de
      // quebrar a listagem inteira por causa de uma denuncia so.
    }
  }

  summaries.sort((a, b) => (a.metadata.createdAt < b.metadata.createdAt ? 1 : -1))
  return summaries
}

/**
 * Remove a pasta INTEIRA da denuncia (audios + metadata.json + qualquer
 * outro arquivo/subpasta) — pedido explicito do usuario numa rodada em
 * que ele rejeitou a versao anterior desta funcao, que so apagava
 * `audio/` e mantinha `metadata.json`. Quem chama isso e responsavel
 * por confirmar `status === 'uploaded'` antes (ver historyHandlers.ts)
 * — nunca a unica copia existente de uma evidencia deve ser apagada; se
 * ja foi enviada ao Drive, quem chama tambem deve gravar um registro em
 * `driveOnlyReportsIndex.ts` ANTES de chamar isso, senao a referencia ao
 * Drive (folderId/shareLink) se perde para sempre junto com o
 * `metadata.json`.
 *
 * Checagem de seguranca: so aceita excluir uma pasta que seja filha
 * DIRETA da pasta gerenciada (nunca a propria raiz escolhida pelo
 * usuario, nunca uma pasta arbitraria) — defesa em profundidade contra
 * qualquer erro de programacao que passe um caminho errado, mesmo que o
 * caminho hoje sempre venha de `listLocalReports()` (que so constroi
 * caminhos dentro da pasta gerenciada).
 */
export function deleteLocalReportFolder(folderPath: string): void {
  const managedDir = getManagedEvidenceDir()
  if (folderPath === managedDir || dirname(folderPath) !== managedDir) {
    throw new Error(
      'deleteLocalReportFolder: caminho fora da pasta gerenciada de denúncias — recusado por segurança.'
    )
  }
  rmSync(folderPath, { recursive: true, force: true })
}
