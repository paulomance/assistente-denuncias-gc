import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { PlayerSelectionList } from './PlayerSelectionList'
import type { ExtractedVoice } from '../../../shared/types/Csgove'

/**
 * Cobre três coisas:
 *
 * 1) Ícones de evidência só aparecem quando a evidência REALMENTE
 *    existe (nunca um ícone desabilitado pra algo inexistente — pedido
 *    explícito do usuário nesta rodada).
 *
 * 2) Bug real corrigido (5ª tentativa — ver comentário de topo em
 *    PlayerSelectionList.tsx pro histórico completo): clicar no ícone
 *    de evidência NUNCA inclui nada, só abre um modal (AudioPlayerModal
 *    ou ChatViewerModal) — a inclusão só acontece pelo checkbox
 *    explícito DENTRO do modal. Isso é estruturalmente garantido: abrir
 *    o modal e "incluir" são dois `useState` diferentes, acionados por
 *    elementos de UI diferentes.
 *
 * 3) O ícone funciona como indicador — preenchido quando a evidência
 *    está incluída, sem precisar reabrir o modal pra saber.
 *
 * `window.gcReport` é mockado só nos poucos testes que realmente tocam
 * áudio (abrir o player/apertar play) — os demais nem chegam perto.
 */

afterEach(() => {
  // cleanup() ANTES de unstubAllGlobals(): desmontar PlayerSelectionList
  // roda o efeito que revoga as Blob URLs (ver PlayerSelectionList.tsx),
  // que só existe de verdade quando URL.revokeObjectURL ainda está
  // stubado (ver o teste que aciona o play de verdade, abaixo).
  cleanup()
  vi.unstubAllGlobals()
  // @ts-expect-error -- limpo o mock global entre testes, tipo real só existe em runtime
  delete window.gcReport
})

const audioOnlyPlayer: ExtractedVoice = {
  steamId64: '76561198000000001',
  rawPlayerName: 'Só Áudio',
  audioPath: 'C:\\fake\\audio.wav',
  side: null,
  teamName: null
}

const chatOnlyPlayer: ExtractedVoice = {
  steamId64: '76561198000000002',
  rawPlayerName: 'Só Texto',
  side: null,
  teamName: null,
  chatMessages: [
    { text: 'primeira mensagem', teamOnly: false },
    { text: 'segunda mensagem', teamOnly: true },
    { text: 'terceira mensagem', teamOnly: false }
  ]
}

const bothPlayer: ExtractedVoice = {
  steamId64: '76561198000000003',
  rawPlayerName: 'Áudio e Texto',
  audioPath: 'C:\\fake\\audio2.wav',
  side: null,
  teamName: null,
  chatMessages: [{ text: 'oi', teamOnly: false }]
}

function audioIcon(playerName: string): HTMLButtonElement {
  return screen.getByRole('button', { name: new RegExp(`^Áudio de ${playerName}`, 'i') }) as HTMLButtonElement
}

function chatIcon(playerName: string): HTMLButtonElement {
  return screen.getByRole('button', { name: new RegExp(`^Texto de ${playerName}`, 'i') }) as HTMLButtonElement
}

function queryAudioIcon(playerName: string): HTMLButtonElement | null {
  return screen.queryByRole('button', { name: new RegExp(`^Áudio de ${playerName}`, 'i') }) as HTMLButtonElement | null
}

function queryChatIcon(playerName: string): HTMLButtonElement | null {
  return screen.queryByRole('button', { name: new RegExp(`^Texto de ${playerName}`, 'i') }) as HTMLButtonElement | null
}

function includeAudioCheckbox(): HTMLInputElement {
  return screen.getByRole('checkbox', { name: /incluir áudio na denúncia/i }) as HTMLInputElement
}

function includeChatCheckbox(): HTMLInputElement {
  return screen.getByRole('checkbox', { name: /incluir este texto na denúncia/i }) as HTMLInputElement
}

