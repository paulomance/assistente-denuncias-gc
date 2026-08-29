/**
 * Escolha de evidência de UM jogador — ESTADO ÚNICO, nunca dois campos
 * que precisam concordar entre si.
 *
 * Histórico do problema (3 rodadas): a primeira versão tinha
 * `selectedIds`/`includeChatIds` como dois `Set<string>` independentes
 * — bug: marcar "incluir chat" de um jogador sem áudio nunca contava
 * como seleção. A segunda trocou por `{includeAudio, includeChat}` —
 * tecnicamente independentes, mas o checkbox principal do card mantinha
 * a MESMA affordance de "selecionar este jogador" de sempre, e o
 * usuário continuava marcando-o por hábito, incluindo o áudio junto
 * mesmo quando só o chat era desejado. A terceira trocou o checkbox por
 * um único `<select>` (dropdown) — corrigia a affordance, mas o usuário
 * relatou continuar poluído/pouco direto ("Não incluir"/"Áudio"/
 * "Texto"/"Ambos" como texto exigia interpretar opções em vez de só
 * responder duas perguntas diretas: quero áudio? quero texto?).
 *
 * Esta versão (4ª) representa a MESMA escolha única de sempre — este
 * arquivo não muda a garantia estrutural (`EvidenceChoice` continua um
 * único campo, nunca dois booleanos que podem divergir) — só a forma
 * como `PlayerSelectionList.tsx` deixa o usuário editá-la: dois botões
 * de toggle independentes (🎙 áudio, 💬 texto) em vez de um dropdown.
 * `withAudioIncluded`/`withChatIncluded` são os dois lados simétricos
 * dessa edição — cada um mexe só no seu componente da escolha, nunca no
 * outro.
 */
export type EvidenceChoice = 'none' | 'chat' | 'audio' | 'both'

export type PlayerEvidenceChoiceMap = Record<string, EvidenceChoice>

export function getChoice(map: PlayerEvidenceChoiceMap, steamId64: string): EvidenceChoice {
  return map[steamId64] ?? 'none'
}

export function setChoice(
  map: PlayerEvidenceChoiceMap,
  steamId64: string,
  choice: EvidenceChoice
): PlayerEvidenceChoiceMap {
  return { ...map, [steamId64]: choice }
}

export function includesAudio(choice: EvidenceChoice): boolean {
  return choice === 'audio' || choice === 'both'
}

export function includesChat(choice: EvidenceChoice): boolean {
  return choice === 'chat' || choice === 'both'
}

/** Jogador faz parte da denúncia sempre que a escolha não é 'none' — nunca um campo guardado à parte. */
export function isIncluded(choice: EvidenceChoice): boolean {
  return choice !== 'none'
}

export function countIncluded(map: PlayerEvidenceChoiceMap): number {
  return Object.values(map).filter(isIncluded).length
}

/**
 * Aplica só a DECISÃO DE ÁUDIO sobre a escolha atual, preservando o que
 * já estava marcado pro texto — usado pelo toggle 🎙 do card. Ex.:
 * 'chat' + include=true → 'both'; 'both' + include=false → 'chat';
 * 'none' + include=true → 'audio'.
 */
export function withAudioIncluded(current: EvidenceChoice, include: boolean): EvidenceChoice {
  const chat = includesChat(current)
  if (include) return chat ? 'both' : 'audio'
  return chat ? 'chat' : 'none'
}

/**
 * Aplica só a DECISÃO DE TEXTO sobre a escolha atual, preservando o que
 * já estava marcado pro áudio — usado pelo toggle 💬 do card E pelo
 * atalho "Incluir este texto na denúncia" dentro do modal
 * (`ChatViewerModal.tsx`), que continua existindo como conveniência,
 * mas escreve no MESMO estado (nunca um `includeChat` paralelo). Ex.:
 * 'audio' + include=true → 'both'; 'both' + include=false → 'audio';
 * 'none' + include=true → 'chat'.
 */
export function withChatIncluded(current: EvidenceChoice, include: boolean): EvidenceChoice {
  const audio = includesAudio(current)
  if (include) return audio ? 'both' : 'chat'
  return audio ? 'audio' : 'none'
}
