import { existsSync, readdirSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { buildTeamAssignments, getMatchTeams } from './matchTeams'

describe('buildTeamAssignments', () => {
  it('atribui lado e nome de time a partir do team_num de cada jogador', () => {
    const clanNameBySide = new Map<number, string | null>([
      [2, 'Team Alpha'],
      [3, 'Team Beta']
    ])
    const result = buildTeamAssignments(
      [
        { steamid: '111', team_number: 2, name: 'Jogador Um' },
        { steamid: '222', team_number: 3, name: 'Jogador Dois' }
      ],
      clanNameBySide
    )
    expect(result).toEqual([
      { steamId64: '111', rawPlayerName: 'Jogador Um', side: 'T', teamName: 'Team Alpha' },
      { steamId64: '222', rawPlayerName: 'Jogador Dois', side: 'CT', teamName: 'Team Beta' }
    ])
  })

  it('usa null para lado e nome de time quando team_number nao e 2 nem 3 (ex.: espectador)', () => {
    const result = buildTeamAssignments([{ steamid: '333', team_number: 1, name: 'Espectador' }], new Map())
    expect(result).toEqual([{ steamId64: '333', rawPlayerName: 'Espectador', side: null, teamName: null }])
  })

  it('usa null para o nome do time quando o lado nao tem nome de time conhecido', () => {
    const result = buildTeamAssignments(
      [{ steamid: '111', team_number: 2, name: 'Jogador Um' }],
      new Map([[2, null]])
    )
    expect(result).toEqual([{ steamId64: '111', rawPlayerName: 'Jogador Um', side: 'T', teamName: null }])
  })
})

// Demo real usada na validacao empirica desde a Fase B2 (ver
// docs/plano-frente-b.md) — nao versionada (*.dem no .gitignore), so
// roda se existir algum arquivo .dem localmente. Descoberta GENERICA
// (qualquer .dem dentro da pasta, nunca um nome de arquivo fixo) de
// proposito — achado numa auditoria pre-publicacao: o nome do arquivo
// real usado antes embutia o Match ID e apelidos de jogadores reais
// direto no CODIGO-FONTE versionado (nunca no .dem em si, que ja e
// gitignored, mas sim aqui, no teste) — isso teria ido pro GitHub
// publico junto com o codigo. Generalizar a busca elimina esse dado
// pessoal do codigo-fonte sem perder a cobertura empirica real (o
// teste continua rodando de verdade contra QUALQUER demo real que um
// desenvolvedor tenha localmente).
function findLocalTestDemo(): string | null {
  const demoDir = join(process.cwd(), '_dados-locais', 'demo-teste')
  if (!existsSync(demoDir)) return null
  const demoFile = readdirSync(demoDir).find((name) => name.toLowerCase().endsWith('.dem'))
  return demoFile ? join(demoDir, demoFile) : null
}

const REAL_DEMO_PATH = findLocalTestDemo()

describe.skipIf(!REAL_DEMO_PATH)('getMatchTeams (teste real contra uma demo real)', () => {
  it('identifica os 10 jogadores de uma partida 5v5 real, separados corretamente em dois times de 5', () => {
    const result = getMatchTeams(REAL_DEMO_PATH as string)

    expect(result.available).toBe(true)
    expect(result.players).toHaveLength(10)

    const teamNames = new Set(result.players.map((p) => p.teamName))
    expect(teamNames.size).toBe(2)

    const sides = new Set(result.players.map((p) => p.side))
    expect(sides).toEqual(new Set(['CT', 'T']))

    // Cada time tem exatamente 5 jogadores — nunca hardcoda o NOME de
    // nenhum time/jogador especifico aqui (ver comentario acima sobre
    // por que isso foi generalizado nesta rodada).
    const perTeam = new Map<string, number>()
    for (const player of result.players) {
      const key = player.teamName ?? '(sem time)'
      perTeam.set(key, (perTeam.get(key) ?? 0) + 1)
    }
    for (const count of perTeam.values()) {
      expect(count).toBe(5)
    }

    // Todo jogador tem um SteamID64 real, um nome nao-vazio e um lado
    // atribuido — a atribuicao em si (nao QUEM especificamente) e o
    // que importa aqui.
    for (const player of result.players) {
      expect(player.steamId64).toMatch(/^\d{17}$/)
      expect(player.rawPlayerName.trim().length).toBeGreaterThan(0)
      expect(['CT', 'T']).toContain(player.side)
    }
  })
})
