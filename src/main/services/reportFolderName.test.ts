import { describe, expect, it } from 'vitest'
import {
  buildReportFolderName,
  extractMapFromDemoFileName,
  extractMatchIdFromDemoFileName
} from './reportFolderName'

const REAL_DEMO_NAME =
  '2026-08-22__1921__1__27701639__de_inferno__team-a-buboolz__vs__team-gb.dem'

describe('extractMatchIdFromDemoFileName', () => {
  it('extrai o ID da partida do nome real de uma demo da GC', () => {
    expect(extractMatchIdFromDemoFileName(REAL_DEMO_NAME)).toBe('27701639')
  })

  it('retorna null se o arquivo foi renomeado e nao segue o padrao', () => {
    expect(extractMatchIdFromDemoFileName('minha_demo_favorita.dem')).toBeNull()
  })
})

describe('extractMapFromDemoFileName', () => {
  it('extrai o mapa do nome real de uma demo da GC', () => {
    expect(extractMapFromDemoFileName(REAL_DEMO_NAME)).toBe('de_inferno')
  })

  it('preserva o underscore simples do nome do mapa (nao corta em de_dust2)', () => {
    expect(
      extractMapFromDemoFileName('2026-08-22__1921__1__27701639__de_dust2__team-a__vs__team-b.dem')
    ).toBe('de_dust2')
  })

  it('retorna null se o arquivo foi renomeado e nao segue o padrao', () => {
    expect(extractMapFromDemoFileName('minha_demo_favorita.dem')).toBeNull()
  })
})

describe('buildReportFolderName', () => {
  it('usa o ID da partida + nomes dos jogadores quando o padrao da demo e reconhecido', () => {
    const name = buildReportFolderName(REAL_DEMO_NAME, ['PlayerOne', 'PlayerTwo'])
    expect(name).toBe('27701639 - PlayerOne - PlayerTwo')
  })

  it('usa uma data como fallback quando o nome da demo foi alterado pelo usuario', () => {
    const name = buildReportFolderName('minha_demo.dem', ['PlayerOne'], new Date(2026, 7, 22))
    expect(name).toBe('22-08-2026 - PlayerOne')
  })

  it('trunca a lista de jogadores com "+N" quando ha muitos selecionados', () => {
    const name = buildReportFolderName(
      REAL_DEMO_NAME,
      ['P1', 'P2', 'P3', 'P4', 'P5']
    )
    expect(name).toBe('27701639 - P1 - P2 - P3 +2')
  })

  it('remove caracteres invalidos em nome de pasta do Windows nos nomes de jogador', () => {
    const name = buildReportFolderName(REAL_DEMO_NAME, ['Player<One>', 'Two:Three'])
    expect(name).toBe('27701639 - PlayerOne - TwoThree')
  })

  it('mantem simbolos unicode decorativos reais (nao sao invalidos no Windows)', () => {
    const name = buildReportFolderName(REAL_DEMO_NAME, ['✓ ★ Nome do Jogador'])
    expect(name).toBe('27701639 - ✓ ★ Nome do Jogador')
  })

  it('nao quebra com lista de jogadores vazia', () => {
    const name = buildReportFolderName(REAL_DEMO_NAME, [])
    expect(name).toBe('27701639 - jogador')
  })

  it('nunca produz um nome maior que o limite seguro para pasta do Windows', () => {
    const manyLongNames = Array.from({ length: 10 }, (_, i) => `NomeBemLongoDoJogador${i}`.repeat(3))
    const name = buildReportFolderName(REAL_DEMO_NAME, manyLongNames)
    expect(name.length).toBeLessThanOrEqual(150)
  })
})
