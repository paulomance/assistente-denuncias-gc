import { describe, expect, it } from 'vitest'
import { buildPlayerList } from './buildPlayerList'
import type { ExtractedVoice } from '../../shared/types/Csgove'
import type { MatchTeamsResult } from './matchTeams'
import type { MatchChatResult } from './matchChat'

function audio(steamId64: string, rawPlayerName: string): ExtractedVoice {
  return { steamId64, rawPlayerName, audioPath: `C:\\fake\\${rawPlayerName}.wav`, side: null, teamName: null }
}

describe('buildPlayerList', () => {
  it('inclui um jogador que só tem áudio (sem chat)', () => {
    const teams: MatchTeamsResult = {
      available: true,
      players: [{ steamId64: '1', rawPlayerName: 'Jogador A', side: 'CT', teamName: 'Time 1' }]
    }
    const chat: MatchChatResult = { available: true, messagesBySteamId64: {} }

    const result = buildPlayerList([audio('1', 'Jogador A')], teams, chat)

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ steamId64: '1', audioPath: 'C:\\fake\\Jogador A.wav', chatMessages: undefined })
  })

  it('inclui um jogador que só tem chat (sem áudio) — cenário novo desta rodada', () => {
    const teams: MatchTeamsResult = {
      available: true,
      players: [{ steamId64: '2', rawPlayerName: 'Jogador B', side: 'T', teamName: 'Time 2' }]
    }
    const chat: MatchChatResult = {
      available: true,
      messagesBySteamId64: { '2': [{ steamId64: '2', text: 'oi', teamOnly: false, tick: 100 }] }
    }

    const result = buildPlayerList([], teams, chat)

    expect(result).toHaveLength(1)
    expect(result[0].audioPath).toBeUndefined()
    expect(result[0].rawPlayerName).toBe('Jogador B')
    expect(result[0].chatMessages).toEqual([{ text: 'oi', teamOnly: false }])
  })

  it('inclui um jogador com os dois (áudio e chat)', () => {
    const teams: MatchTeamsResult = {
      available: true,
      players: [{ steamId64: '3', rawPlayerName: 'Jogador C', side: 'CT', teamName: 'Time 1' }]
    }
    const chat: MatchChatResult = {
      available: true,
      messagesBySteamId64: { '3': [{ steamId64: '3', text: 'gg', teamOnly: false, tick: 50 }] }
    }

    const result = buildPlayerList([audio('3', 'Jogador C')], teams, chat)

    expect(result).toHaveLength(1)
    expect(result[0].audioPath).toBe('C:\\fake\\Jogador C.wav')
    expect(result[0].chatMessages).toEqual([{ text: 'gg', teamOnly: false }])
  })

  it('NUNCA inclui um jogador do roster sem áudio E sem chat (sem evidência nenhuma)', () => {
    const teams: MatchTeamsResult = {
      available: true,
      players: [
        { steamId64: '1', rawPlayerName: 'Com Áudio', side: 'CT', teamName: 'Time 1' },
        { steamId64: '4', rawPlayerName: 'Sem Nada', side: 'CT', teamName: 'Time 1' }
      ]
    }
    const chat: MatchChatResult = { available: true, messagesBySteamId64: {} }

    const result = buildPlayerList([audio('1', 'Com Áudio')], teams, chat)

    expect(result).toHaveLength(1)
    expect(result.find((p) => p.steamId64 === '4')).toBeUndefined()
  })

  it('sem roster completo (teams indisponível), cai pro comportamento antigo mas ainda anexa chat quando bate o steamId64', () => {
    const teams: MatchTeamsResult = { available: false, players: [] }
    const chat: MatchChatResult = {
      available: true,
      messagesBySteamId64: { '1': [{ steamId64: '1', text: 'oi', teamOnly: true, tick: 10 }] }
    }

    const result = buildPlayerList([audio('1', 'Jogador A')], teams, chat)

    expect(result).toHaveLength(1)
    expect(result[0].teamName).toBeNull()
    expect(result[0].side).toBeNull()
    expect(result[0].chatMessages).toEqual([{ text: 'oi', teamOnly: true }])
  })

  it('sem roster completo E sem chat, nunca perde nenhum jogador que o CSGOVE já tinha encontrado', () => {
    const teams: MatchTeamsResult = { available: false, players: [] }
    const chat: MatchChatResult = { available: false, messagesBySteamId64: {} }

    const result = buildPlayerList([audio('1', 'A'), audio('2', 'B')], teams, chat)

    expect(result).toHaveLength(2)
  })

  it('prefere o nome vindo do CSGOVE ao nome do demoparser2 quando o jogador tem áudio', () => {
    const teams: MatchTeamsResult = {
      available: true,
      players: [{ steamId64: '1', rawPlayerName: 'Nome do demoparser2', side: 'CT', teamName: 'Time 1' }]
    }
    const chat: MatchChatResult = { available: true, messagesBySteamId64: {} }

    const result = buildPlayerList([audio('1', 'Nome do CSGOVE')], teams, chat)

    expect(result[0].rawPlayerName).toBe('Nome do CSGOVE')
  })

  it('mensagens vazias/undefined nunca viram um array vazio no resultado (undefined, nunca [])', () => {
    const teams: MatchTeamsResult = {
      available: true,
      players: [{ steamId64: '1', rawPlayerName: 'A', side: 'CT', teamName: 'Time 1' }]
    }
    const chat: MatchChatResult = { available: true, messagesBySteamId64: {} }

    const result = buildPlayerList([audio('1', 'A')], teams, chat)

    expect(result[0].chatMessages).toBeUndefined()
  })
})
