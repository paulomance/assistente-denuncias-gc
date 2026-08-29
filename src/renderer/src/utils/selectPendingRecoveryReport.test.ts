import { describe, expect, it } from 'vitest'
import { selectPendingRecoveryReport } from './selectPendingRecoveryReport'
import type { ReportHistoryEntry } from '../../../shared/types/History'

function makeReport(overrides: Partial<ReportHistoryEntry>): ReportHistoryEntry {
  return {
    reportId: 'report-1',
    folderPath: 'C:/fake/report-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    originalDemoFileName: 'match1.dem',
    matchId: '111',
    map: 'de_mirage',
    players: [{ steamId64: '76561198000000001', displayName: 'Jogador Um' }],
    status: 'local',
    hasLocalCopy: true,
    localSizeBytes: 1000,
    driveShareLink: null,
    driveFolderId: null,
    ...overrides
  }
}

describe('selectPendingRecoveryReport', () => {
  it('retorna null quando não há denúncias', () => {
    expect(selectPendingRecoveryReport([])).toBeNull()
  })

  it('retorna null quando tudo já está enviado ao Drive', () => {
    const reports = [makeReport({ status: 'uploaded' })]
    expect(selectPendingRecoveryReport(reports)).toBeNull()
  })

  it('retorna null para uma denúncia "só no Drive" (sem cópia local, nada a retomar)', () => {
    const reports = [makeReport({ status: 'uploaded', hasLocalCopy: false })]
    expect(selectPendingRecoveryReport(reports)).toBeNull()
  })

  it('identifica uma denúncia com upload nunca iniciado', () => {
    const reports = [makeReport({ status: 'local' })]
    expect(selectPendingRecoveryReport(reports)?.reportId).toBe('report-1')
  })

  it('identifica uma denúncia com upload interrompido no meio', () => {
    const reports = [makeReport({ status: 'uploading' })]
    expect(selectPendingRecoveryReport(reports)?.reportId).toBe('report-1')
  })

  it('identifica uma denúncia com upload que falhou', () => {
    const reports = [makeReport({ status: 'upload-failed' })]
    expect(selectPendingRecoveryReport(reports)?.reportId).toBe('report-1')
  })

  it('escolhe a mais recente entre várias pendentes, mesmo fora de ordem', () => {
    const reports = [
      makeReport({ reportId: 'antiga', createdAt: '2026-01-01T00:00:00.000Z', status: 'local' }),
      makeReport({ reportId: 'recente', createdAt: '2026-01-03T00:00:00.000Z', status: 'upload-failed' }),
      makeReport({ reportId: 'media', createdAt: '2026-01-02T00:00:00.000Z', status: 'uploading' })
    ]
    expect(selectPendingRecoveryReport(reports)?.reportId).toBe('recente')
  })

  it('ignora pendências e escolhe null se a única entrada já concluída não é pendente', () => {
    const reports = [makeReport({ reportId: 'concluida', status: 'uploaded', hasLocalCopy: true })]
    expect(selectPendingRecoveryReport(reports)).toBeNull()
  })
})
