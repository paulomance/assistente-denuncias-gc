import { useCallback, useEffect, useState } from 'react'
import { ModalOverlay } from './ModalOverlay'
import { Icon } from './Icon'
import { friendlyDriveErrorMessage } from '../utils/friendlyDriveErrorMessage'
import { applyFontScale } from '../utils/fontScale'
import type { AppearanceSettings, EvidenceStorageInfo, FontSize, UiScale, WindowMode } from '../../../shared/types/Settings'
import type { CloudAuthStatus } from '../../../shared/types/CloudStorage'
import type { AppInfo } from '../../../shared/types/AppInfo'
import type { UpdateStatus } from '../../../shared/types/Update'

const RELEASE_CHANNEL_LABEL: Record<AppInfo['channel'], string> = {
  development: 'Desenvolvimento',
  test: 'Versão de teste',
  production: 'Produção'
}

const UI_SCALE_OPTIONS: { value: UiScale; label: string }[] = [
  { value: 'small', label: 'Pequena' },
  { value: 'medium', label: 'Média' },
  { value: 'large', label: 'Grande' },
  // "Recomendada" porque, na prática, parte do mesmo tamanho de
  // referência (Média) e só se adapta em janelas bem pequenas/grandes —
  // ver comentário de DEFAULT_UI_SCALE em AppSettings.ts.
  { value: 'auto', label: 'Automática (recomendada)' }
]

const WINDOW_MODE_OPTIONS: { value: WindowMode; label: string }[] = [
  { value: 'windowed', label: 'Janela' },
  { value: 'fullscreen', label: 'Tela cheia' }
]

const FONT_SIZE_OPTIONS: { value: FontSize; label: string }[] = [
  { value: 'small', label: 'Pequena' },
  { value: 'medium', label: 'Média' },
  { value: 'large', label: 'Grande' }
]

interface SettingsOverlayProps {
  storageInfo: EvidenceStorageInfo | null
  onChooseFolder: () => void
  onClose: () => void
}

type DriveSectionState =
  | { phase: 'checking' }
  | { phase: 'signed-out' }
  | { phase: 'connecting' }
  | { phase: 'signed-in' }
  | { phase: 'confirm-disconnect' }
  | { phase: 'error'; message: string }

/**
 * Ponto de entrada unico e permanente para configuracoes.
 */
