import { useCallback, useEffect, useMemo, useState } from 'react'
import { HistoryItem } from './HistoryItem'
import { ModalOverlay } from './ModalOverlay'
import type { ReportHistoryEntry } from '../../../shared/types/History'

interface HistoryOverlayProps {
  onClose: () => void
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Historico local-first: le os metadata.json existentes na pasta
 * gerenciada (ver localReportsStore.ts) — sem indice/banco separado.
 * "Excluir copias ja enviadas" so afeta denuncias com status
 * 'uploaded' — nunca a unica copia existente de algo.
 */
export function HistoryOverlay({ onClose }: HistoryOverlayProps): React.JSX.Element {
  const [reports, setReports] = useState<ReportHistoryEntry[] | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [isBulkDeleting, setIsBulkDeleting] = useState(false)
  const [confirmingBulkDelete, setConfirmingBulkDelete] = useState(false)

  const reload = useCallback(async () => {
    try {
      const list = await window.gcReport.listReportHistory()
      setReports(list)
      setLoadFailed(false)
    } catch {
      // Nunca deixa a tela presa em "Carregando..." pra sempre — mostra
      // um estado de erro explícito, nunca confundido com "sem provas".
      setLoadFailed(true)
    }
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  const safeToDeleteLocally = useMemo(
    () => (reports ?? []).filter((r) => r.hasLocalCopy && r.status === 'uploaded'),
    [reports]
  )
  const totalLocalSizeBytes = useMemo(
    () => (reports ?? []).reduce((sum, r) => sum + (r.hasLocalCopy ? r.localSizeBytes : 0), 0),
    [reports]
  )
  const reclaimableBytes = useMemo(
    () => safeToDeleteLocally.reduce((sum, r) => sum + r.localSizeBytes, 0),
    [safeToDeleteLocally]
  )

  const handleBulkDelete = useCallback(async () => {
    setIsBulkDeleting(true)
    try {
      for (const report of safeToDeleteLocally) {
        await window.gcReport.deleteLocalReportCopy(report.folderPath)
      }
    } catch {
      // Se uma exclusao no meio da lista falhar de forma inesperada, o
      // reload() abaixo ainda mostra exatamente o que foi excluido ate
      // ali — nunca deixa o botao preso em "excluindo" pra sempre.
    } finally {
      setIsBulkDeleting(false)
      setConfirmingBulkDelete(false)
      await reload()
    }
  }, [safeToDeleteLocally, reload])

  return (
    <ModalOverlay title="Minhas provas" onClose={onClose} panelClassName="history-overlay__panel">
      {reports === null && !loadFailed && <p className="demo-summary__note">Carregando...</p>}

      {loadFailed && (
        <p className="drop-zone__error">Não foi possível carregar o histórico. Tente novamente.</p>
      )}

      {reports !== null && reports.length === 0 && (
        <p className="demo-summary__note">
          Você ainda não preparou nenhuma prova. Elas aparecem aqui assim que você preparar a
          primeira denúncia.
        </p>
      )}

      {reports !== null && reports.length > 0 && (
        <>
          <p className="settings-overlay__section-note history-overlay__summary">
            {reports.length} prova{reports.length === 1 ? '' : 's'} · {formatSize(totalLocalSizeBytes)}{' '}
            neste computador
          </p>

          {safeToDeleteLocally.length > 0 && !confirmingBulkDelete && (
            <button
              type="button"
              className="btn btn--link demo-summary__link-button"
              onClick={() => setConfirmingBulkDelete(true)}
            >
              Excluir do computador as já enviadas (libera {formatSize(reclaimableBytes)})
            </button>
          )}
          {confirmingBulkDelete && (
            <div className="history-item__confirm">
              <p className="settings-overlay__section-note">
                Excluir do computador {safeToDeleteLocally.length} prova
                {safeToDeleteLocally.length === 1 ? '' : 's'} já enviada
                {safeToDeleteLocally.length === 1 ? '' : 's'} ao Google Drive? As cópias na nuvem
                não serão afetadas.
              </p>
              <div className="settings-overlay__confirm-actions">
                <button
                  type="button"
                  className="btn btn--secondary"
                  onClick={() => setConfirmingBulkDelete(false)}
                  disabled={isBulkDeleting}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className={isBulkDeleting ? 'btn btn--danger btn--loading' : 'btn btn--danger'}
                  onClick={handleBulkDelete}
                  disabled={isBulkDeleting}
                >
                  Excluir do computador
                </button>
              </div>
            </div>
          )}

          <ul className="history-list">
            {reports.map((report) => (
              <HistoryItem key={report.folderPath} report={report} onChanged={reload} />
            ))}
          </ul>
        </>
      )}
    </ModalOverlay>
  )
}
