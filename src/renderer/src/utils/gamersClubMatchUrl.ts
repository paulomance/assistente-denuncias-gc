const GC_MATCH_BASE_URL = 'https://gamersclub.com.br/lobby/partida'

/**
 * Monta a URL da PAGINA DA PARTIDA na GC (diferente de
 * `gamersClubReportUrl.ts`, que monta a URL do FORMULARIO de
 * denuncia) — usada pra tornar "Partida #<matchId>" clicavel no
 * historico. So constroi o link a partir de um Match ID real ja
 * extraido/armazenado (`extractMatchIdFromDemoFileName`, ver
 * reportFolderName.ts) — nunca inventa um ID. Sem matchId, retorna
 * `null` e quem chama simplesmente nao renderiza nenhum link (pedido
 * explicito do usuario: "Se não houver Match ID: não criar link").
 */
export function buildGamersClubMatchUrl(matchId: string | null): string | null {
  return matchId ? `${GC_MATCH_BASE_URL}/${matchId}` : null
}
