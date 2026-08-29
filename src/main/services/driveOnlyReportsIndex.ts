import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

/**
 * Registro minimo de uma denuncia que ja foi enviada ao Google Drive mas
 * teve a copia local excluida pelo usuario ("Excluir do computador").
 *
 * Existe porque, a partir desta rodada, "Excluir do computador" remove a
 * pasta INTEIRA da denuncia — inclusive o `metadata.json` que antes
 * guardava a referencia ao Drive (`driveFolderId`/`shareLink`). Pedido
 * explicito do usuario: a pasta local deve sumir de verdade (nao so os
 * audios), mas o historico ainda precisa conseguir representar e
 * gerenciar ("Continuar para o formulario de denuncia", "Abrir no
 * Drive", "Excluir do Google Drive") uma denuncia que so existe na nuvem
 * agora. Este arquivo e essa a "memoria" minima que sobra fora da pasta
 * que foi apagada — mora em `userData` (nunca dentro de uma pasta de
 * denuncia, que pode ser excluida a qualquer momento).
 *
 * Continua sendo local-first (sem "banco de dados" de verdade) — so um
 * JSON simples, no mesmo espirito do `settings.json` (ver
 * AppSettings.ts). Reversao deliberada da decisao anterior de "nenhum
 * indice separado, so metadata.json por pasta" — documentado no
 * HANDOFF, nao e pra ser revertida de novo sem confirmar com o usuario.
 */
export interface DriveOnlyReportRecord {
  reportId: string
  createdAt: string
  originalDemoFileName: string
  matchId: string | null
  map: string | null
  players: { steamId64: string; displayName: string }[]
  driveFolderId: string
  driveShareLink: string
  /** Quando a copia local foi excluida — util pra ordenar/depurar, nunca exibido cru na UI. */
  localDeletedAt: string
}

interface DriveOnlyIndexFile {
  reports: DriveOnlyReportRecord[]
}

const INDEX_FILE_NAME = 'drive-only-reports.json'

function getIndexFilePath(): string {
  return join(app.getPath('userData'), INDEX_FILE_NAME)
}

function readIndex(): DriveOnlyIndexFile {
  try {
    const parsed = JSON.parse(readFileSync(getIndexFilePath(), 'utf-8')) as DriveOnlyIndexFile
    return { reports: Array.isArray(parsed.reports) ? parsed.reports : [] }
  } catch {
    return { reports: [] }
  }
}

function writeIndex(index: DriveOnlyIndexFile): void {
  mkdirSync(app.getPath('userData'), { recursive: true })
  writeFileSync(getIndexFilePath(), JSON.stringify(index, null, 2), 'utf-8')
}

export function listDriveOnlyReports(): DriveOnlyReportRecord[] {
  return readIndex().reports
}

export function appendDriveOnlyReport(record: DriveOnlyReportRecord): void {
  const index = readIndex()
  // Nunca duplica: se por algum motivo ja existir um registro pro mesmo
  // reportId (ex.: chamada repetida), substitui em vez de acumular.
  const withoutExisting = index.reports.filter((r) => r.reportId !== record.reportId)
  writeIndex({ reports: [...withoutExisting, record] })
}

export function removeDriveOnlyReport(reportId: string): void {
  const index = readIndex()
  writeIndex({ reports: index.reports.filter((r) => r.reportId !== reportId) })
}

/**
 * Prefixo usado como `folderPath` sintetico pra denuncias sem pasta
 * local (ver historyHandlers.ts) — nunca um caminho real de filesystem,
 * so um identificador estavel pra UI/IPC saberem que essa denuncia so
 * existe no Drive.
 */
export const DRIVE_ONLY_ID_PREFIX = 'drive-only:'

export function isDriveOnlyId(folderPath: string): boolean {
  return folderPath.startsWith(DRIVE_ONLY_ID_PREFIX)
}

export function driveOnlyReportIdFromSyntheticPath(folderPath: string): string {
  return folderPath.slice(DRIVE_ONLY_ID_PREFIX.length)
}

export function syntheticPathForDriveOnlyReport(reportId: string): string {
  return `${DRIVE_ONLY_ID_PREFIX}${reportId}`
}
