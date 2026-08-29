import { useCallback, useEffect, useState } from 'react'
import { Header } from './components/Header'
import { Icon } from './components/Icon'
import { SettingsOverlay } from './components/SettingsOverlay'
import { HistoryOverlay } from './components/HistoryOverlay'
import { DemoDropZone } from './components/DemoDropZone'
import { DemoSummary } from './components/DemoSummary'
import { ConfirmStorageLocation } from './components/ConfirmStorageLocation'
import { ProcessingIndicator } from './components/ProcessingIndicator'
import { SimpleLoadingIndicator } from './components/SimpleLoadingIndicator'
import { PlayerSelectionList } from './components/PlayerSelectionList'
import { NoAudioFoundNotice } from './components/NoAudioFoundNotice'
import { EvidenceOrganized } from './components/EvidenceOrganized'
import { PendingReportBanner } from './components/PendingReportBanner'
import { OnboardingOverlay } from './components/OnboardingOverlay'
import { UpdateNotification } from './components/UpdateNotification'
import { selectPendingRecoveryReport } from './utils/selectPendingRecoveryReport'
import { applyFontScale } from './utils/fontScale'
import type { DemoValidationResult } from '../../shared/types/DemoInput'
import type { CsgoveProgressStage, ExtractedVoice } from '../../shared/types/Csgove'
import type { EvidenceStorageInfo } from '../../shared/types/Settings'
import type { ReportHistoryEntry } from '../../shared/types/History'

/**
 * Estados do fluxo principal ate a B5. Upload (B6) sera adicionado como
 * extensao desta uniao discriminada quando existir — ver
 * docs/plano-frente-b.md. O painel de configuracoes (isSettingsOpen) e
 * deliberadamente um estado a parte, nao um status do fluxo — pode abrir
 * por cima de qualquer tela sem perder o progresso em andamento.
 */
type UiState =
  | { status: 'idle' }
  | { status: 'validating' }
  | { status: 'invalid'; error: string }
  | { status: 'ready'; fileName: string; fileSizeBytes: number; localPath: string }
  | {
      status: 'confirm-storage'
      fileName: string
      fileSizeBytes: number
      localPath: string
      storageInfo: EvidenceStorageInfo
    }
  | { status: 'processing'; stage: CsgoveProgressStage; fileSizeBytes: number; localPath: string }
  | { status: 'processing-error'; message: string }
  | { status: 'players-found'; players: ExtractedVoice[]; localPath: string; outputDir: string }
  | { status: 'organizing' }
  | { status: 'organizing-error' }
  | {
      status: 'evidence-organized'
      reportId: string
      reportDir: string
      // So o nome de exibicao e usado por EvidenceOrganized.tsx — tipo
      // deliberadamente mais enxuto que OrganizedEvidenceAudio pra este
      // estado tambem poder ser alcancado a partir de um
      // ReportHistoryEntry (recuperacao de trabalho pendente ao reabrir
      // o app, ver PendingReportBanner.tsx), que so tem
      // steamId64+displayName, sem o audioPath original do CSGOVE.
      audioFiles: { displayName: string }[]
      matchId: string | null
      map: string | null
    }

function friendlyProcessingErrorMessage(
  status: 'csgove-not-found' | 'csgove-failed' | 'unexpected-error' | 'already-processing'
): string {
  if (status === 'csgove-not-found') {
    return 'Faltou um componente necessário para preparar sua denúncia. Tente reinstalar o aplicativo ou entre em contato com o suporte.'
  }
  if (status === 'already-processing') {
    // Nao deveria ser alcancavel pela UI normal (o botao some assim que
    // clicado), mas o main process protege mesmo assim contra dois
    // processamentos ao mesmo tempo — ver csgoveHandlers.ts.
    return 'Já existe uma demo sendo processada. Aguarde terminar antes de tentar de novo.'
  }
  // 'csgove-failed' e 'unexpected-error' recebem a mesma mensagem — do
  // ponto de vista do usuario sao indistinguiveis. O detalhe tecnico
  // (exit code, stack) fica so nos logs, nunca na UI.
  return 'Não conseguimos processar esta demo. Verifique se o arquivo não está corrompido e tente novamente.'
}

