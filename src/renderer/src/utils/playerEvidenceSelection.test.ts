import { describe, expect, it } from 'vitest'
import {
  countIncluded,
  getChoice,
  includesAudio,
  includesChat,
  isIncluded,
  setChoice,
  withChatIncluded
} from './playerEvidenceSelection'
import type { PlayerEvidenceChoiceMap } from './playerEvidenceSelection'

/**
 * Terceira versão do modelo de seleção (ver comentário de topo em
 * playerEvidenceSelection.ts pro histórico completo). Esta suíte cobre a
 * garantia central: `EvidenceChoice` é um ÚNICO campo por jogador —
 * 'none' | 'chat' | 'audio' | 'both' — nunca dois booleanos que possam
 * divergir. Escolher qualquer coisa diferente de 'none' já é suficiente
 * pra incluir o jogador; não existe estado "incluído mas sem nada
 * marcado".
 */
describe('playerEvidenceSelection', () => {
  it('getChoice retorna "none" pra um jogador nunca tocado', () => {
    const map: PlayerEvidenceChoiceMap = {}
    expect(getChoice(map, '1')).toBe('none')
  })

  describe('includesAudio / includesChat — predicados derivados da escolha única', () => {
    it('none: nem áudio nem texto', () => {
      expect(includesAudio('none')).toBe(false)
      expect(includesChat('none')).toBe(false)
    })

    it('audio: só áudio', () => {
      expect(includesAudio('audio')).toBe(true)
      expect(includesChat('audio')).toBe(false)
    })

    it('chat: só texto', () => {
      expect(includesAudio('chat')).toBe(false)
      expect(includesChat('chat')).toBe(true)
    })

    it('both: os dois', () => {
      expect(includesAudio('both')).toBe(true)
      expect(includesChat('both')).toBe(true)
    })
  })

  describe('isIncluded — derivado, nunca guardado à parte', () => {
    it('false só quando a escolha é "none"', () => {
      expect(isIncluded('none')).toBe(false)
      expect(isIncluded('audio')).toBe(true)
      expect(isIncluded('chat')).toBe(true)
      expect(isIncluded('both')).toBe(true)
    })
  })

  describe('setChoice', () => {
    it('grava a escolha exata pro jogador, sem afetar outros', () => {
      let map: PlayerEvidenceChoiceMap = {}
      map = setChoice(map, '1', 'audio')
      map = setChoice(map, '2', 'chat')
      expect(getChoice(map, '1')).toBe('audio')
      expect(getChoice(map, '2')).toBe('chat')
    })

    it('sobrescreve a escolha anterior do mesmo jogador (nunca soma/mescla)', () => {
      let map: PlayerEvidenceChoiceMap = {}
      map = setChoice(map, '1', 'both')
      map = setChoice(map, '1', 'chat')
      expect(getChoice(map, '1')).toBe('chat')
    })
  })

  describe('withChatIncluded — atalho do modal "Ver texto", escreve na MESMA escolha (nunca um estado paralelo)', () => {
    it('marcar chat (true) a partir de "none" vira "chat"', () => {
      expect(withChatIncluded('none', true)).toBe('chat')
    })

    it('marcar chat (true) a partir de "audio" vira "both" — preserva o áudio já escolhido', () => {
      expect(withChatIncluded('audio', true)).toBe('both')
    })

    it('desmarcar chat (false) a partir de "both" vira "audio" — preserva o áudio, nunca reseta pra "none"', () => {
      expect(withChatIncluded('both', false)).toBe('audio')
    })

    it('desmarcar chat (false) a partir de "chat" (sem áudio) vira "none"', () => {
      expect(withChatIncluded('chat', false)).toBe('none')
    })
  })

  describe('countIncluded — soma jogadores com qualquer escolha diferente de "none"', () => {
    it('conta 0 quando nenhum jogador tem evidência marcada', () => {
      expect(countIncluded({})).toBe(0)
    })

    it('conta jogadores marcados só por texto (sem áudio)', () => {
      const map = setChoice({}, 'chat-only', 'chat')
      expect(countIncluded(map)).toBe(1)
    })

    it('múltiplos jogadores com combinações diferentes: cada um mantém sua própria escolha', () => {
      let map: PlayerEvidenceChoiceMap = {}
      map = setChoice(map, 'a', 'audio')
      map = setChoice(map, 'b', 'chat')
      map = setChoice(map, 'c', 'both')
      // 'd' nunca tocado — permanece 'none', nunca conta

      expect(countIncluded(map)).toBe(3)
      expect(getChoice(map, 'a')).toBe('audio')
      expect(getChoice(map, 'b')).toBe('chat')
      expect(getChoice(map, 'c')).toBe('both')
      expect(getChoice(map, 'd')).toBe('none')
      expect(isIncluded(getChoice(map, 'd'))).toBe(false)
    })
  })
})
