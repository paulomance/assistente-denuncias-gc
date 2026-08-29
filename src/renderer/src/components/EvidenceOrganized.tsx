import { useCallback, useState } from 'react'
import { DriveUploadPanel } from './DriveUploadPanel'
import { Icon } from './Icon'
import { buildGamersClubMatchUrl } from '../utils/gamersClubMatchUrl'

interface EvidenceOrganizedProps {
  reportId: string
  reportDir: string
  // Não renderizado nesta tela (rodada de limpeza visual: a frase "Guardamos
  // o áudio de <nomes>..." foi removida por ser redundante com o status
  // "Prova preparada" acima) — mantido na prop/UiState de propósito, ver
  // o mesmo comentário em App.tsx sobre por que esse estado é compartilhado
  // com a recuperação de trabalho pendente (PendingReportBanner.tsx).
  audioFiles: { displayName: string }[]
  matchId: string | null
  map: string | null
  onReset: () => void
  onOpenHistory: () => void
}

export function EvidenceOrganized({
  reportId,
  reportDir,
  matchId,
  map,
  onReset,
  onOpenHistory
}: EvidenceOrganizedProps): React.JSX.Element {
  const matchUrl = buildGamersClubMatchUrl(matchId)
  // "Fazer uma nova denúncia" só aparece depois que o envio ao Google
  // Drive é confirmado com sucesso (ver DriveUploadPanel.tsx,
  // onUploadedSuccessfully) — nunca antes, pra nunca deixar o usuário
  // abandonar/interromper sem perceber uma denúncia ainda incompleta
  // (processando, aguardando seleção de jogadores, upload em
  // andamento/parcial/falho). Este componente só é alcançado com uma
  // denúncia recém-organizada ou pendente de upload (nunca uma já
  // enviada — ver selectPendingRecoveryReport.ts), então este estado
  // sempre começa `false` de verdade, nunca precisa ser inicializado
  // como `true` a partir de alguma prop.
  const [hasUploadedSuccessfully, setHasUploadedSuccessfully] = useState(false)
  const handleUploadedSuccessfully = useCallback(() => setHasUploadedSuccessfully(true), [])

  const handleOpenFolder = useCallback(() => {
    void window.gcReport.openEvidenceFolder(reportDir)
  }, [reportDir])

  return (
    <div className="demo-summary demo-summary--final">
      <p className="demo-summary__status demo-summary__status--ready">
        <Icon name="check" size={15} /> Prova preparada
      </p>

      {(matchId || map) && (
        <p className="match-badge">
          {matchId &&
            (matchUrl ? (
              <a
                href={matchUrl}
                target="_blank"
                rel="noreferrer"
                className="history-item__match-link"
                title="Abrir a página da partida na Gamers Club"
              >
                Partida #{matchId}
                <Icon name="external" size={10} />
              </a>
            ) : (
              <span>Partida #{matchId}</span>
            ))}
          {matchId && map && <span className="match-badge__sep">·</span>}
          {map && <span>{map}</span>}
        </p>
      )}

      <button type="button" className="btn btn--link demo-summary__link-button" onClick={handleOpenFolder}>
        <Icon name="folder" size={13} /> Abrir pasta
      </button>

      <div className="drive-panel__wrapper">
        <DriveUploadPanel
          reportId={reportId}
          reportDir={reportDir}
          matchId={matchId}
          onUploadedSuccessfully={handleUploadedSuccessfully}
        />
      </div>

      <div className="demo-summary__actions">
        {hasUploadedSuccessfully ? (
          <button type="button" className="btn btn--secondary" onClick={onReset}>
            Fazer uma nova denúncia
          </button>
        ) : (
          <p className="demo-summary__new-report-hint">
            Depois que o envio ao Google Drive for concluído, você poderá iniciar uma nova
            denúncia.
          </p>
        )}
        <button type="button" className="btn btn--link" onClick={onOpenHistory}>
          <Icon name="history" size={13} /> Minhas provas
        </button>
      </div>
    </div>
  )
}