export function SettingsOverlay({
  storageInfo,
  onChooseFolder,
  onClose
}: SettingsOverlayProps): React.JSX.Element {
  const [driveState, setDriveState] = useState<DriveSectionState>({ phase: 'checking' })
  const [appearance, setAppearance] = useState<AppearanceSettings | null>(null)
  // Snapshot do valor REALMENTE ativo neste processo (lido uma unica vez,
  // na primeira carga) — comparado contra `appearance.hardwareAcceleration`
  // pra so mostrar o aviso de reinicio quando o usuario de fato mudou o
  // valor nesta sessao, nunca so por abrir Configuracoes.
  const [activeHardwareAcceleration, setActiveHardwareAcceleration] = useState<boolean | null>(null)
  const [isRestarting, setIsRestarting] = useState(false)
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null)
  const [canCheckUpdates, setCanCheckUpdates] = useState(false)
  // Derivado do status real transmitido pelo processo principal (ver
  // onUpdateStatus abaixo), nunca uma flag propria que so vai pra
  // `true` e nunca volta — achado real: a versao anterior deste botao
  // ficava travada em "Verificando atualizacoes..." pra sempre depois
  // do primeiro clique, porque nada nunca resetava o flag de volta.
  const [checkingUpdates, setCheckingUpdates] = useState(false)

  useEffect(() => {
    let cancelled = false
    // Chamadas a window.gcReport.* lancam SINCRONAMENTE se o preload
    // nao tiver anexado a API por qualquer motivo — sem o try/catch em
    // volta da chamada em si (nao so um .catch() no fim da cadeia), a
    // excecao nunca seria capturada e derrubaria este componente
    // inteiro (mesmo bug ja corrigido 2x em App.tsx, ver
    // .claude/skills/electron-desktop-engineering/SKILL.md secao 5).
    try {
      window.gcReport.getAppInfo().then((info) => {
        if (!cancelled) setAppInfo(info)
      })
      window.gcReport.isUpdateCheckingAvailable().then((available) => {
        if (!cancelled) setCanCheckUpdates(available)
      })
    } catch {
      // Sem versao/canal pra mostrar e sem verificar atualizacoes — nao
      // critico, o resto de Configuracoes continua funcionando.
    }
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!canCheckUpdates) return undefined
    let unsubscribe: (() => void) | undefined
    try {
      unsubscribe = window.gcReport.onUpdateStatus((status: UpdateStatus) => {
        setCheckingUpdates(status.status === 'checking')
      })
    } catch {
      // Botao continua clicavel, so sem feedback de "Verificando..." —
      // nao critico.
    }
    return () => unsubscribe?.()
  }, [canCheckUpdates])

  const handleCheckForUpdates = useCallback(() => {
    void window.gcReport.checkForUpdates()
  }, [])

  useEffect(() => {
    let cancelled = false
    try {
      window.gcReport.getAppearanceSettings().then((settings) => {
        if (!cancelled) {
          setAppearance(settings)
          setActiveHardwareAcceleration(settings.hardwareAcceleration)
        }
      })
    } catch {
      // Seção Aparência/Desempenho fica com os controles desabilitados
      // (appearance continua null) — não trava o resto do painel.
    }
    return () => {
      cancelled = true
    }
  }, [])

  const handleChangeUiScale = useCallback(async (scale: UiScale) => {
    setAppearance((prev) => (prev ? { ...prev, uiScale: scale } : prev)) // resposta imediata, sem esperar o IPC
    const updated = await window.gcReport.setUiScale(scale)
    setAppearance(updated)
  }, [])

  const handleChangeWindowMode = useCallback(async (mode: WindowMode) => {
    setAppearance((prev) => (prev ? { ...prev, windowMode: mode } : prev))
    const updated = await window.gcReport.setWindowMode(mode)
    setAppearance(updated)
  }, [])

  const handleChangeFontSize = useCallback(async (size: FontSize) => {
    setAppearance((prev) => (prev ? { ...prev, fontSize: size } : prev))
    applyFontScale(size) // efeito visual imediato, sem esperar o IPC (mesma ideia da escala/modo de janela)
    const updated = await window.gcReport.setFontSize(size)
    setAppearance(updated)
  }, [])

  const handleToggleHardwareAcceleration = useCallback(async (enabled: boolean) => {
    setAppearance((prev) => (prev ? { ...prev, hardwareAcceleration: enabled } : prev))
    const updated = await window.gcReport.setHardwareAcceleration(enabled)
    setAppearance(updated)
  }, [])

  const handleRestartApp = useCallback(() => {
    setIsRestarting(true)
    void window.gcReport.restartApp()
  }, [])

  const handleOpenThirdPartyNotices = useCallback(() => {
    void window.gcReport.openThirdPartyNotices()
  }, [])

  useEffect(() => {
    let cancelled = false
    try {
      window.gcReport.getDriveAuthStatus().then((status: CloudAuthStatus) => {
        if (!cancelled) setDriveState({ phase: status === 'signed-in' ? 'signed-in' : 'signed-out' })
      })
    } catch {
      setDriveState({ phase: 'error', message: friendlyDriveErrorMessage('unexpected') })
    }
    return () => {
      cancelled = true
    }
  }, [])

  const handleConnect = useCallback(async () => {
    setDriveState({ phase: 'connecting' })
    try {
      const result = await window.gcReport.signInToDrive()
      if (result.status === 'success') {
        setDriveState({ phase: 'signed-in' })
      } else {
        setDriveState({ phase: 'error', message: friendlyDriveErrorMessage(result.errorKind) })
      }
    } catch {
      setDriveState({ phase: 'error', message: friendlyDriveErrorMessage('unexpected') })
    }
  }, [])

  const handleConfirmDisconnect = useCallback(async () => {
    try {
      await window.gcReport.signOutOfDrive()
      setDriveState({ phase: 'signed-out' })
    } catch {
      // Nunca deixa o usuario preso na tela de confirmacao sem
      // explicacao — mantem o estado real (ainda conectado) em vez de
      // fingir que desconectou.
      setDriveState({ phase: 'error', message: friendlyDriveErrorMessage('unexpected') })
    }
  }, [])

  return (
    <ModalOverlay title="Configurações" onClose={onClose}>
      <section className="settings-overlay__section">
        <p className="settings-overlay__section-title">Armazenamento local</p>
        <p className="settings-overlay__section-note">
          É aqui que o app guarda os áudios das suas denúncias neste computador.
        </p>
        {storageInfo && (
          <p className="demo-summary__path" title={storageInfo.managedDir}>
            {storageInfo.managedDir}
          </p>
        )}
        <button type="button" className="btn btn--link demo-summary__link-button" onClick={onChooseFolder}>
          Alterar pasta
        </button>
      </section>

      <section className="settings-overlay__section">
        <p className="settings-overlay__section-title">Aparência</p>
        <p className="settings-overlay__section-note">Escala da interface</p>
        <div className="segmented-control" role="group" aria-label="Escala da interface">
          {UI_SCALE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={
                appearance?.uiScale === option.value
                  ? 'segmented-control__option segmented-control__option--active'
                  : 'segmented-control__option'
              }
              onClick={() => handleChangeUiScale(option.value)}
              disabled={!appearance}
            >
              {option.label}
            </button>
          ))}
        </div>
        <p className="settings-overlay__section-note settings-overlay__section-note--spaced">
          Janela
        </p>
        <div className="segmented-control" role="group" aria-label="Modo da janela">
          {WINDOW_MODE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={
                appearance?.windowMode === option.value
                  ? 'segmented-control__option segmented-control__option--active'
                  : 'segmented-control__option'
              }
              onClick={() => handleChangeWindowMode(option.value)}
              disabled={!appearance}
            >
              {option.label}
            </button>
          ))}
        </div>
        <p className="settings-overlay__section-note settings-overlay__section-note--spaced">
          Fonte
        </p>
        <div className="segmented-control" role="group" aria-label="Tamanho da fonte">
          {FONT_SIZE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={
                appearance?.fontSize === option.value
                  ? 'segmented-control__option segmented-control__option--active'
                  : 'segmented-control__option'
              }
              onClick={() => handleChangeFontSize(option.value)}
              disabled={!appearance}
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>

      <section className="settings-overlay__section">
        <p className="settings-overlay__section-title">Desempenho</p>
        <label className="settings-toggle">
          <input
            type="checkbox"
            checked={appearance?.hardwareAcceleration ?? false}
            onChange={(event) => handleToggleHardwareAcceleration(event.target.checked)}
            disabled={!appearance}
          />
          <span className="settings-toggle__track" aria-hidden="true" />
          Aceleração por hardware (GPU)
        </label>
        <p className="settings-overlay__section-note">
          Desligada por padrão. Usa a placa de vídeo do computador para
          deixar a interface mais fluida (rolagem, animações) — não afeta a
          velocidade de extrair os áudios nem de enviar ao Google Drive, que
          não dependem de GPU. Em computadores com drivers de vídeo
          desatualizados ou problemáticos, ligar isso pode causar
          instabilidade ao abrir o aplicativo.
        </p>
        {appearance && activeHardwareAcceleration !== null &&
          appearance.hardwareAcceleration !== activeHardwareAcceleration && (
            <div className="settings-overlay__restart-hint">
              <p className="settings-overlay__section-note">
                <Icon name="alert" size={13} /> Reinicie o aplicativo para aplicar essa mudança.
              </p>
              <button
                type="button"
                className={isRestarting ? 'btn btn--primary btn--loading' : 'btn btn--primary'}
                onClick={handleRestartApp}
                disabled={isRestarting}
              >
                Reiniciar agora
              </button>
            </div>
        )}
      </section>

      <section className="settings-overlay__section">
        <p className="settings-overlay__section-title">Google Drive</p>

        {driveState.phase === 'checking' && (
          <p className="settings-overlay__section-note">Verificando conexão...</p>
        )}

        {driveState.phase === 'signed-out' && (
          <>
            <p className="settings-overlay__section-note">
              Conecte sua conta do Google para poder enviar suas provas ao Drive.
            </p>
            <button type="button" className="btn btn--primary" onClick={handleConnect}>
              <Icon name="drive" size={16} /> Conectar Google Drive
            </button>
          </>
        )}

        {driveState.phase === 'connecting' && (
          <p className="settings-overlay__section-note">
            Continue no navegador que abrimos para fazer login com sua conta do Google...
          </p>
        )}

        {driveState.phase === 'signed-in' && (
          <>
            <p className="demo-summary__status demo-summary__status--ready">
              <Icon name="check" size={14} /> Google Drive conectado
            </p>
            <p className="settings-overlay__section-note">
              As provas enviadas ficam guardadas com segurança na sua conta.
            </p>
            <button
              type="button"
              className="btn btn--link demo-summary__link-button"
              onClick={() => setDriveState({ phase: 'confirm-disconnect' })}
            >
              Desconectar
            </button>
          </>
        )}

        {driveState.phase === 'confirm-disconnect' && (
          <>
            <p className="settings-overlay__section-note">
              Desconectar Google Drive? Você poderá conectar novamente quando quiser. Suas
              provas já enviadas continuam no seu Drive.
            </p>
            <div className="settings-overlay__confirm-actions">
              <button
                type="button"
                className="btn btn--secondary"
                onClick={() => setDriveState({ phase: 'signed-in' })}
              >
                Cancelar
              </button>
              <button type="button" className="btn btn--danger" onClick={handleConfirmDisconnect}>
                Sim, desconectar
              </button>
            </div>
          </>
        )}

        {driveState.phase === 'error' && (
          <>
            <p className="drop-zone__error">
              <Icon name="alert" size={14} /> {driveState.message}
            </p>
            <button type="button" className="btn btn--link demo-summary__link-button" onClick={handleConnect}>
              Tentar novamente
            </button>
          </>
        )}
      </section>

      <section className="settings-overlay__section">
        <p className="settings-overlay__section-title">Sobre</p>
        <p className="about-app__name">
          Assistente de Denúncias GC <span className="beta-badge">Beta</span>
        </p>
        {appInfo && (
          <p className="about-app__version">
            Versão {appInfo.version}
            {appInfo.channel !== 'production' && (
              <span className="about-app__channel-badge">{RELEASE_CHANNEL_LABEL[appInfo.channel]}</span>
            )}
            {canCheckUpdates && (
              <button type="button" className="btn btn--link" onClick={handleCheckForUpdates} disabled={checkingUpdates}>
                {checkingUpdates ? 'Verificando...' : 'Verificar atualizações'}
              </button>
            )}
          </p>
        )}
        <p className="about-app__tagline">Feito pela comunidade, para a comunidade.</p>
        <p className="settings-overlay__section-note">
          Ajuda jogadores de Counter-Strike a organizar provas de comunicação de voz e texto de
          uma partida — a partir de uma demo (.dem), identifica os jogadores e as evidências
          disponíveis, deixa você revisar e escolher o que quer denunciar, e organiza tudo pronto
          para anexar num processo de denúncia. O envio da denúncia em si continua sendo feito
          pelos canais oficiais da plataforma onde a partida aconteceu.
        </p>

        <p className="settings-overlay__section-note settings-overlay__section-note--spaced settings-overlay__independence-title">
          Projeto independente
        </p>
        <p className="settings-overlay__section-note">
          Este é um projeto independente, mantido pela comunidade — não é um aplicativo oficial e
          não possui vínculo, parceria, patrocínio ou representação da Gamers Club ou de qualquer
          outra plataforma.
        </p>

      </section>

      <section className="settings-overlay__section">
        <p className="settings-overlay__section-title">Créditos e licenças</p>
        <p className="settings-overlay__section-note">
          Este aplicativo utiliza tecnologias e projetos de código aberto de terceiros.
        </p>
        <ul className="credits-list">
          <li>
            <strong>CSGOVE</strong> — usado para processar os arquivos de demo e extrair as
            comunicações de voz. Projeto independente, de{' '}
            <a href="https://github.com/akiver/csgo-voice-extractor" target="_blank" rel="noreferrer">
              AkiVer
            </a>{' '}
            (licença MIT) — sem vínculo com a Gamers Club.
          </li>
          <li>Diversas bibliotecas de código aberto (Electron, React e outras).</li>
        </ul>
        <button
          type="button"
          className="btn btn--link demo-summary__link-button"
          onClick={handleOpenThirdPartyNotices}
        >
          <Icon name="external" size={12} /> Ver créditos e licenças de terceiros
        </button>
      </section>
    </ModalOverlay>
  )
}
