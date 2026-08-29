import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import type { ExtractedVoice } from '../../shared/types/Csgove'

/**
 * Mesma tecnica ja usada em reportDeletion.test.ts/AppSettings.test.ts
 * — so `app.getPath` e mockado, tudo o resto (organizacao real de
 * arquivos, staging + rename) roda contra diretorios temporarios REAIS.
 */
let userDataDir: string
let documentsDir: string
let sourceAudioDir: string

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => {
      if (name === 'userData') return userDataDir
      if (name === 'documents') return documentsDir
      throw new Error(`app.getPath('${name}') não mockado neste teste`)
    }
  }
}))

async function freshModules(): Promise<{
  organizer: InstanceType<typeof import('./EvidenceOrganizer').EvidenceOrganizer>
  cleanupOrphanedStagingFolders: typeof import('./tempOutputCleanup').cleanupOrphanedStagingFolders
}> {
  vi.resetModules()
  const { EvidenceOrganizer } = await import('./EvidenceOrganizer')
  const { cleanupOrphanedStagingFolders } = await import('./tempOutputCleanup')
  return { organizer: new EvidenceOrganizer(), cleanupOrphanedStagingFolders }
}

/** `includeAudioInReport: true` por padrão — a maioria dos testes deste arquivo cobre o fluxo "áudio incluído normalmente". */
function makePlayer(steamId64: string, name: string, includeAudioInReport = true): ExtractedVoice {
  const audioPath = join(sourceAudioDir, `${name}_${steamId64}.wav`)
  writeFileSync(audioPath, Buffer.from(`audio-de-${name}`))
  return { steamId64, rawPlayerName: name, audioPath, side: null, teamName: null, includeAudioInReport }
}

/** Jogador só-com-chat (sem áudio) — cenário real desde a rodada da lista completa de jogadores (ver csgoveHandlers.ts). */
function makeChatOnlyPlayer(
  steamId64: string,
  name: string,
  messages: { text: string; teamOnly: boolean }[],
  includeChatInReport = true
): ExtractedVoice {
  return { steamId64, rawPlayerName: name, side: null, teamName: null, chatMessages: messages, includeChatInReport }
}

beforeEach(() => {
  userDataDir = mkdtempSync(join(tmpdir(), 'gc-organizer-userdata-'))
  documentsDir = mkdtempSync(join(tmpdir(), 'gc-organizer-documents-'))
  sourceAudioDir = mkdtempSync(join(tmpdir(), 'gc-organizer-source-'))
})

afterEach(() => {
  rmSync(userDataDir, { recursive: true, force: true })
  rmSync(documentsDir, { recursive: true, force: true })
  rmSync(sourceAudioDir, { recursive: true, force: true })
})

