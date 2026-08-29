import { BrandMark } from './BrandMark'
import { Icon } from './Icon'

interface HeaderProps {
  onOpenHistory: () => void
  onOpenSettings: () => void
}

/**
 * Cabecalho persistente, visivel em qualquer tela do fluxo. "Minhas
 * provas" e "Configurações" sao dois pontos de entrada independentes e
 * igualmente visiveis aqui — antes o historico só existia escondido
 * dentro de Configurações, o que o usuario apontou como um problema real
 * de descoberta ("o histórico é uma funcionalidade importante demais
 * para ficar escondida"). Configuracoes continua sendo o unico ponto de
 * entrada para pasta local e conexao com o Google Drive.
 */
export function Header({ onOpenHistory, onOpenSettings }: HeaderProps): React.JSX.Element {
  return (
    <header className="app-header">
      <div className="app-header__identity">
        <BrandMark size={24} />
        {/* Sem "GC" aqui: o proprio BrandMark ja mostra "GC" (monograma) logo
            antes deste texto, entao repeti-lo no titulo era redundante —
            pedido explicito do usuario. O titulo da JANELA (index.html) e o
            productName (package.json) continuam com "GC" no final, de
            proposito — sao identidades diferentes, nao a mesma string. */}
        <p className="app-header__title">Assistente de Denúncias</p>
        <span className="beta-badge">Beta</span>
      </div>
      <div className="app-header__actions">
        <button type="button" className="app-header__nav-button" onClick={onOpenHistory}>
          <Icon name="history" size={17} />
          Minhas provas
        </button>
        <button
          type="button"
          className="app-header__icon-button"
          onClick={onOpenSettings}
          title="Configurações"
          aria-label="Configurações"
        >
          <Icon name="settings" size={20} />
        </button>
      </div>
    </header>
  )
}
