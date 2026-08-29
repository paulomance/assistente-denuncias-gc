import { useCallback, useState } from 'react'
import { Icon } from './Icon'
import type { ReportHistoryEntry } from '../../../shared/types/History'

type BannerAction = 'idle' | 'confirm-discard' | 'discarding'

interface PendingReportBannerProps {
  report: ReportHistoryEntry
  onResume: () => void
  onDiscarded: () => void
}

function driveStepLabel(status: ReportHistoryEntry['status']): string {
  if (status === 'uploading') return 'Envio para o Google Drive foi interrompido'
  if (status === 'upload-failed') return 'Envio para o Google Drive não foi concluído'
  return 'Envio para o Google Drive ainda não foi feito'
}

/**
 * Mostrado ao reabrir o app quando existe uma denúncia com áudio já
 * organizado localmente, mas ainda não confirmada no Google Drive (ver
 * selectPendingRecoveryReport.ts). "Áudios extraídos" e "Arquivos
 * organizados" aparecem sempre concluídos porque só chegam a virar uma
 * entrada no histórico DEPOIS que o EvidenceOrganizer já terminou — a
 * única etapa que pode estar mesmo pendente é o envio ao Drive.
 * "Continuar de onde parei" reaproveita a MESMA tela final
 * (EvidenceOrganized -> DriveUploadPanel) que qualquer denúncia recém-
 * concluída usa, cujo auto-upload agora retoma via checkpoint em vez de
 * recriar a pasta do zero (ver GoogleDriveProvider.ts) — nenhum arquivo
 * já confirmado é reenviado.
 */
export function PendingReportBanner({
  report,
  onResume,
  onDiscarded
}: PendingReportBannerProps): React.JSX.Element {
  const [action, setAction] = useState<BannerAction>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const handleDiscard = useCallback(async () => {
    setAction('discarding')
    setErrorMessage(null)
    try {
      const result = await window.gcReport.deleteLocalReportCopy(report.folderPath)
      if (result.status === 'success') {
        onDiscarded()
      } else {
        setErrorMessage('Não foi possível descartar esta denúncia. Tente novamente.')
        setAction('idle')
      }
    } catch {
      setErrorMessage('Não foi possível descartar esta denúncia. Tente novamente.')
      setAction('idle')
    }
  }, [report.folderPath, onDiscarded])

  const names = report.players.map((player) => player.displayName.trim()).join(', ') || '(sem jogadores)'

  return (
    <div className="pending-recovery" role="status">
      <p className="pending-recovery__title">
        <Icon name="alert" size={15} /> Você tem uma denúncia pendente
      </p>
      <p className="pending-recovery__desc">
        {report.matchId
          ? `A preparação da denúncia da Partida #${report.matchId} não foi concluída.`
          : `A preparação de uma denúncia anterior (${names}) não foi concluída.`}
      </p>

      <ul className="processing__steps">
        <li className="processing__step processing__step--done">
          <span className="processing__step-icon">
            <Icon name="check" size={16} />
          </span>
          Áudios extraídos
        </li>
        <li className="processing__step processing__step--done">
          <span className="processing__step-icon">
            <Icon name="check" size={16} />
          </span>
          Arquivos organizados
        </li>
        <li className="processing__step processing__step--current">
          <span className="processing__step-icon">
            <span className="processing__step-dot" />
          </span>
          {driveStepLabel(report.status)}
        </li>
      </ul>

      {errorMessage && (
        <p className="drop-zone__error">
          <Icon name="alert" size={14} /> {errorMessage}
        </p>
      )}

      {action === 'confirm-discard' || action === 'discarding' ? (
        <div className="pending-recovery__confirm">
          <p className="settings-overlay__section-title">
            <Icon name="alert" size={14} /> Descartar esta denúncia?
          </p>
          <p className="settings-overlay__section-note">
            Isso apaga definitivamente os áudios e os dados já preparados desta denúncia neste
            computador — não é só fechar esta tela, a denúncia deixa de existir e não pode ser
            recuperada depois.
          </p>
          <div className="settings-overlay__confirm-actions">
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => setAction('idle')}
              disabled={action === 'discarding'}
            >
              Cancelar
            </button>
            <button
              type="button"
              className={action === 'discarding' ? 'btn btn--danger btn--loading' : 'btn btn--danger'}
              onClick={handleDiscard}
              disabled={action === 'discarding'}
            >
              Descartar denúncia
            </button>
          </div>
        </div>
      ) : (
        <div className="pending-recovery__actions">
          <button type="button" className="btn btn--primary" onClick={onResume}>
            Continuar de onde parei
          </button>
          <button type="button" className="btn btn--link" onClick={() => setAction('confirm-discard')}>
            Descartar denúncia
          </button>
        </div>
      )}
    </div>
  )
}
