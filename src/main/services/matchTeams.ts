import { parseEvent, parsePlayerInfo, parseTicks } from '@laihoe/demoparser2'

export interface PlayerTeamAssignment {
  steamId64: string
  /**
   * Nome bruto do jogador na partida — vem do MESMO `parsePlayerInfo`
   * ja usado pra time/lado (campo `name`, confirmado disponivel
   * empiricamente, nunca precisou de uma chamada nova ao parser).
   * Adicionado nesta rodada pra permitir montar um card de jogador
   * mesmo pra quem nao tem audio (ver csgoveHandlers.ts) — antes o
   * nome so vinha do resultado do CSGOVE, que so cobre quem falou.
   */
  rawPlayerName: string
  teamName: string | null
  side: 'CT' | 'T' | null
}

export interface MatchTeamsResult {
  available: boolean
  players: PlayerTeamAssignment[]
}

const TEAM_NUM_TO_SIDE: Record<number, 'CT' | 'T'> = { 2: 'T', 3: 'CT' }

interface RawPlayerInfoRow {
  steamid: string
  team_number: number
  name: string
}

interface RawTickRow {
  team_num: number
  team_clan_name: string | null | undefined
}

/**
 * Converte as linhas brutas do parser + o nome de time por lado num
 * PlayerTeamAssignment por jogador. Funcao pura (sem tocar a demo) para
 * poder ser testada com dados sinteticos, sem depender de um arquivo
 * .dem real.
 */
export function buildTeamAssignments(
  playerRows: RawPlayerInfoRow[],
  clanNameBySide: Map<number, string | null>
): PlayerTeamAssignment[] {
  return playerRows.map((row) => ({
    steamId64: row.steamid,
    rawPlayerName: row.name,
    side: TEAM_NUM_TO_SIDE[row.team_number] ?? null,
    teamName: clanNameBySide.get(row.team_number) ?? null
  }))
}

function normalizeClanName(rawName: string | null | undefined): string | null {
  const trimmed = rawName?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : null
}

/**
 * Le o nome de time associado a cada lado (team_num) num UNICO tick de
 * referencia. Confirmado empiricamente (investigacao pre-implementacao,
 * ver docs/plano-frente-b.md): o campo team_clan_name e reatribuido por
 * LADO a cada troca de campo no intervalo — ou seja, ler esse campo em
 * varios rounds da o nome de time "errado" (o do lado, nao o do
 * jogador) para quem trocou de lado. Um unico snapshot evita esse
 * problema por completo: dentro de um mesmo tick a associacao
 * lado->nome de time e sempre consistente.
 */
function readClanNameBySideAtTick(demoPath: string, tick: number): Map<number, string | null> {
  const rows = parseTicks(demoPath, ['team_num', 'team_clan_name'], [tick]) as RawTickRow[]
  const clanNameBySide = new Map<number, string | null>()
  for (const row of rows) {
    if (!clanNameBySide.has(row.team_num)) {
      clanNameBySide.set(row.team_num, normalizeClanName(row.team_clan_name))
    }
  }
  return clanNameBySide
}

/**
 * Tick de referencia = o mais tardio entre os eventos round_start/
 * round_end da demo. Deliberadamente NAO usamos o numero do round
 * reportado pelo parser para escolher esse tick: a mesma investigacao
 * encontrou reinicios reais de contagem de round (warmup/round de faca)
 * numa partida real da GC, entao "round 1"/"round 2" no evento nao e
 * confiavel como indice sequencial. Pegar o tick mais alto entre os
 * eventos de round e robusto a isso e sempre aponta para perto do fim
 * da partida.
 */
function findLatestRoundTick(demoPath: string): number | null {
  const starts = parseEvent(demoPath, 'round_start', [], []) as Array<{ tick: number }>
  const ends = parseEvent(demoPath, 'round_end', [], []) as Array<{ tick: number }>
  const allTicks = [...starts, ...ends].map((entry) => entry.tick)
  return allTicks.length > 0 ? Math.max(...allTicks) : null
}

/**
 * Le time/lado de cada jogador diretamente da propria demo, sem
 * depender de nenhuma API/site da Gamers Club (preferencia explicita do
 * usuario, confirmada viavel numa investigacao empirica previa — ver
 * docs/plano-frente-b.md). Nunca lanca: qualquer falha (demo antiga,
 * corrompida, sem rounds, ou qualquer erro do parser) resulta em
 * `available: false`, e quem chama deve tratar isso mostrando a lista de
 * jogadores sem separar por equipe — a extracao de audio via CSGOVE
 * nunca depende deste resultado.
 */
export function getMatchTeams(demoPath: string): MatchTeamsResult {
  try {
    const playerRows = parsePlayerInfo(demoPath) as RawPlayerInfoRow[]
    if (!Array.isArray(playerRows) || playerRows.length === 0) {
      return { available: false, players: [] }
    }

    const referenceTick = findLatestRoundTick(demoPath)
    const clanNameBySide =
      referenceTick === null ? new Map<number, string | null>() : readClanNameBySideAtTick(demoPath, referenceTick)

    return { available: true, players: buildTeamAssignments(playerRows, clanNameBySide) }
  } catch {
    return { available: false, players: [] }
  }
}
