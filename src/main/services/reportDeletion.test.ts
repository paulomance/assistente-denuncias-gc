import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

/**
 * `electron` nao roda dentro do vitest (processo Node puro) — a UNICA
 * coisa mockada aqui e `app.getPath('userData'|'documents')`, pra
 * apontar pra diretorios TEMPORARIOS reais. Tudo o resto (leitura/
 * escrita de metadata.json, exclusao de pastas, o indice "so Drive")
 * roda contra filesystem de verdade, sem nenhum mock de `fs` — mesma
 * filosofia empirica ja usada em `matchTeams.test.ts` (teste real
 * contra dado real, nao mock de tudo).
 *
 * Cenarios A-F pedidos explicitamente pelo usuario apos relatar um bug
 * real: "Excluir do computador" falhando com "Não foi possível excluir
 * a cópia local." depois de "Excluir do Google Drive" ter sido usado
 * primeiro. Reproduzido de ponta a ponta ANTES de escrever este arquivo
 * (script real sob Electron, ver docs/plano-frente-b.md) — a logica
 * como esta hoje passa em todos os 6 cenarios. Este arquivo formaliza
 * essa reproducao como suite automatizada permanente, pra nunca
 * regredir silenciosamente.
 */

let userDataDir: string
let rootDir: string

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => {
      if (name === 'userData') return userDataDir
      if (name === 'documents') return rootDir
      throw new Error(`app.getPath('${name}') não mockado neste teste`)
    }
  }
}))

// Imports dinamicos DEPOIS do vi.mock (hoisted pelo vitest, mas os
// modulos em si so devem ser importados apos userDataDir/rootDir
// existirem — usamos import() dentro de cada teste via helper).
async function freshModules(): Promise<{
  AppSettings: typeof import('./AppSettings')
  reportDeletion: typeof import('./reportDeletion')
  driveOnlyIndex: typeof import('./driveOnlyReportsIndex')
  metadataStore: typeof import('./reportMetadataStore')
}> {
  vi.resetModules()
  const AppSettings = await import('./AppSettings')
  const reportDeletion = await import('./reportDeletion')
  const driveOnlyIndex = await import('./driveOnlyReportsIndex')
  const metadataStore = await import('./reportMetadataStore')
  return { AppSettings, reportDeletion, driveOnlyIndex, metadataStore }
}

function makeUploadedReport(managedDir: string, id: string): string {
  const reportDir = join(managedDir, id)
  mkdirSync(join(reportDir, 'audio'), { recursive: true })
  writeFileSync(join(reportDir, 'audio', 'player1.wav'), 'fake-audio')
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
        fileIdsBySteamId64: {},
        shareLink: `https://drive.google.com/${id}`,
        uploadedAt: new Date().toISOString()
      }
    })
  )
  return reportDir
}

function makeLocalOnlyReport(managedDir: string, id: string): string {
  const reportDir = join(managedDir, id)
  mkdirSync(join(reportDir, 'audio'), { recursive: true })
  writeFileSync(join(reportDir, 'audio', 'player1.wav'), 'fake-audio')
  writeFileSync(
    join(reportDir, 'metadata.json'),
    JSON.stringify({
      reportId: id,
      createdAt: new Date().toISOString(),
      originalDemoFileName: 'fake.dem',
      matchId: null,
      map: null,
      players: [],
      status: 'local'
    })
  )
  return reportDir
}

beforeEach(() => {
  userDataDir = mkdtempSync(join(tmpdir(), 'gc-report-deletion-userdata-'))
  rootDir = mkdtempSync(join(tmpdir(), 'gc-report-deletion-root-'))
})

afterEach(() => {
  rmSync(userDataDir, { recursive: true, force: true })
  rmSync(rootDir, { recursive: true, force: true })
})

