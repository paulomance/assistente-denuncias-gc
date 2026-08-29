import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { ReportDriveCheckpoint, ReportDriveInfo, ReportMetadata, ReportStatus } from '../../shared/types/Evidence'

function getMetadataPath(reportDir: string): string {
  return join(reportDir, 'metadata.json')
}

export function readReportMetadata(reportDir: string): ReportMetadata {
  return JSON.parse(readFileSync(getMetadataPath(reportDir), 'utf-8')) as ReportMetadata
}

/**
 * Atualiza status/drive no metadata.json existente — nunca recria o
 * arquivo do zero, para nao perder nenhum campo ja gravado pelo
 * EvidenceOrganizer.
 *
 * `drive` tem 3 comportamentos possiveis: `undefined` (nao mexe no que
 * ja tinha), um objeto (grava/atualiza — e limpa `driveCheckpoint`,
 * que so faz sentido enquanto o upload ainda esta incompleto), `null`
 * (remove — usado quando a denuncia e excluida do Drive, tambem limpa
 * `driveCheckpoint` porque a pasta referenciada nele deixou de
 * existir).
 */
export function updateReportStatus(
  reportDir: string,
  status: ReportStatus,
  drive?: ReportDriveInfo | null
): void {
  const current = readReportMetadata(reportDir)
  const updated: ReportMetadata = { ...current, status }
  if (drive === null) {
    delete updated.drive
    delete updated.driveCheckpoint
  } else if (drive) {
    updated.drive = drive
    delete updated.driveCheckpoint
  }
  writeFileSync(getMetadataPath(reportDir), JSON.stringify(updated, null, 2), 'utf-8')
}

/**
 * Grava o progresso PARCIAL de um upload em andamento — chamado depois
 * de criar a pasta no Drive e depois de CADA arquivo confirmado (ver
 * GoogleDriveProvider.uploadReport()), nao so no final. Uma tentativa
 * seguinte le esse checkpoint antes de comecar e reaproveita a mesma
 * pasta + pula os arquivos ja confirmados — nunca recria a pasta do
 * zero nem reenvia o que ja foi enviado. `null` remove o checkpoint
 * (upload concluido com sucesso, ou denuncia excluida).
 */
export function updateDriveCheckpoint(reportDir: string, checkpoint: ReportDriveCheckpoint | null): void {
  const current = readReportMetadata(reportDir)
  const updated: ReportMetadata = { ...current }
  if (checkpoint === null) {
    delete updated.driveCheckpoint
  } else {
    updated.driveCheckpoint = checkpoint
  }
  writeFileSync(getMetadataPath(reportDir), JSON.stringify(updated, null, 2), 'utf-8')
}
