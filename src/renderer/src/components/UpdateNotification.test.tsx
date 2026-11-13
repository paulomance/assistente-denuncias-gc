import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { UpdateNotification } from './UpdateNotification'
import type { UpdateStatus } from '../../../shared/types/Update'

/**
 * Histórico real (não reintroduzir nenhum dos dois bugs já
 * encontrados): uma versão anterior disparava `checkForUpdates()`
 * sozinha ao montar, SEM distinguir automática de manual — qualquer
 * falha de fundo ficava presa em `{status: 'checking'}` pra sempre
 * ("Verificando atualizações..." nunca saía da tela). Depois disso foi
 * removida a checagem automática por completo — só o clique manual
 * disparava uma checagem.
 *
 * Essa segunda versão criou um problema real de distribuição: com
 * ~300 instalações existentes e uma correção crítica pra publicar
 * (CSGOVE quebrado pelo CS2 em 11/11), ninguém seria avisado sozinho.
 * Por isso a checagem automática foi reintroduzida — mas a garantia de
 * "nunca fica presa/nunca mostra erro de fundo" agora vive no processo
 * principal (ver updateChecker.ts e seus testes): o `sender` só recebe
 * `'checking'`/`'not-available'`/`'error'` quando a checagem foi
 * manual. Este componente nunca sabe (nem precisa saber) se a
 * checagem foi automática ou manual — só renderiza com segurança
 * qualquer status que chegar, confiando que o processo principal já
 * filtrou o que não deveria aparecer. Os testes abaixo garantem: (1) o
 * mount dispara a checagem automática de verdade (resolve o problema
 * de distribuição), e (2) ela nunca dispara de novo sozinha depois
 * (sem polling/loop).
 */

let capturedStatusCallback: ((status: UpdateStatus) => void) | undefined

function mockGcReport(overrides: { isUpdateCheckingAvailable?: boolean } = {}): {
  checkForUpdates: ReturnType<typeof vi.fn>
} {
  const checkForUpdates = vi.fn(() => Promise.resolve())
  capturedStatusCallback = undefined
  // @ts-expect-error -- mock parcial, só o que UpdateNotification usa
  window.gcReport = {
    isUpdateCheckingAvailable: vi.fn(() => Promise.resolve(overrides.isUpdateCheckingAvailable ?? true)),
    checkForUpdates,
    downloadUpdate: vi.fn(() => Promise.resolve()),
    quitAndInstallUpdate: vi.fn(() => Promise.resolve()),
    onUpdateStatus: vi.fn((callback: (status: UpdateStatus) => void) => {
      capturedStatusCallback = callback
      return () => {
        capturedStatusCallback = undefined
      }
    })
  }
  return { checkForUpdates }
}

function emitStatus(status: UpdateStatus): void {
  act(() => {
    capturedStatusCallback?.(status)
  })
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  // @ts-expect-error -- limpo o mock global entre testes
  delete window.gcReport
  capturedStatusCallback = undefined
})

describe('UpdateNotification — dispara a checagem automática UMA vez, nunca em loop', () => {
  it('montar o componente dispara checkForUpdates() automaticamente (manual=false), e nada aparece enquanto não chega nenhum status', async () => {
    const { checkForUpdates } = mockGcReport()
    render(<UpdateNotification />)

    await waitFor(() => expect(checkForUpdates).toHaveBeenCalledTimes(1))
    expect(checkForUpdates).toHaveBeenCalledWith()
    // Simula uma checagem automática que falhou/não encontrou nada: o
    // processo principal (ver updateChecker.ts) nunca envia status
    // nesse caso, então nada deveria aparecer aqui.
    expect(screen.queryByText(/verificando atualizações/i)).toBeNull()
  })

  it('mesmo esperando bastante tempo depois de montar, a checagem automática NUNCA dispara de novo sozinha (sem polling)', async () => {
    vi.useFakeTimers()
    const { checkForUpdates } = mockGcReport()
    render(<UpdateNotification />)

    await act(async () => {
      await vi.runOnlyPendingTimersAsync()
    })
    await act(async () => {
      vi.advanceTimersByTime(5 * 60 * 1000) // 5 minutos
    })

    expect(checkForUpdates).toHaveBeenCalledTimes(1)
  })

  it('quando isUpdateCheckingAvailable é false, não dispara checagem nenhuma nem se inscreve nos eventos', async () => {
    const { checkForUpdates } = mockGcReport({ isUpdateCheckingAvailable: false })
    render(<UpdateNotification />)

    await waitFor(() => expect(window.gcReport.isUpdateCheckingAvailable).toHaveBeenCalled())
    expect(checkForUpdates).not.toHaveBeenCalled()
    // onUpdateStatus nunca é assinado quando a checagem não está disponível.
    expect(window.gcReport.onUpdateStatus).not.toHaveBeenCalled()
  })

  it('uma atualização real encontrada pela checagem automática aparece normalmente', async () => {
    mockGcReport()
    render(<UpdateNotification />)
    await waitFor(() => expect(window.gcReport.onUpdateStatus).toHaveBeenCalled())

    emitStatus({ status: 'available', version: '9.9.9', releaseNotes: null, sizeBytes: null })

    expect(screen.getByText(/nova versão disponível/i)).toBeTruthy()
  })
})

describe('UpdateNotification — reage ao status real sem nunca ficar presa', () => {
  it('"checking" mostra o indicador discreto, e um evento terminal sempre o substitui (nunca fica preso)', async () => {
    mockGcReport()
    render(<UpdateNotification />)
    await waitFor(() => expect(window.gcReport.onUpdateStatus).toHaveBeenCalled())

    emitStatus({ status: 'checking' })
    expect(screen.getByText(/verificando atualizações/i)).toBeTruthy()

    emitStatus({ status: 'not-available' })
    expect(screen.queryByText(/verificando atualizações/i)).toBeNull()
    expect(screen.getByText(/já está usando a versão mais recente/i)).toBeTruthy()
  })

  it('"Tentar novamente" no erro chama checkForUpdates(true) (manual) EXATAMENTE uma vez por clique, nunca em loop', async () => {
    const { checkForUpdates } = mockGcReport()
    render(<UpdateNotification />)
    // O mount já disparou 1 checagem automática (manual=false) — as
    // assinaturas abaixo olham só pra chamada MAIS RECENTE, pra não se
    // confundir com essa primeira.
    await waitFor(() => expect(checkForUpdates).toHaveBeenCalledTimes(1))

    emitStatus({ status: 'error', phase: 'check', message: 'sem internet' })
    expect(screen.getByText(/não foi possível verificar se existe uma atualização/i)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /tentar novamente/i }))
    expect(checkForUpdates).toHaveBeenCalledTimes(2)
    expect(checkForUpdates).toHaveBeenNthCalledWith(2, true)

    fireEvent.click(screen.getByRole('button', { name: /tentar novamente/i }))
    expect(checkForUpdates).toHaveBeenCalledTimes(3)
    expect(checkForUpdates).toHaveBeenNthCalledWith(3, true)
  })

  it('erro de download mostra mensagem diferente do erro de checagem', async () => {
    mockGcReport()
    render(<UpdateNotification />)
    await waitFor(() => expect(window.gcReport.onUpdateStatus).toHaveBeenCalled())

    emitStatus({ status: 'error', phase: 'download', message: 'falhou' })
    expect(screen.getByText(/não foi possível baixar a atualização/i)).toBeTruthy()
    expect(screen.queryByText(/não foi possível verificar se existe uma atualização/i)).toBeNull()
  })
})
