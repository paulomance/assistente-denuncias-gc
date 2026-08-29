import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { HistoryItem } from './HistoryItem'
import type { ReportHistoryEntry } from '../../../shared/types/History'

/**
 * Componente de teste real (React Testing Library + jsdom) — primeira
 * suite de componente deste projeto (ver vitest.config.ts). Cobre o
 * modal de confirmação de exclusão do Google Drive pedido explicitamente
 * pelo usuário: nunca excluir com um clique só, botão seguro em
 * destaque, erro nunca finge sucesso, estado correto depois de
 * confirmado.
 *
 * `window.gcReport` é mockado por completo (é injetado pelo preload
 * real do Electron, que não existe neste ambiente de teste) — cada
 * teste define só os métodos que realmente usa.
 */

function makeReport(overrides: Partial<ReportHistoryEntry> = {}): ReportHistoryEntry {
  return {
    reportId: 'report-1',
    folderPath: 'C:\\Users\\fake\\Documents\\Provas do Assistente de Denúncias GC\\report-1',
    createdAt: new Date().toISOString(),
    originalDemoFileName: 'fake.dem',
    matchId: '27701639',
    map: 'de_inferno',
    players: [{ steamId64: '76561198000000001', displayName: 'Fake Player' }],
    status: 'uploaded',
    hasLocalCopy: true,
    localSizeBytes: 1024,
    driveShareLink: 'https://drive.google.com/folder-1',
    driveFolderId: 'folder-1',
    ...overrides
  }
}

beforeEach(() => {
  vi.stubGlobal('open', vi.fn())
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  // @ts-expect-error -- limpo o mock global entre testes, tipo real só existe em runtime
  delete window.gcReport
})

describe('HistoryItem — confirmação antes de excluir do Google Drive', () => {
  it('não exclui com um clique só: clicar em "Excluir do Google Drive" abre o modal, não chama o backend ainda', () => {
    const deleteReportFromDrive = vi.fn()
    // @ts-expect-error -- mock parcial, só o que este teste usa
    window.gcReport = { deleteReportFromDrive }

    render(<HistoryItem report={makeReport()} onChanged={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /excluir do google drive/i }))

    expect(screen.getByRole('dialog', { name: /excluir prova do google drive/i })).toBeTruthy()
    expect(screen.getByText(/deve ser mantida disponível até que o formulário seja analisado/i)).toBeTruthy()
    expect(deleteReportFromDrive).not.toHaveBeenCalled()
  })

  it('"Manter prova no Google Drive" cancela sem chamar o backend e fecha o modal', () => {
    const deleteReportFromDrive = vi.fn()
    // @ts-expect-error -- mock parcial
    window.gcReport = { deleteReportFromDrive }

    render(<HistoryItem report={makeReport()} onChanged={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /excluir do google drive/i }))
    fireEvent.click(screen.getByRole('button', { name: /manter prova no google drive/i }))

    expect(deleteReportFromDrive).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('"Excluir prova permanentemente" chama o backend com o folderPath e driveFolderId corretos', async () => {
    const deleteReportFromDrive = vi.fn().mockResolvedValue({ status: 'success' })
    // @ts-expect-error -- mock parcial
    window.gcReport = { deleteReportFromDrive }
    const onChanged = vi.fn()

    render(<HistoryItem report={makeReport()} onChanged={onChanged} />)
    fireEvent.click(screen.getByRole('button', { name: /excluir do google drive/i }))
    fireEvent.click(screen.getByRole('button', { name: /excluir prova permanentemente/i }))

    await waitFor(() =>
      expect(deleteReportFromDrive).toHaveBeenCalledWith(
        'C:\\Users\\fake\\Documents\\Provas do Assistente de Denúncias GC\\report-1',
        'folder-1'
      )
    )
  })

  it('depois de confirmado com sucesso: fecha o modal, avisa "Prova excluída do Google Drive" e recarrega a lista (onChanged)', async () => {
    const deleteReportFromDrive = vi.fn().mockResolvedValue({ status: 'success' })
    // @ts-expect-error -- mock parcial
    window.gcReport = { deleteReportFromDrive }
    const onChanged = vi.fn()

    render(<HistoryItem report={makeReport()} onChanged={onChanged} />)
    fireEvent.click(screen.getByRole('button', { name: /excluir do google drive/i }))
    fireEvent.click(screen.getByRole('button', { name: /excluir prova permanentemente/i }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByText(/prova excluída do google drive/i)).toBeTruthy()
    expect(onChanged).toHaveBeenCalledTimes(1)
  })

  it('se a exclusão falhar, NUNCA finge sucesso: mantém o estado real, mostra o erro, não chama onChanged', async () => {
    const deleteReportFromDrive = vi.fn().mockResolvedValue({ status: 'error', errorKind: 'network-unavailable' })
    // @ts-expect-error -- mock parcial
    window.gcReport = { deleteReportFromDrive }
    const onChanged = vi.fn()

    render(<HistoryItem report={makeReport()} onChanged={onChanged} />)
    fireEvent.click(screen.getByRole('button', { name: /excluir do google drive/i }))
    fireEvent.click(screen.getByRole('button', { name: /excluir prova permanentemente/i }))

    await waitFor(() =>
      expect(screen.getByText(/não foi possível conectar à internet/i)).toBeTruthy()
    )
    expect(screen.queryByText(/prova excluída do google drive/i)).toBeNull()
    expect(onChanged).not.toHaveBeenCalled()
    // O botão "Excluir do Google Drive" continua disponível — a prova
    // real ainda está lá, o usuário pode tentar de novo.
    expect(screen.getByRole('button', { name: /excluir do google drive/i })).toBeTruthy()
  })

  it('uma exceção inesperada (rejeição da Promise) também nunca finge sucesso', async () => {
    const deleteReportFromDrive = vi.fn().mockRejectedValue(new Error('falha de rede'))
    // @ts-expect-error -- mock parcial
    window.gcReport = { deleteReportFromDrive }
    const onChanged = vi.fn()

    render(<HistoryItem report={makeReport()} onChanged={onChanged} />)
    fireEvent.click(screen.getByRole('button', { name: /excluir do google drive/i }))
    fireEvent.click(screen.getByRole('button', { name: /excluir prova permanentemente/i }))

    await waitFor(() => expect(screen.getByText(/não foi possível concluir o envio/i)).toBeTruthy())
    expect(onChanged).not.toHaveBeenCalled()
  })

  it('cancelar a exclusão do Drive deixa "Excluir do computador" disponível e funcional em seguida (ações independentes)', () => {
    const deleteReportFromDrive = vi.fn()
    const deleteLocalReportCopy = vi.fn()
    // @ts-expect-error -- mock parcial
    window.gcReport = { deleteReportFromDrive, deleteLocalReportCopy }

    render(<HistoryItem report={makeReport()} onChanged={vi.fn()} />)

    // Abre e cancela a exclusão do Drive.
    fireEvent.click(screen.getByRole('button', { name: /excluir do google drive/i }))
    fireEvent.click(screen.getByRole('button', { name: /manter prova no google drive/i }))

    // "Excluir do computador" continua disponível e abre seu próprio
    // fluxo de confirmação normalmente — nenhum dos dois estados
    // "vazou" pro outro.
    fireEvent.click(screen.getByRole('button', { name: /^excluir do computador$/i }))
    expect(screen.getByText(/isso remove todos os áudios desta prova/i)).toBeTruthy()
    expect(deleteReportFromDrive).not.toHaveBeenCalled()
  })
})
