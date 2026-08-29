import { useEffect, useRef } from 'react'
import { Icon } from './Icon'

interface ModalOverlayProps {
  title: string
  onClose: () => void
  panelClassName?: string
  children: React.ReactNode
}

/**
 * Casca compartilhada por SettingsOverlay e HistoryOverlay (mesma
 * estrutura visual nos dois — cabecalho com titulo/fechar, fundo
 * escurecido, painel). Centraliza aqui o que faltava nos dois: foco move
 * pro dialogo quando abre (usuario de teclado/leitor de tela sabe que
 * entrou num contexto novo) e Esc fecha — comportamento padrao esperado
 * de qualquer modal, ausente antes. Nao implementa um focus trap
 * completo (Tab ainda pode sair do dialogo pro conteudo atras) — deixado
 * de fora por ora, ver docs/plano-frente-b.md.
 */
export function ModalOverlay({
  title,
  onClose,
  panelClassName,
  children
}: ModalOverlayProps): React.JSX.Element {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    panelRef.current?.focus()

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div className="settings-overlay" role="dialog" aria-modal="true" aria-label={title}>
      <div className="settings-overlay__backdrop" onClick={onClose} />
      <div
        ref={panelRef}
        tabIndex={-1}
        className={panelClassName ? `settings-overlay__panel ${panelClassName}` : 'settings-overlay__panel'}
      >
        <div className="settings-overlay__header">
          <p className="settings-overlay__title">{title}</p>
          <button type="button" className="settings-overlay__close" onClick={onClose} aria-label="Fechar">
            <Icon name="close" size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
