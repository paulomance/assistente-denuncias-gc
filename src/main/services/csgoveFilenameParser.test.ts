import { describe, expect, it } from 'vitest'
import { parseCsgoveAudioFilename } from './csgoveFilenameParser'

// Nome no MESMO formato real observado na validacao empirica da B2
// (docs/plano-frente-b.md) — so o identificador da partida/jogadores e
// generico de proposito (nunca um dado real de jogador real, ver
// auditoria de pre-publicacao).
const demoBaseName =
  '2026-08-22__1921__1__11111111__de_inferno__team-a__vs__team-b'

describe('parseCsgoveAudioFilename', () => {
  // Formatos reais observados ao rodar o CSGOVE contra uma demo verdadeira
  // da GC (simbolos/espacos/@ no nickname), com identificadores genericos.
  it('interpreta um nome real com simbolo decorativo e @ no nickname', () => {
    const fileName = `${demoBaseName}_© ☆ jog@dor Um_76561198000000001.wav`
    expect(parseCsgoveAudioFilename(fileName, demoBaseName)).toEqual({
      ok: true,
      steamId64: '76561198000000001',
      rawPlayerName: '© ☆ jog@dor Um'
    })
  })

  it('interpreta um nome real com espacos e simbolos unicode decorativos', () => {
    const fileName = `${demoBaseName}_✓ ★ Jogador Dois_76561198000000002.wav`
    expect(parseCsgoveAudioFilename(fileName, demoBaseName)).toEqual({
      ok: true,
      steamId64: '76561198000000002',
      rawPlayerName: '✓ ★ Jogador Dois'
    })
  })

  it('interpreta um nome real curto', () => {
    const fileName = `${demoBaseName}_✓ ☆ jog3_76561198000000003.wav`
    expect(parseCsgoveAudioFilename(fileName, demoBaseName)).toEqual({
      ok: true,
      steamId64: '76561198000000003',
      rawPlayerName: '✓ ☆ jog3'
    })
  })

  // Casos invalidos — priorizando o que realmente pode acontecer no
  // diretorio de saida, nao combinacoes artificiais.
  it('rejeita arquivo que nao termina em .wav (ex.: log de stdout)', () => {
    const result = parseCsgoveAudioFilename('stdout.log', demoBaseName)
    expect(result.ok).toBe(false)
  })

  it('rejeita arquivo que nao comeca com o nome da demo original', () => {
    const fileName = 'outra-demo_nome_76561198000000001.wav'
    const result = parseCsgoveAudioFilename(fileName, demoBaseName)
    expect(result.ok).toBe(false)
  })

  it('rejeita nome sem separador entre jogador e Steam ID64', () => {
    const fileName = `${demoBaseName}_123.wav`
    const result = parseCsgoveAudioFilename(fileName, demoBaseName)
    expect(result.ok).toBe(false)
  })

  it('rejeita Steam ID64 invalido (numero curto demais para ser um ID64 real)', () => {
    const fileName = `${demoBaseName}_nome_123.wav`
    const result = parseCsgoveAudioFilename(fileName, demoBaseName)
    expect(result.ok).toBe(false)
  })
})