describe('EvidenceOrganizer.organize — staging + rename atômico', () => {
  it('cria a pasta final real com audio/ e metadata.json, sem deixar staging pra trás', async () => {
    const { organizer } = await freshModules()
    const players = [makePlayer('76561198000000001', 'Jogador Um')]

    const result = organizer.organize('2026-08-22__partida__27701639.dem', players)

    expect(existsSync(result.reportDir)).toBe(true)
    expect(existsSync(join(result.reportDir, 'metadata.json'))).toBe(true)
    expect(existsSync(join(result.reportDir, 'audio'))).toBe(true)
    expect(readdirSync(join(result.reportDir, 'audio'))).toHaveLength(1)

    const managedRoot = join(documentsDir, 'Provas do Assistente de Denúncias GC')
    const leftoverStaging = readdirSync(managedRoot).filter((entry) => entry.includes('.montando-'))
    expect(leftoverStaging).toEqual([])
  })

  it('o metadata.json final reflete exatamente os jogadores selecionados', async () => {
    const { organizer } = await freshModules()
    const players = [makePlayer('76561198000000001', 'Alpha'), makePlayer('76561198000000002', 'Beta')]

    const result = organizer.organize('demo-sem-padrao-reconhecido.dem', players)
    const metadata = JSON.parse(readFileSync(join(result.reportDir, 'metadata.json'), 'utf-8'))

    expect(metadata.players).toEqual([
      { steamId64: '76561198000000001', displayName: 'Alpha' },
      { steamId64: '76561198000000002', displayName: 'Beta' }
    ])
    expect(metadata.status).toBe('local')
  })

  it('os caminhos de audio retornados apontam pra pasta FINAL, não pra staging', async () => {
    const { organizer } = await freshModules()
    const players = [makePlayer('76561198000000001', 'Jogador Um')]

    const result = organizer.organize('demo.dem', players)

    expect(result.audioFiles[0].audioPath).not.toContain('.montando-')
    expect(existsSync(result.audioFiles[0].audioPath)).toBe(true)
  })

  it('processar a mesma demo duas vezes gera pastas distintas, nunca sobrescreve', async () => {
    const { organizer } = await freshModules()
    const players1 = [makePlayer('76561198000000001', 'Jogador Um')]
    const players2 = [makePlayer('76561198000000001', 'Jogador Um')]

    const first = organizer.organize('mesma-demo.dem', players1)
    const second = organizer.organize('mesma-demo.dem', players2)

    expect(first.reportDir).not.toBe(second.reportDir)
    expect(existsSync(first.reportDir)).toBe(true)
    expect(existsSync(second.reportDir)).toBe(true)
  })
})

describe('EvidenceOrganizer.organize — chat de texto (evidência independente do áudio)', () => {
  it('grava o .txt do chat em chat/ quando includeChatInReport é true, no formato [GERAL]/[TIME], ORDEM preservada', async () => {
    const { organizer } = await freshModules()
    const player = makeChatOnlyPlayer('76561198000000001', 'Jogador Um', [
      { text: 'gg wp', teamOnly: false },
      { text: 'cola aqui', teamOnly: true },
      { text: 'falta 1', teamOnly: true }
    ])
    // Também tem áudio — confirma que os dois arquivos coexistem pro mesmo jogador.
    const withAudio = {
      ...player,
      audioPath: join(sourceAudioDir, 'Jogador Um_76561198000000001.wav'),
      includeAudioInReport: true
    }
    writeFileSync(withAudio.audioPath as string, Buffer.from('audio'))

    const result = organizer.organize('demo.dem', [withAudio])

    expect(existsSync(join(result.reportDir, 'chat'))).toBe(true)
    const chatFiles = readdirSync(join(result.reportDir, 'chat'))
    expect(chatFiles).toHaveLength(1)
    const content = readFileSync(join(result.reportDir, 'chat', chatFiles[0]), 'utf-8')
    expect(content).toBe('[GERAL] gg wp\n[TIME] cola aqui\n[TIME] falta 1\n')

    expect(result.chatFiles).toHaveLength(1)
    expect(result.chatFiles[0].steamId64).toBe('76561198000000001')
    expect(result.audioFiles).toHaveLength(1)
  })

  it('NUNCA cria a pasta chat/ quando nenhum jogador tem includeChatInReport true', async () => {
    const { organizer } = await freshModules()
    const player = makeChatOnlyPlayer('76561198000000001', 'Jogador Um', [{ text: 'oi', teamOnly: false }], false)
    const withAudio = { ...player, audioPath: join(sourceAudioDir, 'a.wav'), includeAudioInReport: true }
    writeFileSync(withAudio.audioPath as string, Buffer.from('audio'))

    const result = organizer.organize('demo.dem', [withAudio])

    expect(existsSync(join(result.reportDir, 'chat'))).toBe(false)
    expect(result.chatFiles).toEqual([])
  })

  it('jogador SÓ-COM-CHAT (sem audioPath) é organizado corretamente, sem tentar copiar áudio nenhum', async () => {
    const { organizer } = await freshModules()
    const chatOnly = makeChatOnlyPlayer('76561198000000002', 'So Chat', [{ text: 'so escrevi', teamOnly: false }])

    const result = organizer.organize('demo.dem', [chatOnly])

    expect(result.audioFiles).toEqual([])
    expect(result.chatFiles).toHaveLength(1)
    expect(existsSync(join(result.reportDir, 'audio'))).toBe(true) // sempre criada, mesmo vazia (ver organize())
    expect(readdirSync(join(result.reportDir, 'audio'))).toEqual([])

    // O jogador só-com-chat ainda aparece no metadata.json — faz parte da denúncia.
    const metadata = JSON.parse(readFileSync(join(result.reportDir, 'metadata.json'), 'utf-8'))
    expect(metadata.players).toEqual([{ steamId64: '76561198000000002', displayName: 'So Chat' }])
  })

  it('não grava chat quando o jogador tem chatMessages mas includeChatInReport está ausente (undefined)', async () => {
    const { organizer } = await freshModules()
    const player: ExtractedVoice = {
      steamId64: '76561198000000003',
      rawPlayerName: 'Sem Decisao',
      side: null,
      teamName: null,
      chatMessages: [{ text: 'oi', teamOnly: false }]
      // includeChatInReport ausente de propósito — nunca deve ser tratado como "true" implícito.
    }

    const result = organizer.organize('demo.dem', [player])

    expect(result.chatFiles).toEqual([])
    expect(existsSync(join(result.reportDir, 'chat'))).toBe(false)
  })
})

