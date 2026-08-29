import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

/**
 * Bug real que motivou esta suite: o botão "Copiar link da prova"
 * continuava funcionando com o link antigo depois que a pasta era
 * excluída do Google Drive (pelo próprio app, numa tela diferente, ou
 * diretamente em drive.google.com) — nada verificava se o link ainda
 * era válido antes de deixar o usuário copiá-lo/abri-lo.
 *
 * Mesma disciplina de reportDeletion.test.ts: só `electron.app.getPath`
 * e a rede do Google (`googleapis`)/autenticação são mockados — leitura/
 * escrita de metadata.json e do índice "só Drive" rodam contra
 * filesystem temporário real.
 */

let userDataDir: string
let rootDir: string

const filesGet = vi.fn()

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => {
      if (name === 'userData') return userDataDir
      if (name === 'documents') return rootDir
      throw new Error(`app.getPath('${name}') não mockado neste teste`)
    }
  }
}))

vi.mock('googleapis', () => ({
  google: {
    drive: () => ({ files: { get: filesGet } })
  }
}))

vi.mock('./google/GoogleAuthManager', () => ({
  GoogleAuthManager: vi.fn().mockImplementation(() => ({
    getAuthorizedClient: vi.fn().mockResolvedValue({}),
    getAuthStatus: vi.fn(),
    signIn: vi.fn(),
    signOut: vi.fn()
  }))
}))

async function freshModules(): Promise<{
  verification: typeof import('./driveLinkVerification')
  metadataStore: typeof import('./reportMetadataStore')
  driveOnlyIndex: typeof import('./driveOnlyReportsIndex')
}> {
  vi.resetModules()
  const verification = await import('./driveLinkVerification')
  const metadataStore = await import('./reportMetadataStore')
  const driveOnlyIndex = await import('./driveOnlyReportsIndex')
  return { verification, metadataStore, driveOnlyIndex }
}

function makeUploadedReportDir(id: string): string {
  const reportDir = join(rootDir, id)
  mkdirSync(join(reportDir, 'audio'), { recursive: true })
  writeFileSync(
    join(reportDir, 'metadata.json'),
    JSON.stringify({
      reportId: id,
      createdAt: new Date().toISOString(),
      originalDemoFileName: 'fake.dem',
      matchId: '27701639',
      map: 'de_inferno',
      players: [{ steamId64: '76561198000000001', displayName: 'Fake Player' }],
      status: 'uploaded',
      drive: {
        folderId: `drive-${id}`,
        fileIdsBySteamId64: { '76561198000000001': `file-${id}` },
        shareLink: `https://drive.google.com/${id}`,
        uploadedAt: new Date().toISOString()
      }
    }),
    'utf-8'
  )
  return reportDir
}

beforeEach(() => {
  userDataDir = mkdtempSync(join(tmpdir(), 'gc-drivelink-userdata-'))
  rootDir = mkdtempSync(join(tmpdir(), 'gc-drivelink-reports-'))
  filesGet.mockReset()
})

afterEach(() => {
  rmSync(userDataDir, { recursive: true, force: true })
  rmSync(rootDir, { recursive: true, force: true })
})

