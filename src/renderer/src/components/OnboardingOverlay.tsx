import { ModalOverlay } from './ModalOverlay'
import { Icon } from './Icon'

interface OnboardingOverlayProps {
  onClose: () => void
}

const FLOW_STEPS = ['Demo da partida', 'Selecionar jogadores', 'Comunicações de voz e texto', 'Prova', 'Denúncia']

/**
 * Explicacao curta e opcional do que o app faz, aberta pelo icone "?" na
 * tela inicial (nunca aberta sozinha/automaticamente — nao e um tutorial
 * obrigatorio). Reaproveita o mesmo ModalOverlay das outras telas
 * (Configuracoes/Historico) por consistencia visual e pra ganhar de
 * graca o fechamento por Esc/clique fora/foco automatico.
 */
export function OnboardingOverlay({ onClose }: OnboardingOverlayProps): React.JSX.Element {
  return (
    <ModalOverlay title="O que este aplicativo faz?" onClose={onClose} panelClassName="onboarding-overlay">
      <p className="onboarding-overlay__lead">
        Feito para situações específicas de toxicidade por comunicação de voz ou texto em
        partidas de Counter-Strike. Projeto independente, feito pela comunidade.
      </p>
      <p className="onboarding-overlay__text">
        A partir da demo da partida, o aplicativo identifica os jogadores e deixa você ouvir o
        áudio e ler o texto de cada um antes de decidir quem quer denunciar. Depois,
        organiza a comunicação de voz e/ou de texto selecionada como uma prova — pronta para gerar
        o link que você vai colar no formulário de denúncia da plataforma onde a partida
        aconteceu. Um processo que antes precisava ser feito manualmente, agora em poucos cliques.
      </p>

      <div className="onboarding-overlay__flow" aria-hidden="true">
        {FLOW_STEPS.map((step, index) => (
          <div className="onboarding-overlay__flow-item" key={step}>
            <span className="onboarding-overlay__flow-step">{step}</span>
            {index < FLOW_STEPS.length - 1 && (
              <Icon name="chevron-right" size={14} className="onboarding-overlay__flow-arrow" />
            )}
          </div>
        ))}
      </div>

      <p className="onboarding-overlay__note">
        O aplicativo não substitui o formulário de denúncia da Gamers Club — ele só prepara a
        prova de voz e/ou texto pra você anexar lá. É focado nesse fluxo específico, não serve
        para outros tipos de denúncia.
      </p>

      <button type="button" className="btn btn--primary onboarding-overlay__done" onClick={onClose}>
        Entendi
      </button>
    </ModalOverlay>
  )
}
