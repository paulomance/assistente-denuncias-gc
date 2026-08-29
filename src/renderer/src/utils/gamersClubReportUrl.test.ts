import { describe, expect, it } from 'vitest'
import { buildGamersClubReportUrl } from './gamersClubReportUrl'

describe('buildGamersClubReportUrl', () => {
  it('aponta para a partida especifica quando o matchId e conhecido', () => {
    expect(buildGamersClubReportUrl('27701639')).toBe('https://gamersclub.com.br/report/27701639')
  })

  it('cai para a URL base do formulario quando o matchId e null', () => {
    expect(buildGamersClubReportUrl(null)).toBe('https://gamersclub.com.br/report')
  })
})
