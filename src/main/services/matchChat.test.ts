import { existsSync, readdirSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { getMatchChat } from './matchChat'

// Mesma descoberta generica de matchTeams.test.ts (nunca um nome de
// arquivo fixo — ver comentario la sobre a auditoria de dados pessoais
// que motivou isso).
function findLocalTestDemo(): string | null {
  const demoDir = join(process.cwd(), '_dados-locais', 'demo-teste')
  if (!existsSync(demoDir)) return null
  const demoFile = readdirSync(demoDir).find((name) => name.toLowerCase().endsWith('.dem'))
  return demoFile ? join(demoDir, demoFile) : null
}

const REAL_DEMO_PATH = findLocalTestDemo()

describe.skipIf(!REAL_DEMO_PATH)('getMatchChat (teste real contra uma demo real)', () => {
  it('extrai mensagens reais de chat geral e de equipe, sem nenhuma mensagem vazia', () => {
    const result = getMatchChat(REAL_DEMO_PATH as string)

    expect(result.available).toBe(true)
    const allMessages = Object.values(result.messagesBySteamId64).flat()
    expect(allMessages.length).toBeGreaterThan(0)

    // Nenhuma mensagem vazia vazou pro resultado (o evento player_chat
    // real tem muitas entradas de texto vazio — gatilhos de voz/radio,
    // nunca devem aparecer aqui).
    for (const message of allMessages) {
      expect(message.text.trim().length).toBeGreaterThan(0)
      expect(typeof message.teamOnly).toBe('boolean')
    }

    // Existe pelo menos uma mensagem de cada categoria nesta demo real
    // (confirmado no estudo de viabilidade) — prova que a distinção
    // geral/equipe está sendo lida de verdade, não sempre um valor fixo.
    expect(allMessages.some((m) => m.teamOnly === true)).toBe(true)
    expect(allMessages.some((m) => m.teamOnly === false)).toBe(true)
  })

  it('preserva a ordem cronológica real (tick ascendente) dentro de cada jogador', () => {
    const result = getMatchChat(REAL_DEMO_PATH as string)

    for (const messages of Object.values(result.messagesBySteamId64)) {
      for (let i = 1; i < messages.length; i++) {
        expect(messages[i].tick).toBeGreaterThanOrEqual(messages[i - 1].tick)
      }
    }
  })

  it('agrupa corretamente por steamId64 — toda mensagem pertence ao jogador certo', () => {
    const result = getMatchChat(REAL_DEMO_PATH as string)

    for (const [steamId64, messages] of Object.entries(result.messagesBySteamId64)) {
      expect(steamId64).toMatch(/^\d{17}$/)
      expect(messages.length).toBeGreaterThan(0)
      for (const message of messages) {
        expect(message.steamId64).toBe(steamId64)
      }
    }
  })
})
