import { sanitizeFileNameSegment, stripInvalidFileNameChars } from './sanitizeFileNameSegment'

const MAX_FOLDER_NAME_LENGTH = 150
const MAX_PLAYER_NAME_LENGTH = 40
const MAX_PLAYERS_SHOWN = 3

/**
 * Padrao observado em demos baixadas da GC:
 * YYYY-MM-DD__HHmm__N__MATCHID__mapa__times.dem (ver validacao empirica
 * anterior a Fase B2). So um palpite de CONVENIENCIA para nomear a pasta
 * de forma legivel — o usuario pode renomear o arquivo livremente antes
 * de arrastar, entao isso nunca pode ser uma dependencia real do
 * sistema (mesma regra ja aplicada em toda a Frente B).
 */
export function extractMatchIdFromDemoFileName(demoFileName: string): string | null {
  const match = demoFileName.match(/^\d{4}-\d{2}-\d{2}__\d{4}__\d+__(\d+)__/)
  return match ? match[1] : null
}

/**
 * Mesmo padrao de nome de arquivo do `extractMatchIdFromDemoFileName`
 * acima (YYYY-MM-DD__HHmm__N__MATCHID__mapa__times.dem) — o mapa e o 5o
 * segmento separado por `__` (duplo underscore usado como delimitador de
 * campo no nome real da demo). Dividir por `__` em vez de um regex com
 * charset é deliberado: nomes de mapa reais usam underscore SIMPLES
 * internamente (de_inferno, de_dust2, cs_office), que um charset
 * restritivo poderia cortar no meio; `__` nunca aparece dentro de um
 * segmento, só entre eles. Mesma garantia da funcao irma: nunca inventa
 * um mapa — `null` se o nome nao seguir o padrao reconhecido (demo
 * renomeada pelo usuario, por exemplo).
 */
export function extractMapFromDemoFileName(demoFileName: string): string | null {
  const withoutExtension = demoFileName.replace(/\.dem$/i, '')
  const segments = withoutExtension.split('__')
  if (segments.length < 5) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(segments[0])) return null
  if (!/^\d{4}$/.test(segments[1])) return null
  if (!/^\d+$/.test(segments[2])) return null
  if (!/^\d+$/.test(segments[3])) return null
  const map = segments[4]
  return map.length > 0 ? map : null
}

function formatFallbackDatePrefix(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()}`
}

/**
 * Monta um nome de pasta legivel por humanos, no formato
 * "<ID da partida ou data> - Jogador1 - Jogador2 +N". Nunca decide
 * sozinho se o nome ja existe no disco (ver resolveUniqueDirectoryName em
 * EvidenceOrganizer.ts, que trata colisao) — essa funcao so decide COMO o
 * nome deveria se chamar antes de checar unicidade.
 */
export function buildReportFolderName(
  demoFileName: string,
  playerDisplayNames: string[],
  now: Date = new Date()
): string {
  const idPrefix = extractMatchIdFromDemoFileName(demoFileName) ?? formatFallbackDatePrefix(now)

  const shownPlayers = playerDisplayNames
    .slice(0, MAX_PLAYERS_SHOWN)
    .map((name) => sanitizeFileNameSegment(name, MAX_PLAYER_NAME_LENGTH))
  const extraCount = playerDisplayNames.length - shownPlayers.length

  const playersLabel = shownPlayers.length > 0 ? shownPlayers.join(' - ') : 'jogador'
  const nameWithExtra = extraCount > 0 ? `${playersLabel} +${extraCount}` : playersLabel

  const rawName = `${idPrefix} - ${nameWithExtra}`
  const cleanedName = stripInvalidFileNameChars(rawName).slice(0, MAX_FOLDER_NAME_LENGTH).trim()

  return cleanedName.length > 0 ? cleanedName : `denuncia-${now.getTime()}`
}