describe('reportDeletion — exclusão local e do Drive são independentes', () => {
  it('Cenário A: local + Drive → excluir local → sucesso, tombstone criado', async () => {
    const { AppSettings, reportDeletion, driveOnlyIndex } = await freshModules()
    const managedDir = AppSettings.getManagedEvidenceDir()
    mkdirSync(managedDir, { recursive: true })
    const dir = makeUploadedReport(managedDir, 'cenario-a')

    const result = reportDeletion.deleteLocalReportCopy(dir)

    expect(result.status).toBe('success')
    expect(existsSync(dir)).toBe(false)
    expect(driveOnlyIndex.listDriveOnlyReports().some((r) => r.reportId === 'cenario-a')).toBe(true)
  })

  it('Cenário B (bug relatado): local + Drive → excluir Drive → excluir local → sucesso', async () => {
    const { AppSettings, reportDeletion, metadataStore } = await freshModules()
    const managedDir = AppSettings.getManagedEvidenceDir()
    mkdirSync(managedDir, { recursive: true })
    const dir = makeUploadedReport(managedDir, 'cenario-b')

    // Passo 1: excluir do Drive primeiro (mesma chamada que
    // historyHandlers.ts faz apos o Google confirmar a exclusao).
    reportDeletion.syncStateAfterDriveDeletion(dir)

    expect(existsSync(dir)).toBe(true) // copia local NAO deve ser afetada
    const metaAfterDrive = metadataStore.readReportMetadata(dir)
    expect(metaAfterDrive.status).toBe('local')
    expect(metaAfterDrive.drive).toBeUndefined()

    // Passo 2: excluir do computador depois — este é o passo que o
    // usuário reportou falhando com "Não foi possível excluir a cópia
    // local."
    const result = reportDeletion.deleteLocalReportCopy(dir)

    expect(result.status).toBe('success')
    expect(existsSync(dir)).toBe(false)
  })

  it('Cenário C: local + Drive → excluir local → excluir Drive (via tombstone) → sucesso', async () => {
    const { AppSettings, reportDeletion, driveOnlyIndex } = await freshModules()
    const managedDir = AppSettings.getManagedEvidenceDir()
    mkdirSync(managedDir, { recursive: true })
    const dir = makeUploadedReport(managedDir, 'cenario-c')

    const localResult = reportDeletion.deleteLocalReportCopy(dir)
    expect(localResult.status).toBe('success')

    const synthPath = driveOnlyIndex.syntheticPathForDriveOnlyReport('cenario-c')
    reportDeletion.syncStateAfterDriveDeletion(synthPath)

    expect(driveOnlyIndex.listDriveOnlyReports().some((r) => r.reportId === 'cenario-c')).toBe(false)
  })

  it('Cenário D: somente local → excluir local → sucesso, sem tombstone', async () => {
    const { AppSettings, reportDeletion, driveOnlyIndex } = await freshModules()
    const managedDir = AppSettings.getManagedEvidenceDir()
    mkdirSync(managedDir, { recursive: true })
    const dir = makeLocalOnlyReport(managedDir, 'cenario-d')

    const result = reportDeletion.deleteLocalReportCopy(dir)

    expect(result.status).toBe('success')
    expect(existsSync(dir)).toBe(false)
    expect(driveOnlyIndex.listDriveOnlyReports().some((r) => r.reportId === 'cenario-d')).toBe(false)
  })

  it('Cenário E: somente Drive (tombstone) → excluir Drive → sucesso', async () => {
    const { reportDeletion, driveOnlyIndex } = await freshModules()
    driveOnlyIndex.appendDriveOnlyReport({
      reportId: 'cenario-e',
      createdAt: new Date().toISOString(),
      originalDemoFileName: 'fake.dem',
      matchId: '999',
      map: null,
      players: [],
      driveFolderId: 'drive-cenario-e',
      driveShareLink: 'https://drive.google.com/cenario-e',
      localDeletedAt: new Date().toISOString()
    })

    const synthPath = driveOnlyIndex.syntheticPathForDriveOnlyReport('cenario-e')
    reportDeletion.syncStateAfterDriveDeletion(synthPath)

    expect(driveOnlyIndex.listDriveOnlyReports().some((r) => r.reportId === 'cenario-e')).toBe(false)
  })

  it('Cenário F: pasta local já inexistente → excluir local → erro tratado, sem crash', async () => {
    const { AppSettings, reportDeletion } = await freshModules()
    const managedDir = AppSettings.getManagedEvidenceDir()
    mkdirSync(managedDir, { recursive: true })
    const fakeDir = join(managedDir, 'nao-existe')

    const result = reportDeletion.deleteLocalReportCopy(fakeDir)

    expect(result.status).toBe('error')
    if (result.status === 'error') {
      expect(result.reason).toBe('unexpected')
    }
  })

  it('bloqueia exclusão local enquanto o upload está em andamento (condição de corrida real)', async () => {
    const { AppSettings, reportDeletion } = await freshModules()
    const managedDir = AppSettings.getManagedEvidenceDir()
    mkdirSync(managedDir, { recursive: true })
    const dir = join(managedDir, 'cenario-uploading')
    mkdirSync(join(dir, 'audio'), { recursive: true })
    writeFileSync(join(dir, 'audio', 'p.wav'), 'x')
    writeFileSync(
      join(dir, 'metadata.json'),
      JSON.stringify({
        reportId: 'cenario-uploading',
        createdAt: new Date().toISOString(),
        originalDemoFileName: 'fake.dem',
        matchId: null,
        map: null,
        players: [],
        status: 'uploading'
      })
    )

    const result = reportDeletion.deleteLocalReportCopy(dir)

    expect(result.status).toBe('error')
    if (result.status === 'error') {
      expect(result.reason).toBe('upload-in-progress')
    }
    expect(existsSync(dir)).toBe(true) // nada foi apagado
  })

  it('nunca exclui um caminho fora da pasta gerenciada (checagem de segurança)', async () => {
    const { AppSettings, reportDeletion } = await freshModules()
    const managedDir = AppSettings.getManagedEvidenceDir()
    mkdirSync(managedDir, { recursive: true })
    // Simula um metadata.json fora da pasta gerenciada (nunca deveria
    // acontecer na pratica, ja que `listLocalReports()` so constroi
    // caminhos dentro dela — mas a funcao precisa recusar mesmo assim).
    const outsideDir = mkdtempSync(join(tmpdir(), 'gc-outside-'))
    writeFileSync(
      join(outsideDir, 'metadata.json'),
      JSON.stringify({
        reportId: 'outside',
        createdAt: new Date().toISOString(),
        originalDemoFileName: 'fake.dem',
        matchId: null,
        map: null,
        players: [],
        status: 'local'
      })
    )

    const result = reportDeletion.deleteLocalReportCopy(outsideDir)

    expect(result.status).toBe('error')
    expect(existsSync(outsideDir)).toBe(true) // nunca apagado
    rmSync(outsideDir, { recursive: true, force: true })
  })
})
