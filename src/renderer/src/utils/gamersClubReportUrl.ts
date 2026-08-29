const GC_REPORT_BASE_URL = 'https://gamersclub.com.br/report'

/**
 * Monta a URL do formulario de denuncia da GC para a partida especifica,
 * quando o matchId foi identificado a partir do nome da demo (ver
 * reportFolderName.ts::extractMatchIdFromDemoFileName). Sem matchId (nome
 * de arquivo renomeado pelo usuario, por exemplo), cai para a URL base do
 * formulario — nunca quebra o fluxo, so perde a conveniencia de já abrir
 * na partida certa.
 */
export function buildGamersClubReportUrl(matchId: string | null): string {
  return matchId ? `${GC_REPORT_BASE_URL}/${matchId}` : GC_REPORT_BASE_URL
}
