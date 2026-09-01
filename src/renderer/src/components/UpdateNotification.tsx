import { useCallback, useEffect, useState } from 'react'
import { Icon } from './Icon'
import type { UpdateStatus } from '../../../shared/types/Update'

function formatMb(bytes: number | null): string | null {
  if (bytes === null || bytes <= 0) return null
  return `${(bytes / (1024 * 1024)).toFixed(0)} MB`
}

/**
 * Notificacao de atualizacao — nunca bloqueia o uso do app (sem
 * backdrop, sem `role="dialog"` modal; so um cartao flutuante no canto
 * que o usuario pode ignorar). So monta alguma UI se
 * `isUpdateCheckingAvailable()` for `true` (ver
 * main/services/updateChecker.ts — depende do canal de release ser
 * `production`; em dev/teste este componente nunca aparece e nunca faz
 * nenhuma chamada de rede). "Agora nao" so descarta o cartao ate o app
 * ser reaberto (nunca decide por conta propria adiar uma atualizacao ja
 * baixada).
 */
export function UpdateNotification(): React.JSX.Element | null {
  const [enabled, setEnabled] = useState(false)
  const [status, setStatus] = useState<UpdateStatus>({ status: 'idle' })
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    let cancelled = false
    try {
      window.gcReport
        .isUpdateCheckingAvailable()
        .then((available) => {
          if (cancelled) return
          setEnabled(available)
          if (available) {
            void window.gcReport.checkForUpdates()
          }
        })
        .catch(() => {})
    } catch {
      // window.gcReport indisponivel (nao deveria acontecer no Electron
      // real) — sem atualizacao automatica, nao critico.
    }
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!enabled) return undefined
    let unsubscribe: (() => void) | undefined
    try {
      unsubscribe = window.gcReport.onUpdateStatus((next) => {
        setStatus(next)
        // Uma nova verificacao (ex.: apos "Tentar novamente") deve
        // voltar a mostrar o cartao mesmo se uma tentativa anterior
        // tinha sido dispensada. `not-available` so chega ate aqui
        // quando o usuario pediu a checagem de verdade (ver
        // updateChecker.ts), entao tambem merece aparecer.
        if (
          next.status === 'available' ||
          next.status === 'downloading' ||
          next.status === 'ready' ||
          next.status === 'not-available'
        ) {
          setDismissed(false)
        }
      })
    } catch {
      // segue sem eventos de atualizacao — nao critico.
    }
    return () => unsubscribe?.()
  }, [enabled])

  // "Nenhuma atualizacao encontrada" e so uma confirmacao, nao exige
  // acao do usuario — some sozinha depois de alguns segundos em vez de
  // ficar ocupando o canto da tela esperando um clique em "Ok".
  useEffect(() => {
    if (status.status !== 'not-available') return undefined
    const timer = setTimeout(() => setDismissed(true), 4000)
    return () => clearTimeout(timer)
  }, [status])

  const handleDownload = useCallback(() => {
    void window.gcReport.downloadUpdate()
  }, [])

  const handleRestart = useCallback(() => {
    void window.gcReport.quitAndInstallUpdate()
  }, [])

  const handleRetry = useCallback(() => {
    void window.gcReport.checkForUpdates(true)
  }, [])

  if (!enabled || dismissed) return null
  if (status.status === 'idle' || status.status === 'disabled') {
    return null
  }

  if (status.status === 'not-available') {
    return (
      <div className="update-toast update-toast--quiet" role="status">
        <Icon name="check" size={13} /> Você já está usando a versão mais recente.
      </div>
    )
  }

  if (status.status === 'checking') {
    // Discreto de proposito — nao compete com o conteudo da tela.
    return (
      <div className="update-toast update-toast--quiet" role="status">
        <span className="update-toast__quiet-spinner" aria-hidden="true" />
        Verificando atualizações...
      </div>
    )
  }

  if (status.status === 'available') {
    const sizeLabel = formatMb(status.sizeBytes)
    return (
      <div className="update-toast" role="status">
        <p className="update-toast__title">
          <Icon name="download" size={15} /> Nova versão disponível
        </p>
        <p className="update-toast__desc">
          Uma nova versão do Assistente de Denúncias GC está disponível
          {sizeLabel ? ` (${sizeLabel})` : ''}.
        </p>
        {status.releaseNotes && (
          <div className="update-toast__notes">
            <p className="update-toast__notes-title">O que há de novo</p>
            <p className="update-toast__notes-text">{status.releaseNotes}</p>
          </div>
        )}
        <div className="update-toast__actions">
          <button type="button" className="btn btn--primary" onClick={handleDownload}>
            Atualizar agora
          </button>
          <button type="button" className="btn btn--link" onClick={() => setDismissed(true)}>
            Agora não
          </button>
        </div>
      </div>
    )
  }

  if (status.status === 'downloading') {
    return (
      <div className="update-toast" role="status">
        <p className="update-toast__title">Baixando atualização...</p>
        <div
          className="processing__bar-track update-toast__bar"
          role="progressbar"
          aria-valuenow={status.percent}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="processing__bar-fill" style={{ width: `${status.percent}%` }} />
        </div>
        <p className="update-toast__percent">{status.percent}%</p>
      </div>
    )
  }

  if (status.status === 'ready') {
    return (
      <div className="update-toast" role="status">
        <p className="update-toast__title">
          <Icon name="check" size={15} /> Atualização pronta
        </p>
        <p className="update-toast__desc">
          A versão {status.version} está pronta para instalar. O aplicativo vai reiniciar.
        </p>
        <div className="update-toast__actions">
          <button type="button" className="btn btn--primary" onClick={handleRestart}>
            Reiniciar e atualizar
          </button>
        </div>
      </div>
    )
  }

  // status.status === 'error'
  const errorMessage =
    status.phase === 'download'
      ? 'Não foi possível baixar a atualização.'
      : 'Não foi possível verificar se existe uma atualização.'
  return (
    <div className="update-toast" role="status">
      <p className="drop-zone__error">
        <Icon name="alert" size={14} /> {errorMessage}
      </p>
      <div className="update-toast__actions">
        <button type="button" className="btn btn--secondary" onClick={handleRetry}>
          Tentar novamente
        </button>
        <button type="button" className="btn btn--link" onClick={() => setDismissed(true)}>
          Agora não
        </button>
      </div>
    </div>
  )
}