describe('PlayerSelectionList — ícone de evidência só aparece quando ela existe', () => {
  it('jogador só-com-áudio: ícone de áudio aparece, ícone de texto NÃO aparece', () => {
    render(<PlayerSelectionList players={[audioOnlyPlayer]} onConfirm={vi.fn()} onReset={vi.fn()} />)
    expect(queryAudioIcon('Só Áudio')).not.toBeNull()
    expect(queryChatIcon('Só Áudio')).toBeNull()
  })

  it('jogador só-com-texto: ícone de texto aparece, ícone de áudio NÃO aparece', () => {
    render(<PlayerSelectionList players={[chatOnlyPlayer]} onConfirm={vi.fn()} onReset={vi.fn()} />)
    expect(queryChatIcon('Só Texto')).not.toBeNull()
    expect(queryAudioIcon('Só Texto')).toBeNull()
  })

  it('jogador com os dois: os dois ícones aparecem', () => {
    render(<PlayerSelectionList players={[bothPlayer]} onConfirm={vi.fn()} onReset={vi.fn()} />)
    expect(queryAudioIcon('Áudio e Texto')).not.toBeNull()
    expect(queryChatIcon('Áudio e Texto')).not.toBeNull()
  })
})

describe('PlayerSelectionList — clicar no ícone NUNCA inclui, só abre o modal', () => {
  it('clicar no ícone de texto abre o modal, mas NÃO marca a inclusão', () => {
    render(<PlayerSelectionList players={[chatOnlyPlayer]} onConfirm={vi.fn()} onReset={vi.fn()} />)
    fireEvent.click(chatIcon('Só Texto'))

    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(includeChatCheckbox().checked).toBe(false)
    // O ícone continua não-preenchido — só abrir não inclui.
    expect(chatIcon('Só Texto').className).not.toContain('--included')
  })

  it('clicar no ícone de áudio abre o modal, mas NÃO marca a inclusão', () => {
    const readAudioFile = vi.fn()
    // @ts-expect-error -- mock parcial, só o que este teste usa
    window.gcReport = { readAudioFile }
    render(<PlayerSelectionList players={[audioOnlyPlayer]} onConfirm={vi.fn()} onReset={vi.fn()} />)
    fireEvent.click(audioIcon('Só Áudio'))

    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(includeAudioCheckbox().checked).toBe(false)
    expect(audioIcon('Só Áudio').className).not.toContain('--included')
    expect(readAudioFile).not.toHaveBeenCalled()
  })

  it('apertar Play dentro do modal de áudio NÃO marca a inclusão (ouvir != incluir)', async () => {
    // jsdom não implementa createObjectURL/revokeObjectURL — precisa de
    // stub explícito só neste teste, que é o único que realmente aciona
    // o play (os demais nem chegam a tocar áudio de verdade).
    vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(() => 'blob:fake'), revokeObjectURL: vi.fn() })
    // @ts-expect-error -- mock parcial, só o que este teste usa
    window.gcReport = {
      readAudioFile: vi.fn().mockResolvedValue({ status: 'success', data: new Uint8Array([1, 2, 3]) })
    }
    render(<PlayerSelectionList players={[audioOnlyPlayer]} onConfirm={vi.fn()} onReset={vi.fn()} />)
    fireEvent.click(audioIcon('Só Áudio'))

    fireEvent.click(screen.getByRole('button', { name: /ouvir áudio/i }))
    await screen.findByRole('button', { name: /pausar/i })

    expect(includeAudioCheckbox().checked).toBe(false)
  })
})

