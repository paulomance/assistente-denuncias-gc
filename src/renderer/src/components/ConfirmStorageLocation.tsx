import { Icon } from './Icon'
import type { EvidenceStorageInfo } from '../../../shared/types/Settings'

interface ConfirmStorageLocationProps {
  storageInfo: EvidenceStorageInfo
  onChooseFolder: () => void
  onBack: () => void
  onStart: () => void
}

/**
 * Mostrada SEMPRE depois de "Continuar com esta demo" — decisao revista
 * nesta rodada (antes pulava essa tela quando ja havia uma pasta
 * configurada, mas o usuario relatou que isso escondia demais a decisao
 * de onde os arquivos vao parar). 3 variantes de copy, nunca inventando
 * urgencia que nao existe:
 *   1. `rootDirMissing` — a pasta escolhida antes sumiu, precisa de uma nova.
 *   2. `!isConfigured` — primeira denuncia, nunca escolheu nada.
 *   3. ja configurada e presente — so confirma o caminho, "Iniciar
 *      processamento" continua a um clique, sem fingir que ha uma
 *      decisao nova a tomar.
 */
export function ConfirmStorageLocation({
  storageInfo,
  onChooseFolder,
  onBack,
  onStart
}: ConfirmStorageLocationProps): React.JSX.Element {
  const isMissing = storageInfo.rootDirMissing
  const isFirstTime = !storageInfo.isConfigured && !isMissing

  const title = isMissing
    ? 'Precisamos de uma nova pasta para continuar'
    : isFirstTime
      ? 'Escolha onde suas provas serão salvas'
      : 'Esta prova será salva em:'

  const note = isMissing
    ? 'A pasta que você escolheu antes não está mais disponível agora (um HD externo desconectado é a causa mais comum). Escolha um novo local para continuar — a partir daí, suas denúncias voltam a usar essa pasta automaticamente, sem perguntar de novo.'
    : isFirstTime
      ? 'O aplicativo cria automaticamente uma pasta para cada denúncia e organiza os áudios dentro dela — você não precisa criar nada manualmente. É só desta vez: a partir da próxima denúncia, o app usa esse mesmo lugar automaticamente, sem perguntar de novo.'
      : 'Essa é a pasta que você já configurou. O aplicativo vai criar uma pasta específica para esta denúncia dentro dela.'

  return (
    <div className="demo-summary">
      <p className="demo-summary__title">{title}</p>

      <p className="demo-summary__note">{note}</p>

      <p className="demo-summary__path demo-summary__path--boxed" title={storageInfo.managedDir}>
        <Icon name="folder" size={13} /> {storageInfo.managedDir}
      </p>

      <button type="button" className="btn btn--link demo-summary__link-button" onClick={onChooseFolder}>
        {isFirstTime || isMissing ? 'Escolher pasta' : 'Alterar pasta'}
      </button>

      <div className="demo-summary__actions">
        <button type="button" className="btn btn--secondary" onClick={onBack}>
          Voltar
        </button>
        <button type="button" className="btn btn--primary" onClick={onStart} disabled={isMissing}>
          Iniciar processamento
        </button>
      </div>
    </div>
  )
}