describe('verifyDriveLink — pasta com cópia local', () => {
  it('confirma "exists" e devolve o shareLink quando o Drive confirma que a pasta ainda existe', async () => {
    const reportDir = makeUploadedReportDir('report-1')
    filesGet.mockResolvedValueOnce({ data: { id: 'drive-report-1', trashed: false } })

    const { verification } = await freshModules()
    const result = await verification.verifyDriveLink(reportDir)

    expect(result).toEqual({ status: 'exists', shareLink: 'https://drive.google.com/report-1' })
  })

  it('confirma "not-found" e AUTOCURA o metadata.json quando o Google confirma que a pasta foi excluída', async () => {
    const reportDir = makeUploadedReportDir('report-2')
    const notFoundError = Object.assign(new Error('not found'), { response: { status: 404 } })
    filesGet.mockRejectedValueOnce(notFoundError)

    const { verification, metadataStore } = await freshModules()
    const result = await verification.verifyDriveLink(reportDir)

    expect(result).toEqual({ status: 'not-found' })
    // Autocura real: o metadata.json em disco não guarda mais o link morto.
    const updated = metadataStore.readReportMetadata(reportDir)
    expect(updated.drive).toBeUndefined()
    expect(updated.status).toBe('local')
    const raw = JSON.parse(readFileSync(join(reportDir, 'metadata.json'), 'utf-8'))
    expect(raw.drive).toBeUndefined()
    // Sem driveCheckpoint sobrando também — um upload seguinte (ver
    // driveHandlers.ts::drive:uploadReport) não terá `resumeFrom` e vai
    // criar uma pasta NOVA do zero, nunca reaproveitar a pasta excluída
    // nem o link antigo. Isso é o que garante que "fazer upload de novo
    // depois de uma exclusão" gera um link novo, não um fantasma.
    expect(updated.driveCheckpoint).toBeUndefined()
    expect(raw.driveCheckpoint).toBeUndefined()
  })

  it('não chama a API do Drive quando o metadata local JÁ NÃO tem referência ao Drive (exclusão já processada antes)', async () => {
    const reportDir = makeUploadedReportDir('report-3')
    const { verification, metadataStore } = await freshModules()
    // Simula uma exclusão já processada anteriormente pelo próprio app.
    metadataStore.updateReportStatus(reportDir, 'local', null)

    const result = await verification.verifyDriveLink(reportDir)

    expect(result).toEqual({ status: 'not-found' })
    expect(filesGet).not.toHaveBeenCalled()
  })

  it('retorna "check-failed" (nunca "not-found") numa falha ambígua, e NÃO mexe no metadata', async () => {
    const reportDir = makeUploadedReportDir('report-4')
    const authExpiredError = Object.assign(new Error('unauthorized'), { response: { status: 401 } })
    filesGet.mockRejectedValueOnce(authExpiredError)

    const { verification, metadataStore } = await freshModules()
    const result = await verification.verifyDriveLink(reportDir)

    expect(result).toEqual({ status: 'check-failed', errorKind: 'auth-expired' })
    const stillThere = metadataStore.readReportMetadata(reportDir)
    expect(stillThere.drive?.shareLink).toBe('https://drive.google.com/report-4')
  })

  it('retorna "not-found" imediatamente se a pasta local nem existe mais (metadata.json ilegível)', async () => {
    const { verification } = await freshModules()
    const result = await verification.verifyDriveLink(join(rootDir, 'pasta-que-nunca-existiu'))

    expect(result).toEqual({ status: 'not-found' })
    expect(filesGet).not.toHaveBeenCalled()
  })
})

describe('verifyDriveLink — denúncia "só Drive" (cópia local já excluída)', () => {
  it('confirma "exists" pra um registro do índice "só Drive"', async () => {
    const { verification, driveOnlyIndex } = await freshModules()
    driveOnlyIndex.appendDriveOnlyReport({
      reportId: 'report-5',
      createdAt: new Date().toISOString(),
      originalDemoFileName: 'fake.dem',
      matchId: null,
      map: null,
      players: [],
      driveFolderId: 'drive-report-5',
      driveShareLink: 'https://drive.google.com/report-5',
      localDeletedAt: new Date().toISOString()
    })
    filesGet.mockResolvedValueOnce({ data: { id: 'drive-report-5', trashed: false } })

    const result = await verification.verifyDriveLink(driveOnlyIndex.syntheticPathForDriveOnlyReport('report-5'))

    expect(result).toEqual({ status: 'exists', shareLink: 'https://drive.google.com/report-5' })
  })

  it('confirma "not-found" e remove do índice "só Drive" quando o Google confirma exclusão', async () => {
    const { verification, driveOnlyIndex } = await freshModules()
    driveOnlyIndex.appendDriveOnlyReport({
      reportId: 'report-6',
      createdAt: new Date().toISOString(),
      originalDemoFileName: 'fake.dem',
      matchId: null,
      map: null,
      players: [],
      driveFolderId: 'drive-report-6',
      driveShareLink: 'https://drive.google.com/report-6',
      localDeletedAt: new Date().toISOString()
    })
    const notFoundError = Object.assign(new Error('not found'), { response: { status: 404 } })
    filesGet.mockRejectedValueOnce(notFoundError)

    const result = await verification.verifyDriveLink(driveOnlyIndex.syntheticPathForDriveOnlyReport('report-6'))

    expect(result).toEqual({ status: 'not-found' })
    // Autocura real: não sobra nenhum registro fantasma no índice.
    expect(driveOnlyIndex.listDriveOnlyReports().find((r) => r.reportId === 'report-6')).toBeUndefined()
  })

  it('retorna "not-found" sem chamar a API se o registro nem existe mais no índice', async () => {
    const { verification, driveOnlyIndex } = await freshModules()
    const result = await verification.verifyDriveLink(driveOnlyIndex.syntheticPathForDriveOnlyReport('inexistente'))

    expect(result).toEqual({ status: 'not-found' })
    expect(filesGet).not.toHaveBeenCalled()
  })
})