function App(): React.JSX.Element {
  const [state, setState] = useState<UiState>({ status: 'idle' })
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [settingsStorageInfo, setSettingsStorageInfo] = useState<EvidenceStorageInfo | null>(null)
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)
  const [isElevated, setIsElevated] = useState(false)
  const [elevationWarningDismissed, setElevationWarningDismissed] = useState(false)
  const [pendingRecoveryReport, setPendingRecoveryReport] = useState<ReportHistoryEntry | null>(null)
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false)

  // Detecta trabalho interrompido (app fechado/travou no meio do envio
  // ao Drive) uma unica vez, ao abrir o app — nunca reprocessa a demo
  // nem reorganiza nada, so le o metadata.json ja existente de cada
  // denuncia local (mesmo dado que a tela "Minhas provas" ja usa). Ver
  // selectPendingRecoveryReport.ts para a regra de qual denuncia conta
  // como pendente.
  useEffect(() => {
    let cancelled = false
    try {
      // `window.gcReport` ausente lanca uma excecao SINCRONA (nao uma
      // Promise rejeitada) — sem este try/catch em volta da propria
      // chamada, um `.catch()` no final da cadeia nunca chegaria a ser
      // anexado, e a excecao derrubaria a arvore de componentes inteira
      // (mesmo bug de mount-time ja corrigido pro aviso de elevacao,
      // reproduzido aqui de verdade neste ambiente de preview sem
      // Electron real — nao hipotetico).
      window.gcReport
        .listReportHistory()
        .then((reports) => {
          if (!cancelled) {
            setPendingRecoveryReport(selectPendingRecoveryReport(reports))
          }
        })
        .catch(() => {
          // Falha inesperada na chamada em si (rejeitada, nao ausente) —
          // aceitavel nao mostrar o aviso, mas nunca deve impedir o resto
          // do app de funcionar.
        })
    } catch {
      // Segue sem o banner de recuperacao — nao e critico.
    }
    return () => {
      cancelled = true
    }
  }, [])

  // Aplica a preferencia de tamanho de fonte assim que o app abre — sem
  // isso, o texto so ficaria no tamanho persistido depois que o usuario
  // abrisse Configuracoes (unico outro lugar que le essa preferencia).
  // `--gc-font-scale` comeca em 1 no CSS (ver global.css), entao mesmo
  // que esta chamada falhe o app nunca fica com texto zerado.
  useEffect(() => {
    try {
      window.gcReport
        .getAppearanceSettings()
        .then((settings) => applyFontScale(settings.fontSize))
        .catch(() => {})
    } catch {
      // Segue com o tamanho de fonte padrao (--gc-font-scale: 1) — nao critico.
    }
  }, [])

  // Investigacao do relato repetido de drag-and-drop bloqueado: se o app
  // roda como Administrador, o Windows bloqueia silenciosamente o
  // drag-and-drop vindo do Explorer (que normalmente nao roda elevado) —
  // ver services/elevationCheck.ts. Avisa o usuario com uma acao clara
  // em vez de deixar o drag falhar sem explicacao nenhuma.
  useEffect(() => {
    // Nunca deve derrubar o app inteiro se isso falhar por qualquer
    // motivo — e so um aviso auxiliar, nao uma dependencia do fluxo
    // principal. Sem o try/catch, uma falha aqui (ex.: preload nao
    // carregado por algum motivo) quebraria a arvore de componentes
    // inteira sem nenhum error boundary pra pegar (confirmado num teste
    // real: `window.gcReport` indisponivel derrubava o <App> inteiro
    // com "Cannot read properties of undefined").
    try {
      window.gcReport.isRunningElevated().then(setIsElevated).catch(() => {})
    } catch {
      // Segue sem o aviso — nao e critico.
    }
  }, [])

  const applyValidationResult = useCallback((result: DemoValidationResult) => {
    if (result.valid) {
      setState({
        status: 'ready',
        fileName: result.fileName,
        fileSizeBytes: result.fileSizeBytes,
        localPath: result.demoInput.localPath
      })
    } else {
      setState({ status: 'invalid', error: result.error })
    }
  }, [])

  const handleFileDropped = useCallback(
    async (file: File) => {
      setState({ status: 'validating' })
      try {
        const localPath = window.gcReport.getPathForFile(file)
        if (import.meta.env.DEV) {
          console.log('[App] handleFileDropped getPathForFile', {
            fileName: file.name,
            resolvedPath: localPath || '(vazio)'
          })
        }
        // `webUtils.getPathForFile` documentadamente devolve string vazia
        // (nao lanca excecao) quando nao consegue resolver o caminho real
        // do arquivo — achado real de investigacao (nao suposicao, ver
        // docs/plano-frente-b.md), categoria conhecida de falha do
        // Electron especificamente pra arquivos soltos por drag-and-drop
        // (`webUtils.getPathForFile` empty string on drag/drop File
        // objects — electron/electron#44600, #44982). Sem este check, o
        // app validava uma string vazia como "nao e .dem" — mensagem
        // enganosa pra quem soltou um .dem de verdade. Selecionar pelo
        // dialogo nativo nunca passa por este caminho (o main process
        // devolve o caminho direto, sem File/webUtils envolvido), entao
        // continua funcionando mesmo quando isso acontece.
        if (!localPath) {
          setState({
            status: 'invalid',
            error:
              'Não conseguimos localizar esse arquivo no seu computador a partir do arraste. Tente selecionar pelo botão abaixo.'
          })
          return
        }
        const result = await window.gcReport.validateDemo(localPath)
        applyValidationResult(result)
      } catch {
        // Nunca deve falhar silenciosamente — se getPathForFile ou o IPC
        // derem erro por qualquer motivo, o usuario ainda recebe feedback
        // (e pode cair para o caminho do dialogo nativo).
        setState({
          status: 'invalid',
          error: 'Não foi possível ler o arquivo arrastado. Tente selecionar pelo botão abaixo.'
        })
      }
    },
    [applyValidationResult]
  )

  const handleSelectClick = useCallback(async () => {
    try {
      const result = await window.gcReport.selectDemoViaDialog()
      if (result === null) {
        // Usuario cancelou o dialogo — mantem o estado atual.
        return
      }
      setState({ status: 'validating' })
      applyValidationResult(result)
    } catch {
      // Sem isso, um erro inesperado aqui (ex.: arquivo removido entre a
      // selecao e a validacao) deixaria o clique sem nenhum efeito
      // visivel — o usuario clicaria de novo sem entender por que nada
      // acontece.
      setState({
        status: 'invalid',
        error: 'Não foi possível selecionar esse arquivo. Tente novamente.'
      })
    }
  }, [applyValidationResult])

  const handleStartProcessing = useCallback(async (localPath: string, fileSizeBytes: number) => {
    setState({ status: 'processing', stage: 'identifying-players', fileSizeBytes, localPath })

    const unsubscribe = window.gcReport.onProcessingStage((stage) => {
      setState((previous) => (previous.status === 'processing' ? { ...previous, stage } : previous))
    })

    try {
      const result = await window.gcReport.processDemo(localPath)

      if (result.status === 'success') {
        setState({
          status: 'players-found',
          players: result.audioFiles,
          localPath,
          outputDir: result.outputDir
        })
      } else {
        setState({
          status: 'processing-error',
          message: friendlyProcessingErrorMessage(result.status)
        })
      }
    } catch {
      // Nunca deve acontecer (o handler principal ja trata os proprios
      // erros e sempre resolve com um resultado tipado — ver
      // csgoveHandlers.ts), mas sem isso uma falha inesperada aqui
      // deixaria o usuario preso na tela de processamento pra sempre,
      // sem nenhuma acao possivel.
      setState({
        status: 'processing-error',
        message: friendlyProcessingErrorMessage('unexpected-error')
      })
    } finally {
      unsubscribe()
    }
  }, [])

  /**
   * SEMPRE mostra a tela de confirmacao de pasta apos "Continuar com
   * esta demo" — decisao revista nesta rodada por pedido explicito do
   * usuario. Antes, com uma pasta ja configurada, o app pulava direto
   * pro processamento sem mostrar onde os arquivos iriam parar; o
   * usuario relatou que isso deixava a decisao de armazenamento
   * "escondida demais" ("não esconder completamente essa decisão de
   * armazenamento a ponto de o usuário não saber onde seus arquivos
   * estão indo"). `ConfirmStorageLocation.tsx` agora tem 3 variantes de
   * copy (nunca configurado / pasta sumiu / ja configurada) pra essa
   * tela nunca soar como uma pergunta repetida sem necessidade — so
   * confirma o caminho quando ja ha um configurado, com "Iniciar
   * processamento" a um clique de distancia.
   */
  const handleGoToConfirmStorage = useCallback(
    async (fileName: string, fileSizeBytes: number, localPath: string) => {
      try {
        const storageInfo = await window.gcReport.getEvidenceStorageInfo()
        setState({ status: 'confirm-storage', fileName, fileSizeBytes, localPath, storageInfo })
      } catch {
        // Sem isso, clicar em "Continuar com esta demo" nao faria nada
        // visivel se essa chamada falhar de forma inesperada — o
        // usuario ficaria sem saber se precisa clicar de novo.
        setState({
          status: 'invalid',
          error: 'Não foi possível continuar com esta demo. Tente novamente.'
        })
      }
    },
    [handleStartProcessing]
  )

  const handleChangeStorageDuringConfirm = useCallback(async () => {
    const updated = await window.gcReport.chooseEvidenceRootDir()
    if (updated === null) return // usuario cancelou o dialogo
    setState((previous) =>
      previous.status === 'confirm-storage' ? { ...previous, storageInfo: updated } : previous
    )
  }, [])

  const handleBackToReady = useCallback(() => {
    setState((previous) =>
      previous.status === 'confirm-storage'
        ? {
            status: 'ready',
            fileName: previous.fileName,
            fileSizeBytes: previous.fileSizeBytes,
            localPath: previous.localPath
          }
        : previous
    )
  }, [])

  const handleConfirmSelection = useCallback(
    async (localPath: string, outputDir: string, selectedPlayers: ExtractedVoice[]) => {
      setState({ status: 'organizing' })
      try {
        const result = await window.gcReport.organizeEvidence(localPath, outputDir, selectedPlayers)
        if (result.status === 'success') {
          setState({
            status: 'evidence-organized',
            reportId: result.reportId,
            reportDir: result.reportDir,
            audioFiles: result.audioFiles,
            matchId: result.matchId,
            map: result.map
          })
        } else {
          setState({ status: 'organizing-error' })
        }
      } catch {
        setState({ status: 'organizing-error' })
      }
    },
    []
  )

  const handleReset = useCallback(() => setState({ status: 'idle' }), [])

  const handleOpenSettings = useCallback(async () => {
    // Sempre abre o painel, mesmo se nao conseguir buscar a pasta de
    // armazenamento (SettingsOverlay ja trata `storageInfo: null`) — sem
    // isso, uma falha nessa unica chamada deixaria o botao
    // "Configuracoes" parecendo nao fazer nada (sem crash, mas sem
    // nenhum feedback tambem).
    try {
      const storageInfo = await window.gcReport.getEvidenceStorageInfo()
      setSettingsStorageInfo(storageInfo)
    } catch {
      setSettingsStorageInfo(null)
    }
    setIsSettingsOpen(true)
  }, [])

  const handleChangeStorageInSettings = useCallback(async () => {
    try {
      const updated = await window.gcReport.chooseEvidenceRootDir()
      if (updated !== null) {
        setSettingsStorageInfo(updated)
      }
    } catch {
      // Falha inesperada ao abrir o dialogo/ler a pasta — mantem o valor
      // anterior, nunca deixa uma excecao nao tratada solta.
    }
  }, [])

  const handleOpenHistory = useCallback(() => {
    setIsHistoryOpen(true)
  }, [])

  /**
   * Leva direto pra mesma tela final que qualquer denuncia recem-
   * concluida usa — o DriveUploadPanel dentro dela dispara o upload
   * automaticamente, e agora (com o checkpoint do GoogleDriveProvider)
   * retoma de onde parou em vez de recriar a pasta e reenviar tudo.
   * Nunca reprocessa a demo nem reorganiza os audios: reportDir ja
   * aponta pra pasta com os arquivos ja extraidos.
   */
  const handleResumePendingReport = useCallback(() => {
    if (!pendingRecoveryReport) return
    const report = pendingRecoveryReport
    setPendingRecoveryReport(null)
    setState({
      status: 'evidence-organized',
      reportId: report.reportId,
      reportDir: report.folderPath,
      audioFiles: report.players.map((player) => ({ displayName: player.displayName })),
      matchId: report.matchId,
      map: report.map
    })
  }, [pendingRecoveryReport])

  const handleDiscardedPendingReport = useCallback(() => {
    setPendingRecoveryReport(null)
  }, [])

  return (
    <>
      <main className="app">
        <Header onOpenHistory={handleOpenHistory} onOpenSettings={handleOpenSettings} />

        <div className="app__content">
          {(state.status === 'idle' || state.status === 'validating' || state.status === 'invalid') && (
            <>
              {state.status === 'idle' && <p className="app-tagline">Feito pela comunidade, para a comunidade.</p>}
              {state.status === 'idle' && pendingRecoveryReport && (
                <PendingReportBanner
                  report={pendingRecoveryReport}
                  onResume={handleResumePendingReport}
                  onDiscarded={handleDiscardedPendingReport}
                />
              )}
              {isElevated && !elevationWarningDismissed && (
                <div className="elevation-warning" role="alert">
                  <p>
                    Este aplicativo parece estar rodando como <strong>Administrador</strong>. Isso
                    às vezes impede que o Windows deixe você arrastar arquivos do Explorer para
                    dentro do app. Se o arrastar-e-soltar não funcionar, tente fechar e abrir de
                    novo sem "Executar como administrador" — ou use o botão abaixo pra escolher o
                    arquivo diretamente.
                  </p>
                  <button
                    type="button"
                    className="elevation-warning__dismiss"
                    onClick={() => setElevationWarningDismissed(true)}
                    aria-label="Dispensar aviso"
                  >
                    <Icon name="close" size={14} />
                  </button>
                </div>
              )}
              <DemoDropZone
                onFileDropped={handleFileDropped}
                onSelectClick={handleSelectClick}
                onOpenOnboarding={() => setIsOnboardingOpen(true)}
                isValidating={state.status === 'validating'}
                errorMessage={state.status === 'invalid' ? state.error : undefined}
              />
            </>
          )}

          {state.status === 'ready' && (
            <DemoSummary
              fileName={state.fileName}
              fileSizeBytes={state.fileSizeBytes}
              localPath={state.localPath}
              onContinue={() =>
                handleGoToConfirmStorage(state.fileName, state.fileSizeBytes, state.localPath)
              }
              onReset={handleReset}
            />
          )}

          {state.status === 'confirm-storage' && (
            <ConfirmStorageLocation
              storageInfo={state.storageInfo}
              onChooseFolder={handleChangeStorageDuringConfirm}
              onBack={handleBackToReady}
              onStart={() => handleStartProcessing(state.localPath, state.fileSizeBytes)}
            />
          )}

          {state.status === 'processing' && (
            <ProcessingIndicator stage={state.stage} fileSizeBytes={state.fileSizeBytes} />
          )}

          {state.status === 'players-found' &&
            (state.players.length > 0 ? (
              <PlayerSelectionList
                players={state.players}
                onConfirm={(selected) =>
                  handleConfirmSelection(state.localPath, state.outputDir, selected)
                }
                onReset={handleReset}
              />
            ) : (
              <NoAudioFoundNotice onReset={handleReset} />
            ))}

          {state.status === 'organizing' && (
            <SimpleLoadingIndicator
              title="Preparando sua prova..."
              subtitle="Estamos guardando os áudios selecionados num lugar seguro no seu computador."
            />
          )}

          {state.status === 'evidence-organized' && (
            <EvidenceOrganized
              reportId={state.reportId}
              reportDir={state.reportDir}
              audioFiles={state.audioFiles}
              matchId={state.matchId}
              map={state.map}
              onReset={handleReset}
              onOpenHistory={handleOpenHistory}
            />
          )}

          {(state.status === 'processing-error' || state.status === 'organizing-error') && (
            <div className="demo-summary">
              <p className="demo-summary__title">Não foi possível continuar</p>
              <p className="drop-zone__error">
                {state.status === 'processing-error'
                  ? state.message
                  : 'Não foi possível preparar sua prova. Verifique se há espaço livre no seu computador e tente novamente.'}
              </p>
              <div className="demo-summary__actions">
                <button type="button" className="btn btn--secondary" onClick={handleReset}>
                  Escolher outra demo
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      {isSettingsOpen && (
        <SettingsOverlay
          storageInfo={settingsStorageInfo}
          onChooseFolder={handleChangeStorageInSettings}
          onClose={() => setIsSettingsOpen(false)}
        />
      )}

      {isHistoryOpen && <HistoryOverlay onClose={() => setIsHistoryOpen(false)} />}

      {isOnboardingOpen && <OnboardingOverlay onClose={() => setIsOnboardingOpen(false)} />}

      <UpdateNotification />
    </>
  )
}

export default App
