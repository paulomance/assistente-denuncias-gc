import { ModalOverlay } from './ModalOverlay'
import { Icon } from './Icon'
import type { PlayerChatMessage } from '../../../shared/types/Csgove'

interface ChatViewerModalProps {
  playerName: string
  messages: PlayerChatMessage[]
  includeInReport: boolean
  onToggleInclude: (include: boolean) => void
  onClose: () => void
}

/**
 * Mostra as mensagens de chat de um jogador na ordem em que aconteceram
 * na partida (o array já chega ordenado — ver matchChat.ts/
 * csgoveHandlers.ts, nunca reordenado aqui). Sem timestamp/tick visível
 * (decisão explícita do usuário: preservar ordem importa, o horário
 * exato não) — só a categoria (geral/equipe) de cada mensagem, sempre
 * visível, nunca escondida.
 */
export function ChatViewerModal({
  playerName,
  messages,
  includeInReport,
  onToggleInclude,
  onClose
}: ChatViewerModalProps): React.JSX.Element {
  return (
    <ModalOverlay title={`Texto — ${playerName}`} onClose={onClose} panelClassName="chat-viewer">
      <ul className="chat-viewer__list">
        {messages.map((message, index) => (
          // Sem id estavel por mensagem (o dado nao tem um) — a lista e
          // somente leitura e nunca reordenada/filtrada em tempo real,
          // entao o indice como key e seguro aqui.
          <li key={index} className="chat-viewer__message">
            <span
              className={`chat-viewer__badge${message.teamOnly ? ' chat-viewer__badge--team' : ' chat-viewer__badge--all'}`}
            >
              {message.teamOnly ? 'Equipe' : 'Geral'}
            </span>
            <span className="chat-viewer__text">{message.text}</span>
          </li>
        ))}
      </ul>

      <label className="evidence-modal__include-toggle">
        <input
          type="checkbox"
          checked={includeInReport}
          onChange={(event) => onToggleInclude(event.target.checked)}
        />
        <span>Incluir este texto na denúncia</span>
      </label>
      <p className="evidence-modal__include-hint">
        {includeInReport
          ? 'Um arquivo .txt com estas mensagens vai ser gerado e enviado junto com a prova.'
          : 'O texto continua visível aqui, mas não será incluído nos arquivos da denúncia.'}
      </p>

      <button type="button" className="btn btn--primary evidence-modal__done" onClick={onClose}>
        <Icon name="check" size={16} /> Concluído
      </button>
    </ModalOverlay>
  )
}