describe('PlayerSelectionList — checkbox dentro do modal marca a inclusão e reflete no ícone', () => {
  it('marcar "incluir áudio" no modal preenche o ícone 🎙 no card', () => {
    // @ts-expect-error -- mock parcial, só o que este teste usa
    window.gcReport = { readAudioFile: vi.fn() }
    render(<PlayerSelectionList players={[audioOnlyPlayer]} onConfirm={vi.fn()} onReset={vi.fn()} />)

    fireEvent.click(audioIcon('Só Áudio'))
    fireEvent.click(includeAudioCheckbox())
    fireEvent.click(screen.getByRole('button', { name: /concluído/i }))

    expect(audioIcon('Só Áudio').className).toContain('--included')
  })

  it('marcar "incluir texto" no modal preenche o ícone 💬 no card', () => {
    render(<PlayerSelectionList players={[chatOnlyPlayer]} onConfirm={vi.fn()} onReset={vi.fn()} />)

    fireEvent.click(chatIcon('Só Texto'))
    fireEvent.click(includeChatCheckbox())
    fireEvent.click(screen.getByRole('button', { name: /concluído/i }))

    expect(chatIcon('Só Texto').className).toContain('--included')
  })

  it('marcar os dois de um jogador com áudio+texto preenche os dois ícones, cada um de forma independente', () => {
    // @ts-expect-error -- mock parcial, só o que este teste usa
    window.gcReport = { readAudioFile: vi.fn() }
    render(<PlayerSelectionList players={[bothPlayer]} onConfirm={vi.fn()} onReset={vi.fn()} />)

    fireEvent.click(audioIcon('Áudio e Texto'))
    fireEvent.click(includeAudioCheckbox())
    fireEvent.click(screen.getByRole('button', { name: /concluído/i }))

    fireEvent.click(chatIcon('Áudio e Texto'))
    fireEvent.click(includeChatCheckbox())
    fireEvent.click(screen.getByRole('button', { name: /concluído/i }))

    expect(audioIcon('Áudio e Texto').className).toContain('--included')
    expect(chatIcon('Áudio e Texto').className).toContain('--included')
  })

  it('a decisão sobrevive fechar e reabrir o modal', () => {
    render(<PlayerSelectionList players={[chatOnlyPlayer]} onConfirm={vi.fn()} onReset={vi.fn()} />)

    fireEvent.click(chatIcon('Só Texto'))
    fireEvent.click(includeChatCheckbox())
    fireEvent.click(screen.getByRole('button', { name: /concluído/i }))

    fireEvent.click(chatIcon('Só Texto'))
    expect(includeChatCheckbox().checked).toBe(true)
  })
})

