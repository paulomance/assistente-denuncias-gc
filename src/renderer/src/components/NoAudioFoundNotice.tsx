interface NoAudioFoundNoticeProps {
  onReset: () => void
}

export function NoAudioFoundNotice({ onReset }: NoAudioFoundNoticeProps): React.JSX.Element {
  return (
    <div className="demo-summary">
      <p className="demo-summary__title">Nenhum áudio encontrado</p>
      <p className="demo-summary__filename">
        Não encontramos comunicação de voz nesta demo.
      </p>
      <p className="drop-zone__subtitle">
        Isso pode acontecer quando nenhum jogador falou durante a partida, ou quando a gravação
        não capturou áudio. Você pode tentar com outra demo.
      </p>
      <div className="demo-summary__actions">
        <button type="button" className="btn btn--primary" onClick={onReset}>
          Tentar com outra demo
        </button>
      </div>
    </div>
  )
}
