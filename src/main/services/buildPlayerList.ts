import type { ExtractedVoice, PlayerChatMessage } from '../../shared/types/Csgove'
import type { getMatchTeams } from './matchTeams'
import type { getMatchChat } from './matchChat'

/**
 * Extraído de `csgoveHandlers.ts` pra ser testável isoladamente (mesmo
 * motivo de `classifyUploadError.ts`/`reportDeletion.ts`: lógica
 * dentro de um handler de `ipcMain` não dá pra testar sem subir o
 * `ipcMain` inteiro).
 */
function toPublicChatMessages(
  messages: { text: string; teamOnly: boolean }[] | undefined
): PlayerChatMessage[] | undefined {
  if (!messages || messages.length === 0) return undefined
  return messages.map((message) => ({ text: message.text, teamOnly: message.teamOnly }))
}

/**
 * Monta a lista final de jogadores mostrada na tela de seleção,
 * fundindo 3 fontes independentes: áudio (CSGOVE, só quem falou),
 * time/lado + roster completo (getMatchTeams, todos os jogadores da
 * demo) e chat de texto (getMatchChat, só quem escreveu). Um jogador
 * aparece se tiver PELO MENOS UMA evidência (áudio OU chat) — nunca um
 * card vazio sem nada pra mostrar/denunciar (regra explícita do
 * usuário: "jogadores com pelo menos uma evidência podem ser
 * selecionados").
 *
 * Sem o roster completo (`teams.available === false`), não há como
 * descobrir nome/existência de jogadores só-com-chat (o CSGOVE nunca
 * soube deles) — cai pro comportamento anterior (só quem tem áudio),
 * mas ainda enriquece com chat quando o steamId64 bate, pra não perder
 * cobertura de chat nos jogadores que JÁ tinham card.
 */
export function buildPlayerList(
  audioFiles: ExtractedVoice[],
  teams: ReturnType<typeof getMatchTeams>,
  chat: ReturnType<typeof getMatchChat>
): ExtractedVoice[] {
  const chatBySteamId = chat.available ? chat.messagesBySteamId64 : {}

  if (!teams.available) {
    return audioFiles.map((audio) => ({
      ...audio,
      teamName: null,
      side: null,
      chatMessages: toPublicChatMessages(chatBySteamId[audio.steamId64])
    }))
  }

  const audioBySteamId = new Map(audioFiles.map((audio) => [audio.steamId64, audio]))
  const merged: ExtractedVoice[] = []

  for (const player of teams.players) {
    const audio = audioBySteamId.get(player.steamId64)
    const chatMessages = toPublicChatMessages(chatBySteamId[player.steamId64])
    if (!audio && (!chatMessages || chatMessages.length === 0)) continue

    merged.push({
      steamId64: player.steamId64,
      // Prefere o nome que o próprio CSGOVE já usava (comportamento
      // estabelecido) — só cai pro nome do demoparser2 quando o
      // jogador não tem áudio (não passou pelo CSGOVE de jeito nenhum).
      rawPlayerName: audio?.rawPlayerName ?? player.rawPlayerName,
      audioPath: audio?.audioPath,
      teamName: player.teamName,
      side: player.side,
      chatMessages
    })
  }

  return merged
}
