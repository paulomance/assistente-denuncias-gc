import { describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach } from 'vitest'
import { EvidenceOrganized } from './EvidenceOrganized'

/**
 * Bug real de risco de UX corrigido nesta rodada: "Fazer uma nova
 * denúncia" aparecia mesmo com o envio ao Google Drive ainda incompleto
 * (em andamento, parcial, falho) — risco real do usuário abandonar sem
 * perceber uma denúncia que ainda não tinha uma prova publicada de
 * verdade. `DriveUploadPanel` é mockado aqui de propósito: o que este
 * arquivo testa é a REGRA DE GATING em EvidenceOrganized (quando o botão
 * aparece), não o fluxo de upload em si (já coberto por outros testes).
 */

let capturedOnUploadedSuccessfully: (() => void) | undefined

vi.mock('./DriveUploadPanel', () => ({
  DriveUploadPanel: (props: { onUploadedSuccessfully?: () => void }) => {
    capturedOnUploadedSuccessfully = props.onUploadedSuccessfully
    return <div data-testid="drive-upload-panel-stub" />
  }
}))

afterEach(() => {
  cleanup()
  capturedOnUploadedSuccessfully = undefined
})

function renderComponent(): void {
  render(
    <EvidenceOrganized
      reportId="report-1"
      reportDir="C:\\fake\\report-1"
      audioFiles={[{ displayName: 'Fake Player' }]}
      matchId="27701639"
      map="de_inferno"
      onReset={vi.fn()}
      onOpenHistory={vi.fn()}
    />
  )
}

describe('EvidenceOrganized — "Fazer uma nova denúncia" só depois do upload confirmado', () => {
  it('NÃO mostra o botão enquanto o envio ainda não foi confirmado com sucesso', () => {
    renderComponent()
    expect(screen.queryByRole('button', { name: /fazer uma nova denúncia/i })).toBeNull()
    expect(screen.getByText(/depois que o envio ao google drive for concluído/i)).toBeTruthy()
  })

  it('mostra o botão assim que DriveUploadPanel confirma o upload (onUploadedSuccessfully)', () => {
    renderComponent()
    expect(screen.queryByRole('button', { name: /fazer uma nova denúncia/i })).toBeNull()

    act(() => capturedOnUploadedSuccessfully?.())

    expect(screen.getByRole('button', { name: /fazer uma nova denúncia/i })).toBeTruthy()
    expect(screen.queryByText(/depois que o envio ao google drive for concluído/i)).toBeNull()
  })

  it('clicar em "Fazer uma nova denúncia" (depois de liberado) chama onReset', () => {
    const onReset = vi.fn()
    render(
      <EvidenceOrganized
        reportId="report-1"
        reportDir="C:\\fake\\report-1"
        audioFiles={[{ displayName: 'Fake Player' }]}
        matchId="27701639"
        map="de_inferno"
        onReset={onReset}
        onOpenHistory={vi.fn()}
      />
    )
    act(() => capturedOnUploadedSuccessfully?.())
    screen.getByRole('button', { name: /fazer uma nova denúncia/i }).click()
    expect(onReset).toHaveBeenCalledTimes(1)
  })

  it('"Minhas provas" continua disponível mesmo com o upload ainda incompleto (navegação não é destrutiva)', () => {
    renderComponent()
    expect(screen.getByRole('button', { name: /minhas provas/i })).toBeTruthy()
  })
})
