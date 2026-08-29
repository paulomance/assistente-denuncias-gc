import { ModalOverlay } from './ModalOverlay'
import { Icon } from './Icon'

type AudioLoadState = 'idle' | 'loading' | 'error'

interface AudioPlayerModalProps {
  playerName: string
  isPlaying: boolean
  loadState: AudioLoadState
  currentTime: number
  duration: number
  volumePercent: number
  isMuted: boolean
  includeInReport: boolean
  onTogglePlay: () => void
  onSeek: (fraction: number) => void
  onVolumeChange: (percent: number) => void
  onToggleMute: () => void
  onToggleInclude: (include: boolean) => void
  onClose: () => void
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

/**
 * Irmão do ChatViewerModal.tsx — MESMO padrão de interação, agora
 * também pro áudio: abrir este modal (clicando no ícone 🎙 do card,
 * ver PlayerSelectionList.tsx) e ouvir NUNCA inclui o áudio na
 * denúncia — só o checkbox "Incluir áudio na denúncia" abaixo faz isso.
 * Antes desta rodada, o player ficava sempre visível dentro do card
 * (play + barra + volume + toggle de inclusão, até 4 controles por
 * jogador) — mudado pra um modal por pedido explícito do usuário: o
 * ícone 🎙 no card colapsado vira só um ponto de entrada ("este jogador
 * tem áudio"), a decisão de ouvir/incluir acontece aqui dentro.
 *
 * Todo o ESTADO de reprodução (playingId, blobUrlsRef, volume da
 * sessão etc.) continua vivendo no componente pai
 * (PlayerSelectionList.tsx) — inclusive o próprio elemento `<audio>`
 * compartilhado — este componente é só a VIEW; os handlers recebidos
 * por prop já sabem qual jogador está tocando.
 */
export function AudioPlayerModal({
  playerName,
  isPlaying,
  loadState,
  currentTime,
  duration,
  volumePercent,
  isMuted,
  includeInReport,
  onTogglePlay,
  onSeek,
  onVolumeChange,
  onToggleMute,
  onToggleInclude,
  onClose
}: AudioPlayerModalProps): React.JSX.Element {
  const progressFraction = duration > 0 ? currentTime / duration : 0

  return (
    <ModalOverlay title={`Áudio — ${playerName}`} onClose={onClose} panelClassName="audio-player-modal">
      <div className="audio-player-modal__player">
        <button
          type="button"
          className={`audio-player-modal__play-button${loadState === 'error' ? ' audio-player-modal__play-button--error' : ''}`}
          onClick={onTogglePlay}
          disabled={loadState === 'loading'}
          aria-label={isPlaying ? 'Pausar' : 'Ouvir áudio'}
        >
          {loadState === 'loading' ? (
            <span className="audio-player-modal__spinner" aria-hidden="true" />
          ) : loadState === 'error' ? (
            <Icon name="alert" size={18} />
          ) : (
            <Icon name={isPlaying ? 'pause' : 'play'} size={18} />
          )}
        </button>

        <div className="audio-player-modal__progress">
          <span className="audio-player-modal__time">{formatTime(currentTime)}</span>
          <div
            className="audio-player-modal__track"
            role="slider"
            aria-label="Posição do áudio"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progressFraction * 100)}
            tabIndex={0}
            onClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect()
              onSeek(Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)))
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowRight') onSeek(Math.min(1, progressFraction + 0.05))
              if (event.key === 'ArrowLeft') onSeek(Math.max(0, progressFraction - 0.05))
            }}
          >
            <div className="audio-player-modal__fill" style={{ width: `${progressFraction * 100}%` }} />
          </div>
          <span className="audio-player-modal__time">{duration > 0 ? formatTime(duration) : '--:--'}</span>
        </div>
      </div>

      <div className="audio-player-modal__volume">
        <button
          type="button"
          className="audio-player-modal__volume-icon"
          onClick={onToggleMute}
          aria-label={isMuted ? 'Ativar som' : 'Diminuir para mudo'}
          title={isMuted ? 'Ativar som' : 'Silenciar'}
        >
          <Icon name={volumePercent === 0 ? 'volume-mute' : 'volume'} size={14} />
        </button>
        <input
          type="range"
          className="audio-player-modal__volume-slider"
          min={0}
          max={100}
          step={1}
          value={volumePercent}
          onChange={(event) => onVolumeChange(Number(event.target.value))}
          aria-label="Volume da reprodução"
          aria-valuetext={`${volumePercent}%`}
        />
        <span className="audio-player-modal__volume-value">{volumePercent}%</span>
      </div>

      {loadState === 'error' && (
        <p className="audio-player-modal__error">Não conseguimos carregar o áudio deste jogador.</p>
      )}

      <label className="evidence-modal__include-toggle">
        <input
          type="checkbox"
          checked={includeInReport}
          onChange={(event) => onToggleInclude(event.target.checked)}
        />
        <span>Incluir áudio na denúncia</span>
      </label>
      <p className="evidence-modal__include-hint">
        {includeInReport
          ? 'Um arquivo .wav com este áudio vai ser gerado e enviado junto com a prova.'
          : 'Você pode continuar ouvindo, mas o áudio só será incluído nos arquivos da denúncia se você marcar esta opção.'}
      </p>

      <button type="button" className="btn btn--primary evidence-modal__done" onClick={onClose}>
        <Icon name="check" size={16} /> Concluído
      </button>
    </ModalOverlay>
  )
}
