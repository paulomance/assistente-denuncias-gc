import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { readReportMetadata, updateDriveCheckpoint, updateReportStatus } from './reportMetadataStore'
import type { ReportMetadata } from '../../shared/types/Evidence'

/**
 * Sem nenhuma dependencia do Electron (so `fs`/`path`) — roda contra um
 * diretorio temporario real, sem mocks, mesmo padrao empirico usado em
 * reportDeletion.test.ts/audioPlayback.test.ts.
 */
let reportDir: string

function baseMetadata(): ReportMetadata {
  return {
    reportId: 'demo-report-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    originalDemoFileName: 'match123.dem',
    matchId: '123',
    map: 'de_mirage',
    players: [{ steamId64: '76561198000000001', displayName: 'Jogador Um' }],
    status: 'local'
  }
}

function writeMetadata(metadata: ReportMetadata): void {
  writeFileSync(join(reportDir, 'metadata.json'), JSON.stringify(metadata, null, 2), 'utf-8')
}

beforeEach(() => {
  reportDir = mkdtempSync(join(tmpdir(), 'gc-metadata-store-test-'))
  writeMetadata(baseMetadata())
})

afterEach(() => {
  rmSync(reportDir, { recursive: true, force: true })
})

describe('readReportMetadata', () => {
  it('lê de volta exatamente o que foi gravado no disco', () => {
    const result = readReportMetadata(reportDir)
    expect(result).toEqual(baseMetadata())
  })
})

describe('updateReportStatus', () => {
  it('troca só o status quando `drive` não é passado, preservando o resto', () => {
    updateReportStatus(reportDir, 'uploading')

    const result = readReportMetadata(reportDir)
    expect(result.status).toBe('uploading')
    expect(result.players).toEqual(baseMetadata().players)
  })

  it('preserva um driveCheckpoint já existente quando `drive` não é passado (retomada de upload)', () => {
    updateDriveCheckpoint(reportDir, {
      folderId: 'folder-abc',
      fileIdsBySteamId64: { '76561198000000001': 'file-1' },
      chatFileIdsBySteamId64: {},
      steamIdsFailedLastAttempt: [],
      chatSteamIdsFailedLastAttempt: []
    })

    updateReportStatus(reportDir, 'uploading')

    const result = readReportMetadata(reportDir)
    expect(result.driveCheckpoint).toEqual({
      folderId: 'folder-abc',
      fileIdsBySteamId64: { '76561198000000001': 'file-1' },
      chatFileIdsBySteamId64: {},
      steamIdsFailedLastAttempt: [],
      chatSteamIdsFailedLastAttempt: []
    })
  })

  it('grava `drive` e limpa um driveCheckpoint pendente quando o upload conclui com sucesso', () => {
    updateDriveCheckpoint(reportDir, {
      folderId: 'folder-abc',
      fileIdsBySteamId64: { '76561198000000001': 'file-1' },
      chatFileIdsBySteamId64: {},
      steamIdsFailedLastAttempt: [],
      chatSteamIdsFailedLastAttempt: []
    })

    updateReportStatus(reportDir, 'uploaded', {
      folderId: 'folder-abc',
      fileIdsBySteamId64: { '76561198000000001': 'file-1' },
      shareLink: 'https://drive.google.com/folder-abc',
      uploadedAt: '2026-01-02T00:00:00.000Z'
    })

    const result = readReportMetadata(reportDir)
    expect(result.status).toBe('uploaded')
    expect(result.drive?.shareLink).toBe('https://drive.google.com/folder-abc')
    expect(result.driveCheckpoint).toBeUndefined()
  })

  it('remove `drive` e limpa o driveCheckpoint quando `drive` é `null` (exclusão do Drive)', () => {
    writeMetadata({
      ...baseMetadata(),
      status: 'uploaded',
      drive: {
        folderId: 'folder-abc',
        fileIdsBySteamId64: { '76561198000000001': 'file-1' },
        shareLink: 'https://drive.google.com/folder-abc',
        uploadedAt: '2026-01-02T00:00:00.000Z'
      }
    })

    updateReportStatus(reportDir, 'local', null)

    const result = readReportMetadata(reportDir)
    expect(result.drive).toBeUndefined()
    expect(result.driveCheckpoint).toBeUndefined()
    expect(result.status).toBe('local')
  })

  it('nunca reescreve o arquivo do zero — campos desconhecidos por este módulo continuam intactos', () => {
    const raw = JSON.parse(readFileSync(join(reportDir, 'metadata.json'), 'utf-8')) as Record<string, unknown>
    writeFileSync(
      join(reportDir, 'metadata.json'),
      JSON.stringify({ ...raw, camposFuturosAindaNaoConhecidos: 'valor' }, null, 2),
      'utf-8'
    )

    updateReportStatus(reportDir, 'uploading')

    const result = JSON.parse(readFileSync(join(reportDir, 'metadata.json'), 'utf-8')) as Record<string, unknown>
    expect(result.camposFuturosAindaNaoConhecidos).toBe('valor')
  })
})

describe('updateDriveCheckpoint', () => {
  it('grava um checkpoint novo sem afetar o resto do metadata', () => {
    updateDriveCheckpoint(reportDir, {
      folderId: 'folder-xyz',
      fileIdsBySteamId64: { '76561198000000001': 'file-9' },
      chatFileIdsBySteamId64: {},
      steamIdsFailedLastAttempt: ['76561198000000002'],
      chatSteamIdsFailedLastAttempt: []
    })

    const result = readReportMetadata(reportDir)
    expect(result.driveCheckpoint).toEqual({
      folderId: 'folder-xyz',
      fileIdsBySteamId64: { '76561198000000001': 'file-9' },
      chatFileIdsBySteamId64: {},
      steamIdsFailedLastAttempt: ['76561198000000002'],
      chatSteamIdsFailedLastAttempt: []
    })
    expect(result.status).toBe(baseMetadata().status)
  })

  it('sobrescreve um checkpoint anterior com o mais recente (não acumula)', () => {
    updateDriveCheckpoint(reportDir, {
      folderId: 'folder-xyz',
      fileIdsBySteamId64: { a: 'file-1' },
      chatFileIdsBySteamId64: {},
      steamIdsFailedLastAttempt: [],
      chatSteamIdsFailedLastAttempt: []
    })
    updateDriveCheckpoint(reportDir, {
      folderId: 'folder-xyz',
      fileIdsBySteamId64: { a: 'file-1', b: 'file-2' },
      chatFileIdsBySteamId64: {},
      steamIdsFailedLastAttempt: [],
      chatSteamIdsFailedLastAttempt: []
    })

    const result = readReportMetadata(reportDir)
    expect(result.driveCheckpoint?.fileIdsBySteamId64).toEqual({ a: 'file-1', b: 'file-2' })
  })

  it('remove o checkpoint quando chamado com `null`', () => {
    updateDriveCheckpoint(reportDir, {
      folderId: 'folder-xyz',
      fileIdsBySteamId64: { a: 'file-1' },
      chatFileIdsBySteamId64: {},
      steamIdsFailedLastAttempt: [],
      chatSteamIdsFailedLastAttempt: []
    })

    updateDriveCheckpoint(reportDir, null)

    const result = readReportMetadata(reportDir)
    expect(result.driveCheckpoint).toBeUndefined()
  })
})
