import { useCallback, useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'
import { friendlyDriveErrorMessage } from '../utils/friendlyDriveErrorMessage'
import { buildGamersClubReportUrl } from '../utils/gamersClubReportUrl'
import type { UploadProgress } from '../../../shared/types/Drive'
import type { CloudStorageErrorKind } from '../../../shared/types/CloudStorage'

type DriveUiState =
  | { phase: 'checking' }
  | { phase: 'not-connected' }
  | { phase: 'connecting' }
  | { phase: 'connect-failed'; message: string }
  | { phase: 'ready' }
  | { phase: 'uploading'; progress: UploadProgress | null }
  | { phase: 'uploaded'; shareLink: string }
  // Confirmado (contra o Drive de verdade, nao só suposição) que a
  // pasta desta prova não existe mais — ver handleCopyLink/
  // handleOpenDriveFolder e driveLinkVerification.ts no processo main.
  | { phase: 'link-unavailable' }
  | { phase: 'upload-failed'; message: string; errorKind: CloudStorageErrorKind }
  | {
      phase: 'partial'
      completed: number
      total: number
      failedPlayers: { steamId64: string; displayName: string; kind: 'audio' | 'chat' }[]
      errorKind: CloudStorageErrorKind
    }

// "Tentar enviar novamente" sozinho nao resolve nada nesses 3 casos —
// o problema nao e o envio em si, e a sessao com o Google. Nesses
// casos a UI oferece "Reconectar" em vez de simplesmente repetir a
// mesma chamada que ja falhou (ver renderizacao de 'upload-failed').
const AUTH_RELATED_ERROR_KINDS: ReadonlySet<CloudStorageErrorKind> = new Set([
  'auth-expired',
  'not-signed-in',
  'permission-denied'
])

const UPLOAD_STAGE_LABEL: Record<UploadProgress['stage'], string> = {
  'creating-folder': 'Preparando pasta no Google Drive...',
  uploading: 'Enviando sua prova ao Google Drive...',
  finalizing: 'Finalizando...'
}

interface DriveUploadPanelProps {
  reportDir: string
  reportId: string
  matchId: string | null
  /**
   * Chamado exatamente uma vez, na primeira vez que o envio é
   * confirmado com sucesso (fase 'uploaded') — usado por
   * EvidenceOrganized.tsx pra só liberar "Fazer uma nova denúncia"
   * depois que a pasta da prova realmente existe no Google Drive
   * (nunca antes: risco real de o usuário abandonar/interromper uma
   * denúncia em andamento sem perceber, ver App.tsx).
   */
  onUploadedSuccessfully?: () => void
}

/**
 * Estados claramente separados — o usuario sempre sabe se a evidencia
 * so existe localmente ou se ja foi enviada de verdade (nunca uma
 * confirmacao de envio sem resposta real do Google, ver
 * GoogleDriveProvider.ts). Falha de envio NUNCA remove a copia local:
 * so o botao "Tentar novamente" aparece.
 *
 * O envio ao Drive e automatico assim que a fase "ready" e alcancada
 * (conta ja conectada, ou logo apos conectar com sucesso) — decisao do
 * usuario: "o upload para o Google Drive não deve ser uma etapa
 * opcional que o jogador precise descobrir". So dispara uma vez por
 * instancia do componente (guardado por `autoUploadTriggeredRef`), tanto
 * pra nao reenviar em loop quanto pra sobreviver ao duplo efeito do
 * React.StrictMode em desenvolvimento (que rodaria este efeito duas
 * vezes seguidas antes do primeiro setState comitar). Falhas de envio
 * continuam exigindo um clique manual em "Tentar novamente" — nunca um
 * retry automatico, que erraria muito para falhas nao-transitorias (ex.:
 * sem espaço no Drive).
 */
export function DriveUploadPanel({
  reportDir,
  reportId,
  matchId,
  onUploadedSuccessfully
}: DriveUploadPanelProps): React.JSX.Element {
  const [state, setState] = useState<DriveUiState>({ phase: 'checking' })
  const [linkCopied, setLinkCopied] = useState(false)
  // Trava os dois botões (copiar/abrir) enquanto confirma com o Drive
  // — evita clique duplo disparando duas verificações concorrentes.
  const [isVerifyingLink, setIsVerifyingLink] = useState(false)
  const autoUploadTriggeredRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    try {
      window.gcReport.getDriveAuthStatus().then((status) => {
        if (!cancelled) {
          setState({ phase: status === 'signed-in' ? 'ready' : 'not-connected' })
        }
      })
    } catch {
      setState({ phase: 'upload-failed', message: friendlyDriveErrorMessage('unexpected'), errorKind: 'unexpected' })
    }
    return () => {
      cancelled = true
    }
  }, [])

  const handleUpload = useCallback(async () => {
    setState({ phase: 'uploading', progress: null })
    // Progresso real por contagem de arquivo (nunca uma porcentagem
    // inventada — ver UploadProgress em shared/types/Drive.ts). O
    // `prev.phase === 'uploading'` no updater evita sobrescrever um
    // estado final (uploaded/upload-failed) com um evento de progresso
    // atrasado que ainda chegue depois do IPC principal ja ter
    // resolvido.
    const unsubscribe = window.gcReport.onDriveUploadProgress((progress) => {
      setState((prev) => (prev.phase === 'uploading' ? { phase: 'uploading', progress } : prev))
    })
    try {
      const result = await window.gcReport.uploadReportToDrive(reportDir, reportId)
      if (result.status === 'success') {
        setState({ phase: 'uploaded', shareLink: result.shareLink })
      } else if (result.status === 'partial') {
        setState({
          phase: 'partial',
          completed: result.completed,
          total: result.total,
          failedPlayers: result.failedPlayers,
          errorKind: result.errorKind
        })
      } else {
        setState({
          phase: 'upload-failed',
          message: friendlyDriveErrorMessage(result.errorKind),
          errorKind: result.errorKind
        })
      }
    } catch {
      setState({ phase: 'upload-failed', message: friendlyDriveErrorMessage('unexpected'), errorKind: 'unexpected' })
    } finally {
      unsubscribe()
    }
  }, [reportDir, reportId])

  // Avisa o componente pai assim que o envio é confirmado com sucesso —
  // nunca antes disso (nunca em 'partial', que ainda não tem link de
  // compartilhamento — ver GoogleDriveProvider.ts). `useEffect` (não
  // dentro do próprio `handleUpload`) cobre os dois caminhos possíveis
  // pra chegar em 'uploaded': o envio automático inicial e um clique
  // manual em "Tentar enviar de novo" depois de uma falha/parcial.
  useEffect(() => {
    if (state.phase === 'uploaded') {
      onUploadedSuccessfully?.()
    }
  }, [state.phase, onUploadedSuccessfully])

  useEffect(() => {
    if (state.phase === 'ready' && !autoUploadTriggeredRef.current) {
      autoUploadTriggeredRef.current = true
      void handleUpload()
    }
  }, [state.phase, handleUpload])

  const handleConnect = useCallback(async () => {
    setState({ phase: 'connecting' })
    try {
      const result = await window.gcReport.signInToDrive()
      if (result.status === 'success') {
        setState({ phase: 'ready' })
      } else {
        setState({ phase: 'connect-failed', message: friendlyDriveErrorMessage(result.errorKind) })
      }
    } catch {
      // O handler principal ja trata os proprios erros — isso e so pra
      // nunca deixar o usuario preso em "Continue no navegador..." sem
      // nenhuma acao possivel se algo inesperado acontecer.
      setState({ phase: 'connect-failed', message: friendlyDriveErrorMessage('unexpected') })
    }
  }, [])

  /**
   * Usado quando o envio falhou por causa da SESSAO com o Google (token
   * expirado/revogado, não conectado, permissão negada) — nesses casos
   * "Tentar novamente" sozinho falharia de novo com o mesmo erro, o
   * problema não é o envio em si. Reconecta e, se der certo, dispara o
   * upload diretamente (não pelo efeito ligado à fase 'ready' — esse já
   * foi consumido na primeira tentativa, guardado por
   * `autoUploadTriggeredRef`, e não dispararia de novo sozinho).
   */
  const handleReconnectAndRetry = useCallback(async () => {
    setState({ phase: 'connecting' })
    try {
      const result = await window.gcReport.signInToDrive()
      if (result.status === 'success') {
        void handleUpload()
      } else {
        setState({
          phase: 'upload-failed',
          message: friendlyDriveErrorMessage(result.errorKind),
          errorKind: result.errorKind
        })
      }
    } catch {
      setState({ phase: 'upload-failed', message: friendlyDriveErrorMessage('unexpected'), errorKind: 'unexpected' })
    }
  }, [handleUpload])

  /**
   * Confirma com o Drive de verdade que a pasta desta prova ainda
   * existe ANTES de copiar/abrir o link — nunca trata um link guardado
   * em memória como eternamente válido (bug real corrigido nesta
   * rodada: a pasta podia ter sido excluída em outra tela — ex.:
   * "Minhas provas" aberta por cima deste painel — sem este componente
   * nunca saber). `'check-failed'` (rede/sessão) segue tratando o link
   * como válido — nunca acusar exclusão sem confirmação real do
   * Google (ver driveLinkVerification.ts no processo main).
   */
  const verifyLinkStillValid = useCallback(async (): Promise<string | null> => {
    setIsVerifyingLink(true)
    try {
      const result = await window.gcReport.verifyDriveLink(reportDir)
      if (result.status === 'not-found') {
        setState({ phase: 'link-unavailable' })
        return null
      }
      if (result.status === 'exists') {
        return result.shareLink
      }
      // 'check-failed': usa o link que já tínhamos em memória — não
      // bloqueia o usuário por causa de uma falha ambígua de rede/sessão.
      return state.phase === 'uploaded' ? state.shareLink : null
    } catch {
      return state.phase === 'uploaded' ? state.shareLink : null
    } finally {
      setIsVerifyingLink(false)
    }
  }, [reportDir, state])

  const handleCopyLink = useCallback(async () => {
    const shareLink = await verifyLinkStillValid()
    if (!shareLink) return
    void navigator.clipboard.writeText(shareLink)
    setLinkCopied(true)
    setTimeout(() => setLinkCopied(false), 2000)
  }, [verifyLinkStillValid])

  const handleOpenDriveFolder = useCallback(async () => {
    const shareLink = await verifyLinkStillValid()
    if (!shareLink) return
    window.open(shareLink, '_blank', 'noreferrer')
  }, [verifyLinkStillValid])

  if (state.phase === 'checking') {
    return <p className="demo-summary__note">Verificando conexão com o Google Drive...</p>
  }

  if (state.phase === 'not-connected' || state.phase === 'connect-failed') {
    return (
      <div className="drive-panel">
        <p className="drive-panel__heading">
          Para concluir sua denúncia, precisamos salvar sua prova no Google Drive.
        </p>
        <p className="demo-summary__note">
          Conecte sua conta do Google para enviar esta prova automaticamente e gerar um link para
          anexar na denúncia.
        </p>
        {state.phase === 'connect-failed' && (
          <p className="drop-zone__error">
            <Icon name="alert" size={14} /> {state.message}
          </p>
        )}
        <button type="button" className="btn btn--primary" onClick={handleConnect}>
          <Icon name="drive" size={16} /> Conectar Google Drive
        </button>
      </div>
    )
  }

  if (state.phase === 'connecting' || state.phase === 'ready') {
    return (
      <div className="drive-panel">
        <div className="simple-spinner" aria-hidden="true" />
        <p className="demo-summary__note">
          {state.phase === 'connecting'
            ? 'Continue no navegador que abrimos para você fazer login com sua conta do Google.'
            : 'Conectado! Preparando o envio ao Google Drive...'}
        </p>
      </div>
    )
  }

  if (state.phase === 'uploading') {
    const progress = state.progress
    const stageLabel = progress ? UPLOAD_STAGE_LABEL[progress.stage] : UPLOAD_STAGE_LABEL['creating-folder']
    const showFileCount = progress && progress.stage === 'uploading' && progress.total > 0
    const percent =
      progress && progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : null

    return (
      <div className="drive-panel">
        <div className="simple-spinner" aria-hidden="true" />
        <p className="demo-summary__note">{stageLabel}</p>
        {showFileCount && (
          <>
            <div
              className="processing__bar-track upload-progress__bar"
              role="progressbar"
              aria-valuenow={percent ?? 0}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div className="processing__bar-fill" style={{ width: `${percent}%` }} />
            </div>
            <p className="upload-progress__count">
              {progress.completed} de {progress.total} arquivo{progress.total === 1 ? '' : 's'}{' '}
              enviado{progress.completed === 1 ? '' : 's'}
            </p>
          </>
        )}
      </div>
    )
  }

  if (state.phase === 'uploaded') {
    return (
      <div className="drive-panel">
        <p className="demo-summary__status demo-summary__status--ready">
          <Icon name="check" size={15} /> Prova enviada ao Google Drive
        </p>

        <div className="drive-link-box">
          <p className="drive-link-box__label">Link da sua prova</p>
          <p className="drive-link-box__value" title={state.shareLink}>
            {state.shareLink}
          </p>
          <div className="drive-link-box__actions">
            <button
              type="button"
              className={linkCopied ? 'btn btn--success drive-link-box__copy' : 'btn btn--primary drive-link-box__copy'}
              onClick={handleCopyLink}
              disabled={isVerifyingLink}
            >
              <Icon name={linkCopied ? 'check' : 'copy'} size={15} />{' '}
              {linkCopied ? 'Link copiado!' : isVerifyingLink ? 'Verificando...' : 'Copiar link da prova'}
            </button>
            <button type="button" className="btn btn--link" onClick={handleOpenDriveFolder} disabled={isVerifyingLink}>
              <Icon name="folder" size={13} /> Abrir pasta no Google Drive
            </button>
          </div>
        </div>

        <div className="report-cta">
          <p className="report-cta__title">Próximo passo: enviar sua denúncia pelo formulário oficial da Gamers Club</p>

          <div className="report-cta__step">
            <span className="report-cta__step-number">1</span>
            <div className="report-cta__step-body">
              <p className="report-cta__step-title">Continue para o formulário de denúncia</p>
              <a
                href={buildGamersClubReportUrl(matchId)}
                target="_blank"
                rel="noreferrer"
                className="btn btn--primary"
              >
                <Icon name="external" size={16} /> Continuar para o formulário de denúncia
              </a>
              {!matchId && (
                <p className="report-cta__step-note">
                  Não conseguimos identificar automaticamente a partida — o formulário abrirá na
                  página geral de denúncias da Gamers Club.
                </p>
              )}
            </div>
          </div>

          <div className="report-cta__step">
            <span className="report-cta__step-number">2</span>
            <div className="report-cta__step-body">
              <p className="report-cta__step-title">
                Cole o link acima no campo <strong>"Link da prova"</strong> do formulário
              </p>
              <div className="form-field-mockup" aria-hidden="true">
                <p className="form-field-mockup__label">Link da prova</p>
                <p className="form-field-mockup__input">{state.shareLink}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (state.phase === 'link-unavailable') {
    return (
      <div className="drive-panel">
        <p className="drop-zone__error">
          <Icon name="alert" size={14} /> A pasta desta prova foi excluída do Google Drive. O link
          não está mais disponível.
        </p>
        <button type="button" className="btn btn--primary" onClick={handleUpload}>
          <Icon name="send" size={16} /> Enviar ao Google Drive de novo
        </button>
      </div>
    )
  }

  if (state.phase === 'partial') {
    // Falha parcial: parte dos arquivos foi confirmada pelo Google e
    // continua na pasta do Drive (nunca descartada) — so falta reenviar
    // quem ficou de fora. "Tentar enviar de novo" chama o mesmo
    // handleUpload, que no backend reaproveita o checkpoint gravado e
    // so reenvia os arquivos que faltam (ver driveHandlers.ts). Quando
    // a causa raiz é a SESSÃO com o Google (achado real: antes essa
    // classificação era descartada por arquivo, sempre virava um
    // "partial" genérico), oferece reconectar em vez de só repetir a
    // mesma chamada que falharia de novo. "Minhas provas", logo abaixo
    // deste painel (EvidenceOrganized.tsx), já cobre "continuar depois"
    // — o progresso fica salvo e pode ser retomado a qualquer momento.
    const isAuthIssue = AUTH_RELATED_ERROR_KINDS.has(state.errorKind)
    return (
      <div className="drive-panel">
        <p className="drop-zone__error">
          <Icon name="alert" size={14} /> Algumas provas não foram enviadas — {state.completed} de{' '}
          {state.total} arquivo{state.total === 1 ? '' : 's'} foi{state.completed === 1 ? '' : 'ram'}{' '}
          enviado{state.completed === 1 ? '' : 's'} com sucesso.
        </p>
        <ul className="drive-panel__failed-list">
          {state.failedPlayers.map((player) => (
            <li key={`${player.steamId64}-${player.kind}`}>
              Não foi possível enviar: {player.displayName} —{' '}
              {player.kind === 'chat' ? 'texto' : 'áudio'}
            </li>
          ))}
        </ul>
        {isAuthIssue ? (
          <button type="button" className="btn btn--primary" onClick={handleReconnectAndRetry}>
            <Icon name="drive" size={16} /> Reconectar Google Drive
          </button>
        ) : (
          <button type="button" className="btn btn--primary" onClick={handleUpload}>
            <Icon name="send" size={16} /> Tentar enviar de novo
          </button>
        )}
      </div>
    )
  }

  // state.phase === 'upload-failed'
  {
    const isAuthIssue = AUTH_RELATED_ERROR_KINDS.has(state.errorKind)
    return (
      <div className="drive-panel">
        <p className="drop-zone__error">
          <Icon name="alert" size={14} /> {state.message}
        </p>
        {isAuthIssue ? (
          <button type="button" className="btn btn--primary" onClick={handleReconnectAndRetry}>
            <Icon name="drive" size={16} /> Reconectar Google Drive
          </button>
        ) : (
          <button type="button" className="btn btn--primary" onClick={handleUpload}>
            <Icon name="send" size={16} /> Tentar enviar de novo
          </button>
        )}
      </div>
    )
  }
}