describe('EvidenceOrganizer.organize — bug real corrigido: áudio e chat são gates INDEPENDENTES', () => {
  it('1) NÃO copia áudio quando includeAudioInReport é false, mesmo com audioPath presente — só o .txt é gerado', async () => {
    const { organizer } = await freshModules()
    const player: ExtractedVoice = {
      steamId64: '76561198000000001',
      rawPlayerName: 'So Chat Marcado',
      audioPath: join(sourceAudioDir, 'a.wav'),
      side: null,
      teamName: null,
      includeAudioInReport: false,
      chatMessages: [{ text: 'oi', teamOnly: false }],
      includeChatInReport: true
    }
    writeFileSync(player.audioPath as string, Buffer.from('audio'))

    const result = organizer.organize('demo.dem', [player])

    expect(result.audioFiles).toEqual([])
    expect(readdirSync(join(result.reportDir, 'audio'))).toEqual([])
    expect(result.chatFiles).toHaveLength(1)
  })

  it('2) copia SÓ o áudio quando includeAudioInReport é true e includeChatInReport é false — nenhum .txt é gerado', async () => {
    const { organizer } = await freshModules()
    const player: ExtractedVoice = {
      steamId64: '76561198000000002',
      rawPlayerName: 'So Audio Marcado',
      audioPath: join(sourceAudioDir, 'b.wav'),
      side: null,
      teamName: null,
      includeAudioInReport: true,
      chatMessages: [{ text: 'oi', teamOnly: false }],
      includeChatInReport: false
    }
    writeFileSync(player.audioPath as string, Buffer.from('audio'))

    const result = organizer.organize('demo.dem', [player])

    expect(result.audioFiles).toHaveLength(1)
    expect(result.chatFiles).toEqual([])
    expect(existsSync(join(result.reportDir, 'chat'))).toBe(false)
  })

  it('3) copia os DOIS quando includeAudioInReport e includeChatInReport são true', async () => {
    const { organizer } = await freshModules()
    const player: ExtractedVoice = {
      steamId64: '76561198000000003',
      rawPlayerName: 'Os Dois',
      audioPath: join(sourceAudioDir, 'c.wav'),
      side: null,
      teamName: null,
      includeAudioInReport: true,
      chatMessages: [{ text: 'oi', teamOnly: false }],
      includeChatInReport: true
    }
    writeFileSync(player.audioPath as string, Buffer.from('audio'))

    const result = organizer.organize('demo.dem', [player])

    expect(result.audioFiles).toHaveLength(1)
    expect(result.chatFiles).toHaveLength(1)
  })

  it('4) jogador com os dois disponíveis mas NENHUMA evidência marcada não gera nenhum arquivo, só entra em metadata.players', async () => {
    const { organizer } = await freshModules()
    const player: ExtractedVoice = {
      steamId64: '76561198000000004',
      rawPlayerName: 'Nada Marcado',
      audioPath: join(sourceAudioDir, 'd.wav'),
      side: null,
      teamName: null,
      includeAudioInReport: false,
      chatMessages: [{ text: 'oi', teamOnly: false }],
      includeChatInReport: false
    }
    writeFileSync(player.audioPath as string, Buffer.from('audio'))

    const result = organizer.organize('demo.dem', [player])

    expect(result.audioFiles).toEqual([])
    expect(result.chatFiles).toEqual([])
    const metadata = JSON.parse(readFileSync(join(result.reportDir, 'metadata.json'), 'utf-8'))
    expect(metadata.players).toEqual([{ steamId64: '76561198000000004', displayName: 'Nada Marcado' }])
  })

  it('5) múltiplos jogadores com combinações diferentes: cada um gera exatamente os arquivos que marcou', async () => {
    const { organizer } = await freshModules()
    const audioOnly: ExtractedVoice = {
      steamId64: '1',
      rawPlayerName: 'Audio',
      audioPath: join(sourceAudioDir, 'p1.wav'),
      side: null,
      teamName: null,
      includeAudioInReport: true
    }
    const chatOnly: ExtractedVoice = {
      steamId64: '2',
      rawPlayerName: 'Chat',
      side: null,
      teamName: null,
      chatMessages: [{ text: 'oi', teamOnly: false }],
      includeChatInReport: true
    }
    const both: ExtractedVoice = {
      steamId64: '3',
      rawPlayerName: 'Ambos',
      audioPath: join(sourceAudioDir, 'p3.wav'),
      side: null,
      teamName: null,
      includeAudioInReport: true,
      chatMessages: [{ text: 'oi', teamOnly: false }],
      includeChatInReport: true
    }
    writeFileSync(audioOnly.audioPath as string, Buffer.from('audio'))
    writeFileSync(both.audioPath as string, Buffer.from('audio'))

    const result = organizer.organize('demo.dem', [audioOnly, chatOnly, both])

    expect(result.audioFiles.map((f) => f.steamId64).sort()).toEqual(['1', '3'])
    expect(result.chatFiles.map((f) => f.steamId64).sort()).toEqual(['2', '3'])
  })

  it('10) fluxo antigo (denúncia só por áudio) continua funcionando exatamente como antes', async () => {
    const { organizer } = await freshModules()
    const players = [makePlayer('76561198000000010', 'Fluxo Antigo')]

    const result = organizer.organize('demo.dem', players)

    expect(result.audioFiles).toHaveLength(1)
    expect(result.chatFiles).toEqual([])
    expect(existsSync(result.audioFiles[0].audioPath)).toBe(true)
  })
})

describe('cleanupOrphanedStagingFolders', () => {
  it('remove uma pasta de staging órfã (simulando um crash no meio do organize)', async () => {
    const { organizer, cleanupOrphanedStagingFolders } = await freshModules()
    // Denuncia real, pra confirmar que a limpeza não mexe nela.
    const realReport = organizer.organize('demo-real.dem', [makePlayer('76561198000000001', 'Real')])

    const managedRoot = join(documentsDir, 'Provas do Assistente de Denúncias GC')
    const orphanStaging = join(managedRoot, 'Denuncia Orfa.montando-9999-123456789')
    mkdirSync(orphanStaging, { recursive: true })
    writeFileSync(join(orphanStaging, 'audio-parcial.wav'), 'lixo')

    cleanupOrphanedStagingFolders()

    expect(existsSync(orphanStaging)).toBe(false)
    expect(existsSync(realReport.reportDir)).toBe(true)
  })

  it('não falha se a pasta gerenciada ainda não existir', async () => {
    const { cleanupOrphanedStagingFolders } = await freshModules()
    expect(() => cleanupOrphanedStagingFolders()).not.toThrow()
  })
})
