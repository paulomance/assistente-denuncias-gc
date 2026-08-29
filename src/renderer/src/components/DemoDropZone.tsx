import { useCallback, useRef, useState, type DragEvent } from 'react'
import { Icon } from './Icon'

const MY_MATCHES_URL = 'https://gamersclub.com.br/my-matches'

interface DemoDropZoneProps {
  onFileDropped: (file: File) => void
  onSelectClick: () => void
  onOpenOnboarding: () => void
  isValidating: boolean
  errorMessage?: string
}

export function DemoDropZone({
  onFileDropped,
  onSelectClick,
  onOpenOnboarding,
  isValidating,
  errorMessage
}: DemoDropZoneProps): React.JSX.Element {
  const [isDragOver, setIsDragOver] = useState(false)
  // Contador em vez de um booleano simples: dragenter/dragleave disparam
  // tambem para elementos filhos do drop zone, e um booleano ingenuo pisca
  // (liga/desliga) o estado de "arrastando" ao passar entre eles.
  const dragCounter = useRef(0)

  const handleDragEnter = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    // Sem isso, alguns drags de arquivo vindos de fora do Chromium (ex.:
    // Windows Explorer) mostram o cursor de "não permitido" e o SO nunca
    // completa o drop de verdade — preventDefault() sozinho so evita a
    // navegacao padrao, nao sinaliza que o alvo aceita o arquivo.
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy'
    }
    dragCounter.current += 1
    setIsDragOver(true)
    // Diagnostico so em dev (import.meta.env.DEV — nunca no build
    // empacotado): usuario reportou 3x seguidas que o drag-and-drop
    // continua nao funcionando mesmo apos as correcoes de dropEffect e
    // caminho vazio. Se ESTE log nunca aparecer no DevTools durante um
    // drag real, o evento nem chega no renderer — sinal forte de
    // bloqueio no nivel do SO (ex.: UIPI do Windows, quando o Explorer
    // roda elevado e o app nao, ou vice-versa), nao um bug de codigo.
    if (import.meta.env.DEV) {
      console.log('[drop-zone] dragenter', { types: event.dataTransfer?.types })
    }
  }, [])

  const handleDragLeave = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    dragCounter.current -= 1
    if (dragCounter.current <= 0) {
      dragCounter.current = 0
      setIsDragOver(false)
    }
  }, [])

  const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy'
    }
  }, [])

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault()
      dragCounter.current = 0
      setIsDragOver(false)

      const file = event.dataTransfer.files[0]
      if (import.meta.env.DEV) {
        console.log('[drop-zone] drop', {
          filesCount: event.dataTransfer.files.length,
          fileName: file?.name,
          fileSize: file?.size
        })
      }
      if (file) {
        onFileDropped(file)
      }
    },
    [onFileDropped]
  )

  return (
    <div
      className={`drop-zone${isDragOver ? ' drop-zone--active' : ''}`}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <button
        type="button"
        className="drop-zone__help-button"
        onClick={(event) => {
          event.stopPropagation()
          onOpenOnboarding()
        }}
        aria-label="O que este aplicativo faz?"
        title="O que este aplicativo faz?"
      >
        <Icon name="help" size={22} />
      </button>
      <svg
        className="drop-zone__icon"
        width="64"
        height="64"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path
          d="M12 16V4M12 4L7 9M12 4L17 9"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M4 16V18C4 19.1046 4.89543 20 6 20H18C19.1046 20 20 19.1046 20 18V16"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <p className="drop-zone__title">
        {isValidating ? 'Verificando sua demo...' : 'Escolha o arquivo da demo (.dem)'}
      </p>
      {!isValidating && (
        <p className="drop-zone__hint">Arraste o arquivo .dem da sua partida aqui</p>
      )}
      <p className="drop-zone__subtitle">ou</p>
      <button
        type="button"
        className="btn btn--secondary"
        onClick={onSelectClick}
        disabled={isValidating}
      >
        Escolher arquivo da demo
      </button>
      {errorMessage && <p className="drop-zone__error">{errorMessage}</p>}

      {!isValidating && (
        <div className="how-to-get-demo">
          <p className="how-to-get-demo__title">Ainda não tem a demo?</p>
          <ol className="how-to-get-demo__steps">
            <li>Acesse "Minhas Partidas"</li>
            <li>Escolha a partida desejada</li>
            <li>Clique em "Baixar demo"</li>
            <li>Escolha o arquivo .dem aqui no aplicativo</li>
          </ol>
          <a
            href={MY_MATCHES_URL}
            target="_blank"
            rel="noreferrer"
            className="btn btn--link how-to-get-demo__link"
          >
            <Icon name="external" size={12} /> Ver minhas partidas
          </a>
          <p className="how-to-get-demo__note">
            As demos podem levar até 48h para ficarem disponíveis e permanecem disponíveis para
            download por 7 dias.
          </p>
        </div>
      )}
    </div>
  )
}
