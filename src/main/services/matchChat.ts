import { parseEvent } from '@laihoe/demoparser2'

/**
 * Mensagem de chat, ainda com `tick` — usado SO como chave de
 * ordenacao interna aqui dentro (nunca exposto pra UI/relatorio, ver
 * PlayerChatMessage em shared/types/Csgove.ts, que nao tem esse
 * campo — decisao explicita do usuario: preservar ORDEM importa, o
 * horario exato/tick nao).
 */
interface ChatMessageWithTick {
  steamId64: string
  text: string
  teamOnly: boolean
  tick: number
}

export interface MatchChatResult {
  available: boolean
  messagesBySteamId64: Record<string, ChatMessageWithTick[]>
}

interface RawPlayerChatRow {
  user_steamid: string
  text: string
  teamonly: boolean
  tick: number
}

/**
 * Le as mensagens de chat de texto diretamente da propria demo, mesmo
 * parser ja usado por matchTeams.ts (@laihoe/demoparser2) — nenhuma
 * dependencia nova. Achado real (estudo de viabilidade, ver
 * docs/plano-frente-b.md, confirmado contra uma demo real da GC):
 * `player_chat` e o evento mais completo — inclui tanto chat geral
 * quanto de equipe (campo `teamonly`), diferente de `chat_message`
 * (so cobre chat geral). Cerca de 1/3 das entradas de `player_chat`
 * numa demo real vem com `text` vazio (hipotese: gatilho de atividade
 * de voz/radio sem texto associado, nao confirmado a fundo) —
 * filtradas aqui, nunca chegam na UI como "mensagem vazia".
 *
 * Nunca lanca: qualquer falha (demo antiga, corrompida, sem chat)
 * resulta em `available: false` — mesma garantia de getMatchTeams(),
 * quem chama nunca deve deixar isso quebrar o fluxo de extracao de
 * audio, que e totalmente independente.
 */
export function getMatchChat(demoPath: string): MatchChatResult {
  try {
    const rows = parseEvent(demoPath, 'player_chat', [], []) as RawPlayerChatRow[]
    if (!Array.isArray(rows)) {
      return { available: false, messagesBySteamId64: {} }
    }

    const withText = rows.filter((row) => row.text && row.text.trim().length > 0)
    // Ordena por tick ASCENDENTE explicitamente — nunca confia na ordem
    // de retorno do parser pra garantir a ordem cronologica real
    // (requisito explicito do usuario), mesmo que na pratica o parser
    // ja pareca devolver em ordem.
    withText.sort((a, b) => a.tick - b.tick)

    const messagesBySteamId64: Record<string, ChatMessageWithTick[]> = {}
    for (const row of withText) {
      const message: ChatMessageWithTick = {
        steamId64: row.user_steamid,
        text: row.text.trim(),
        teamOnly: Boolean(row.teamonly),
        tick: row.tick
      }
      const existing = messagesBySteamId64[row.user_steamid]
      if (existing) {
        existing.push(message)
      } else {
        messagesBySteamId64[row.user_steamid] = [message]
      }
    }

    return { available: true, messagesBySteamId64 }
  } catch {
    return { available: false, messagesBySteamId64: {} }
  }
}