describe('PlayerSelectionList — bug real corrigido: áudio e texto continuam evidências independentes', () => {
  it('1) marcar SOMENTE o texto de um jogador com áudio disponível NÃO inclui o áudio', () => {
    const onConfirm = vi.fn()
    render(<PlayerSelectionList players={[bothPlayer]} onConfirm={onConfirm} onReset={vi.fn()} />)

    fireEvent.click(chatIcon('Áudio e Texto'))
    fireEvent.click(includeChatCheckbox())
    fireEvent.click(screen.getByRole('button', { name: /concluído/i }))

    fireEvent.click(screen.getByRole('button', { name: /continuar com 1 jogador selecionado/i }))
    const confirmed = onConfirm.mock.calls[0][0] as ExtractedVoice[]
    expect(confirmed[0].includeAudioInReport).toBe(false)
    expect(confirmed[0].includeChatInReport).toBe(true)
  })

  it('2) marcar SOMENTE o áudio de um jogador com texto disponível NÃO inclui o texto', () => {
    // @ts-expect-error -- mock parcial, só o que este teste usa
    window.gcReport = { readAudioFile: vi.fn() }
    const onConfirm = vi.fn()
    render(<PlayerSelectionList players={[bothPlayer]} onConfirm={onConfirm} onReset={vi.fn()} />)

    fireEvent.click(audioIcon('Áudio e Texto'))
    fireEvent.click(includeAudioCheckbox())
    fireEvent.click(screen.getByRole('button', { name: /concluído/i }))

    fireEvent.click(screen.getByRole('button', { name: /continuar com 1 jogador selecionado/i }))
    const confirmed = onConfirm.mock.calls[0][0] as ExtractedVoice[]
    expect(confirmed[0].includeAudioInReport).toBe(true)
    expect(confirmed[0].includeChatInReport).toBe(false)
  })

  it('3) marcar os dois do mesmo jogador gera os dois', () => {
    // @ts-expect-error -- mock parcial, só o que este teste usa
    window.gcReport = { readAudioFile: vi.fn() }
    const onConfirm = vi.fn()
    render(<PlayerSelectionList players={[bothPlayer]} onConfirm={onConfirm} onReset={vi.fn()} />)

    fireEvent.click(audioIcon('Áudio e Texto'))
    fireEvent.click(includeAudioCheckbox())
    fireEvent.click(screen.getByRole('button', { name: /concluído/i }))
    fireEvent.click(chatIcon('Áudio e Texto'))
    fireEvent.click(includeChatCheckbox())
    fireEvent.click(screen.getByRole('button', { name: /concluído/i }))

    fireEvent.click(screen.getByRole('button', { name: /continuar com 1 jogador selecionado/i }))
    const confirmed = onConfirm.mock.calls[0][0] as ExtractedVoice[]
    expect(confirmed[0].includeAudioInReport).toBe(true)
    expect(confirmed[0].includeChatInReport).toBe(true)
  })

  it('4) jogador com os dois disponíveis, mas nada marcado, não aparece em onConfirm nem habilita "Continuar"', () => {
    render(<PlayerSelectionList players={[bothPlayer]} onConfirm={vi.fn()} onReset={vi.fn()} />)

    const confirmButton = screen.getByRole('button', {
      name: /selecione ao menos uma evidência/i
    }) as HTMLButtonElement
    expect(confirmButton.disabled).toBe(true)
  })

  it('desmarcar o áudio depois de marcar os dois remove só o áudio, preserva o texto', () => {
    // @ts-expect-error -- mock parcial, só o que este teste usa
    window.gcReport = { readAudioFile: vi.fn() }
    const onConfirm = vi.fn()
    render(<PlayerSelectionList players={[bothPlayer]} onConfirm={onConfirm} onReset={vi.fn()} />)

    fireEvent.click(audioIcon('Áudio e Texto'))
    fireEvent.click(includeAudioCheckbox())
    fireEvent.click(screen.getByRole('button', { name: /concluído/i }))
    fireEvent.click(chatIcon('Áudio e Texto'))
    fireEvent.click(includeChatCheckbox())
    fireEvent.click(screen.getByRole('button', { name: /concluído/i }))

    // Reabre o áudio e desmarca.
    fireEvent.click(audioIcon('Áudio e Texto'))
    fireEvent.click(includeAudioCheckbox())
    fireEvent.click(screen.getByRole('button', { name: /concluído/i }))

    fireEvent.click(screen.getByRole('button', { name: /continuar com 1 jogador selecionado/i }))
    const confirmed = onConfirm.mock.calls[0][0] as ExtractedVoice[]
    expect(confirmed[0].includeAudioInReport).toBe(false)
    expect(confirmed[0].includeChatInReport).toBe(true)
  })
})

