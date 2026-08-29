import { describe, expect, it } from 'vitest'
import { sanitizeFileNameSegment } from './sanitizeFileNameSegment'

describe('sanitizeFileNameSegment', () => {
  it('mantem simbolos unicode decorativos reais (nao sao invalidos no Windows)', () => {
    expect(sanitizeFileNameSegment('✓ ★ Nome do Jogador')).toBe('✓ ★ Nome do Jogador')
  })

  it('remove caracteres invalidos em nomes de arquivo no Windows', () => {
    expect(sanitizeFileNameSegment('nome<>:"/\\|?*teste')).toBe('nometeste')
  })

  it('usa um nome padrao se o resultado ficar vazio', () => {
    expect(sanitizeFileNameSegment('***')).toBe('jogador')
  })

  it('colapsa espacos multiplos', () => {
    expect(sanitizeFileNameSegment('nome    com    espacos')).toBe('nome com espacos')
  })
})
