import { describe, expect, it } from 'vitest'
import { buildGamersClubMatchUrl } from './gamersClubMatchUrl'

describe('buildGamersClubMatchUrl', () => {
  it('aponta para a página da partida quando o matchId é conhecido', () => {
    expect(buildGamersClubMatchUrl('27701639')).toBe(
      'https://gamersclub.com.br/lobby/partida/27701639'
    )
  })

  it('retorna null quando o matchId é null — nunca inventa um link', () => {
    expect(buildGamersClubMatchUrl(null)).toBeNull()
  })
})