describe('PlayerSelectionList — 5) múltiplos jogadores com combinações diferentes de evidências', () => {
  it('cada jogador chega em onConfirm com a combinação exata que foi marcada pra ele', () => {
    // @ts-expect-error -- mock parcial, só o que este teste usa
    window.gcReport = { readAudioFile: vi.fn() }
    const onConfirm = vi.fn()
    const players = [audioOnlyPlayer, chatOnlyPlayer, bothPlayer]
    render(<PlayerSelectionList players={players} onConfirm={onConfirm} onReset={vi.fn()} />)

    fireEvent.click(audioIcon('Só Áudio'))
    fireEvent.click(includeAudioCheckbox())
    fireEvent.click(screen.getByRole('button', { name: /concluído/i }))

    fireEvent.click(chatIcon('Só Texto'))
    fireEvent.click(includeChatCheckbox())
    fireEvent.click(screen.getByRole('button', { name: /concluído/i }))

    fireEvent.click(audioIcon('Áudio e Texto'))
    fireEvent.click(includeAudioCheckbox())
    fireEvent.click(screen.getByRole('button', { name: /concluído/i }))
    fireEvent.click(chatIcon('Áudio e Texto'))
    fireEvent.click(includeChatCheckbox())
    fireEvent.click(screen.getByRole('button', { name: /concluído/i }))

    fireEvent.click(screen.getByRole('button', { name: /continuar com 3 jogadores selecionados/i }))

    const confirmed = onConfirm.mock.calls[0][0] as ExtractedVoice[]
    expect(confirmed).toHaveLength(3)

    const audio = confirmed.find((p) => p.steamId64 === audioOnlyPlayer.steamId64)
    const chat = confirmed.find((p) => p.steamId64 === chatOnlyPlayer.steamId64)
    const both = confirmed.find((p) => p.steamId64 === bothPlayer.steamId64)

    expect(audio?.includeAudioInReport).toBe(true)
    expect(audio?.includeChatInReport).toBe(false)

    expect(chat?.includeAudioInReport).toBe(false)
    expect(chat?.includeChatInReport).toBe(true)

    expect(both?.includeAudioInReport).toBe(true)
    expect(both?.includeChatInReport).toBe(true)
  })
})

describe('PlayerSelectionList — 10) fluxo antigo (denúncia só por áudio) continua funcionando exatamente como antes', () => {
  it('marcar "incluir áudio" de um jogador sem texto gera includeAudioInReport true, includeChatInReport false', () => {
    // @ts-expect-error -- mock parcial, só o que este teste usa
    window.gcReport = { readAudioFile: vi.fn() }
    const onConfirm = vi.fn()
    render(<PlayerSelectionList players={[audioOnlyPlayer]} onConfirm={onConfirm} onReset={vi.fn()} />)

    fireEvent.click(audioIcon('Só Áudio'))
    fireEvent.click(includeAudioCheckbox())
    fireEvent.click(screen.getByRole('button', { name: /concluído/i }))
    fireEvent.click(screen.getByRole('button', { name: /continuar com 1 jogador selecionado/i }))

    const confirmed = onConfirm.mock.calls[0][0] as ExtractedVoice[]
    expect(confirmed).toHaveLength(1)
    expect(confirmed[0].steamId64).toBe(audioOnlyPlayer.steamId64)
    expect(confirmed[0].includeAudioInReport).toBe(true)
    expect(confirmed[0].includeChatInReport).toBe(false)
  })
})

describe('PlayerSelectionList — modal de texto: mensagens na ordem, rótulos corretos', () => {
  it('mostra as mensagens NA ORDEM recebida, com o rótulo geral/equipe certo em cada uma', () => {
    render(<PlayerSelectionList players={[chatOnlyPlayer]} onConfirm={vi.fn()} onReset={vi.fn()} />)
    fireEvent.click(chatIcon('Só Texto'))

    const dialog = screen.getByRole('dialog')
    const text = dialog.textContent ?? ''
    const posFirst = text.indexOf('primeira mensagem')
    const posSecond = text.indexOf('segunda mensagem')
    const posThird = text.indexOf('terceira mensagem')
    expect(posFirst).toBeGreaterThanOrEqual(0)
    expect(posSecond).toBeGreaterThan(posFirst)
    expect(posThird).toBeGreaterThan(posSecond)

    expect(screen.getAllByText('Geral', { selector: '.chat-viewer__badge--all' }).length).toBeGreaterThan(0)
    expect(screen.getAllByText('Equipe', { selector: '.chat-viewer__badge--team' }).length).toBeGreaterThan(0)
  })
})
