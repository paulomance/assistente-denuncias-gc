import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { UpdateNotification } from './UpdateNotification'
import type { UpdateStatus } from '../../../shared/types/Update'

/**
 * Bug real corrigido nesta rodada: o app disparava uma checagem de
 * atualização sozinho ao abrir (`checkForUpdates()` dentro do
 * `useEffect` de montagem deste componente) e, quando não havia nada
 * de novo, o status ficava preso em `{status: 'checking'}` pra sempre —
 * "Verificando atualizações..." nunca saía da tela. A correção elimina
 * a checagem automática por completo: este componente agora só
 * ESCUTA o status (`onUpdateStatus`) e nunca chama `checkForUpdates()`
 * sozinho — a única forma de disparar uma checagem é o clique manual
 * (botão "Verificar atualizações" em Configurações, ou "Tentar
 * novamente" aqui mesmo, depois de um erro). Estes testes garantem
 * isso na ponta do componente que de fato tinha o bug.
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

describe('UpdateNotification — nunca verifica sozinho ao abrir o app', () => {
  it('montar o componente NUNCA chama checkForUpdates e nunca mostra "Verificando atualizações..."', async () => {
    const { checkForUpdates } = mockGcReport()
    render(<UpdateNotification />)

    // Espera a checagem async de isUpdateCheckingAvailable() resolver
    // (é assim que o componente decide se deve se inscrever nos
    // eventos), sem que isso dispare nenhuma checagem sozinho.
    await waitFor(() => expect(window.gcReport.isUpdateCheckingAvailable).toHaveBeenCalled())

    expect(checkForUpdates).not.toHaveBeenCalled()
    expect(screen.queryByText(/verificando atualizações/i)).toBeNull()
  })

  it('mesmo esperando bastante tempo depois de montar, nenhuma checagem é disparada sozinha (sem polling)', async () => {
    vi.useFakeTimers()
    const { checkForUpdates } = mockGcReport()
    render(<UpdateNotification />)

    await act(async () => {
      await vi.runOnlyPendingTimersAsync()
    })
    await act(async () => {
      vi.advanceTimersByTime(5 * 60 * 1000) // 5 minutos
    })

    expect(checkForUpdates).not.toHaveBeenCalled()
  })

  it('quando isUpdateCheckingAvailable é false, não renderiza nada mesmo se um status chegasse', async () => {
    mockGcReport({ isUpdateCheckingAvailable: false })
    render(<UpdateNotification />)

    await waitFor(() => expect(window.gcReport.isUpdateCheckingAvailable).toHaveBeenCalled())
    // onUpdateStatus nunca é assinado quando a checagem não está disponível.
    expect(window.gcReport.onUpdateStatus).not.toHaveBeenCalled()
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

  it('"Tentar novamente" no erro chama checkForUpdates EXATAMENTE uma vez por clique, nunca em loop', async () => {
    const { checkForUpdates } = mockGcReport()
    render(<UpdateNotification />)
    await waitFor(() => expect(window.gcReport.onUpdateStatus).toHaveBeenCalled())

    emitStatus({ status: 'error', phase: 'check', message: 'sem internet' })
    expect(screen.getByText(/não foi possível verificar se existe uma atualização/i)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /tentar novamente/i }))
    expect(checkForUpdates).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: /tentar novamente/i }))
    expect(checkForUpdates).toHaveBeenCalledTimes(2)
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
