import { useCallback, useState } from 'react'
import { Icon, type IconName } from './Icon'
import { ModalOverlay } from './ModalOverlay'
import { friendlyDriveErrorMessage } from '../utils/friendlyDriveErrorMessage'
import { buildGamersClubReportUrl } from '../utils/gamersClubReportUrl'
import { buildGamersClubMatchUrl } from '../utils/gamersClubMatchUrl'
import type { ReportHistoryEntry } from '../../../shared/types/History'

type ItemAction =
  | 'none'
  | 'confirm-delete-local'
  | 'confirm-delete-drive'
  | 'deleting-local'
  | 'deleting-drive'
  | 'uploading'

interface HistoryItemProps {
  report: ReportHistoryEntry
  onChanged: () => void
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('pt-BR')
  } catch {
    return iso
  }
}

/**
 * Deriva o texto de status dos 2 fatos reais (existe localmente? existe
 * no Drive?), nunca de um valor guardado à parte — exatamente o modelo
 * de 4 estados pedido explicitamente pelo usuário (local+Drive / só
 * local / só Drive / nenhum dos dois, esse último nem aparece na
 * lista). `report.status === 'uploaded'` já é a fonte da verdade de "há
 * cópia no Drive" (tanto pra denúncias com pasta local quanto pras do
 * índice "só Drive" — ver `driveOnlyReportsIndex.ts`), e
 * `report.hasLocalCopy` já reflete o filesystem de verdade a cada
 * listagem — nunca um estado obsoleto guardado em memória.
 */
function statusInfo(report: ReportHistoryEntry): { text: string; className: string; icon: IconName | null } {
  if (report.status === 'uploaded') {
    if (report.hasLocalCopy) {
      return {
        text: 'No computador e no Google Drive',
        className: 'demo-summary__status--ready',
        icon: 'check'
      }
    }
    return { text: 'Só no Google Drive', className: 'demo-summary__status--ready', icon: 'check' }
  }
  if (report.status === 'uploading') {
    return { text: 'Envio em andamento...', className: 'demo-summary__status--pending', icon: null }
  }
  if (report.status === 'upload-failed') {
    return { text: 'Envio anterior falhou', className: 'demo-summary__status--error', icon: 'alert' }
  }
  return { text: 'Só neste computador', className: 'demo-summary__status--pending', icon: null }
}

/**
 * Uma denuncia do historico, com as acoes seguras de gerenciamento.
 * "Excluir do computador" e "Excluir do Google Drive" sao acoes
 * INDEPENDENTES — cada uma aparece exatamente quando a copia
 * correspondente existe de verdade (`report.hasLocalCopy`/
 * `report.driveFolderId`), nunca uma dependendo do estado da outra.
 * Bug real corrigido nesta rodada: a versao anterior escondia "Excluir
 * do computador" depois que "Excluir do Google Drive" era usado
 * primeiro (o backend exigia `status === 'uploaded'`, que a exclusao do
 * Drive reverte pra `'local'`) — as duas acoes agora sao avaliadas de
 * forma totalmente independente, e o diálogo de confirmação do
 * "Excluir do computador" fica mais enfático quando não há cópia no
 * Drive no momento (ou seja, seria a última cópia). O botao da acao em
 * andamento continua visivel (com estado de carregamento), em vez de
 * sumir e virar um paragrafo solto — mantem a hierarquia visual estavel
 * enquanto a operacao roda.
 */
export function HistoryItem({ report, onChanged }: HistoryItemProps): React.JSX.Element {
  const [action, setAction] = useState<ItemAction>('none')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isVerifyingDriveLink, setIsVerifyingDriveLink] = useState(false)
  // Mensagem transitória só pra dar feedback explícito logo após a
  // exclusão do Drive ("Prova excluída do Google Drive") — o estado
  // PERMANENTE já vem certo de `statusInfo(report)` assim que a lista é
  // recarregada (ver onChanged), isto é só o reforço imediato pedido
  // explicitamente pelo usuário no momento da ação.
  const [justDeletedFromDrive, setJustDeletedFromDrive] = useState(false)

  const names = report.players.map((p) => p.displayName.trim()).join(', ') || '(sem jogadores)'
  const status = statusInfo(report)
  const isBusy = action !== 'none'
  const matchUrl = buildGamersClubMatchUrl(report.matchId)

  const handleOpenFolder = useCallback(() => {
    void window.gcReport.openEvidenceFolder(report.folderPath)
  }, [report.folderPath])

  const handleUpload = useCallback(async () => {
    setAction('uploading')
    setErrorMessage(null)
    try {
      const result = await window.gcReport.uploadReportToDrive(report.folderPath, report.reportId)
      if (result.status === 'success') {
        onChanged()
      } else if (result.status === 'partial') {
        // A pasta e os arquivos que deram certo continuam no Drive
        // (nunca descartados) — "Tentar enviar de novo" reaproveita o
        // checkpoint salvo e so reenvia quem falhou (ver
        // driveHandlers.ts). onChanged() atualiza `report.status` pra
        // 'upload-failed', o que ja troca o texto do botao. Mesma
        // classificação de causa raiz do branch de erro total logo
        // abaixo — uma falha parcial cuja causa é a SESSÃO com o
        // Google (achado real: antes isso era descartado por arquivo,
        // sempre virava um "partial" genérico) também aponta pra
        // Configurações em vez de deixar o usuário clicando "Tentar
        // enviar de novo" repetidamente sem entender por quê continua
        // falhando.
        const isAuthIssue =
          result.errorKind === 'auth-expired' ||
          result.errorKind === 'not-signed-in' ||
          result.errorKind === 'permission-denied'
        const failedNames = result.failedPlayers.map((p) => `${p.displayName} — áudio`).join(', ')
        const reconnectHint = isAuthIssue ? ' Vá em Configurações → Google Drive para reconectar.' : ''
        setErrorMessage(
          `Algumas provas não foram enviadas — ${result.completed} de ${result.total} arquivos foram enviados com sucesso. Não foi possível enviar: ${failedNames}${reconnectHint}`
        )
        onChanged()
      } else {
        // "Tentar enviar de novo" sozinho nao resolve um problema de
        // SESSAO (token expirado/revogado, nao conectado, permissao
        // negada) — esta tela nao tem um botao direto de reconectar
        // (isso vive em Configuracoes), entao a mensagem aponta
        // explicitamente pra la em vez de deixar o usuario clicando no
        // mesmo botao repetidamente sem entender por que continua
        // falhando.
        const isAuthIssue =
          result.errorKind === 'auth-expired' ||
          result.errorKind === 'not-signed-in' ||
          result.errorKind === 'permission-denied'
        setErrorMessage(
          isAuthIssue
            ? `${friendlyDriveErrorMessage(result.errorKind)} Vá em Configurações → Google Drive para reconectar, depois tente enviar de novo.`
            : friendlyDriveErrorMessage(result.errorKind)
        )
      }
    } catch {
      setErrorMessage(friendlyDriveErrorMessage('unexpected'))
    } finally {
      // Sempre volta pra 'none', sucesso ou erro. `report` (prop) é
      // atualizado pelo reload que `onChanged()` dispara no pai, mas o
      // estado `action` é local deste componente — sem isso aqui, um
      // envio bem-sucedido deixava o botão preso em "Enviando..." pra
      // sempre (bug real encontrado em teste manual, não hipotético).
      setAction('none')
    }
  }, [report.folderPath, report.reportId, onChanged])

  const handleDeleteLocal = useCallback(async () => {
    setAction('deleting-local')
    try {
      const result = await window.gcReport.deleteLocalReportCopy(report.folderPath)
      if (result.status === 'success') {
        onChanged()
      } else if (result.reason === 'upload-in-progress') {
        setErrorMessage('Aguarde o envio ao Google Drive terminar antes de excluir a cópia local.')
      } else {
        setErrorMessage('Não foi possível excluir a cópia local.')
      }
    } catch {
      setErrorMessage('Não foi possível excluir a cópia local.')
    } finally {
      setAction('none')
    }
  }, [report.folderPath, onChanged])

  const handleDeleteFromDrive = useCallback(async () => {
    if (!report.driveFolderId) return
    setAction('deleting-drive')
    try {
      const result = await window.gcReport.deleteReportFromDrive(report.folderPath, report.driveFolderId)
      if (result.status === 'success') {
        // Erro real corrigido nesta rodada: a exclusão em si já era
        // segura (o `catch`/`else` abaixo sempre preservou o estado
        // real em caso de falha), mas nada avisava explicitamente o
        // usuário DE VERDADE excluiu — a tela só ia direto pro novo
        // estado sem confirmação. `onChanged()` continua disparando o
        // recarregamento real da lista (fonte da verdade); esta
        // mensagem é só reforço visual imediato, nunca substitui isso.
        setJustDeletedFromDrive(true)
        setTimeout(() => setJustDeletedFromDrive(false), 4000)
        onChanged()
      } else {
        setErrorMessage(friendlyDriveErrorMessage(result.errorKind))
      }
    } catch {
      setErrorMessage(friendlyDriveErrorMessage('unexpected'))
    } finally {
      setAction('none')
    }
  }, [report.folderPath, report.driveFolderId, onChanged])

  /**
   * Mesma confirmação robusta usada em DriveUploadPanel.tsx antes de
   * abrir o link do Drive — nunca trata `report.driveShareLink` como
   * eternamente válido só porque o metadata local ainda tem a
   * referência (a pasta pode ter sido excluída direto em
   * drive.google.com, fora do app). Se a exclusão for confirmada,
   * autocura o estado local (ver driveLinkVerification.ts) e chama
   * `onChanged()` pra "Minhas provas" refletir isso imediatamente, sem
   * esperar o usuário fechar/reabrir a lista.
   */
  const handleOpenDrive = useCallback(async () => {
    if (!report.driveShareLink) return
    setIsVerifyingDriveLink(true)
    try {
      const result = await window.gcReport.verifyDriveLink(report.folderPath)
      if (result.status === 'not-found') {
        setErrorMessage('A pasta desta prova foi excluída do Google Drive. O link não está mais disponível.')
        onChanged()
        return
      }
      const shareLink = result.status === 'exists' ? result.shareLink : report.driveShareLink
      window.open(shareLink, '_blank', 'noreferrer')
    } catch {
      window.open(report.driveShareLink, '_blank', 'noreferrer')
    } finally {
      setIsVerifyingDriveLink(false)
    }
  }, [report.folderPath, report.driveShareLink, onChanged])

  return (
    <li className="history-item">
      <p className="history-item__names">{names}</p>
      <p className="history-item__meta">
        {formatDate(report.createdAt)}
        {matchUrl && (
          <>
            {' · '}
            <a
              href={matchUrl}
              target="_blank"
              rel="noreferrer"
              className="history-item__match-link"
              title="Abrir a página da partida na Gamers Club"
            >
              Partida #{report.matchId}
              <Icon name="external" size={10} />
            </a>
          </>
        )}
        {report.map ? ` · ${report.map}` : ''} · {report.players.length} jogador
        {report.players.length === 1 ? '' : 'es'}
        {report.hasLocalCopy
          ? ` · ${formatSize(report.localSizeBytes)} neste computador`
          : ' · sem cópia local'}
      </p>
      <p className={`demo-summary__status ${status.className}`}>
        {status.icon && <Icon name={status.icon} size={14} />} {status.text}
      </p>

      {justDeletedFromDrive && (
        <p className="demo-summary__status demo-summary__status--pending">
          <Icon name="check" size={14} /> Prova excluída do Google Drive
        </p>
      )}

      {errorMessage && (
        <p className="drop-zone__error">
          <Icon name="alert" size={14} /> {errorMessage}
        </p>
      )}

      <div className="history-item__actions">
        {report.hasLocalCopy && (
          <button
            type="button"
            className="btn btn--link"
            onClick={handleOpenFolder}
            disabled={isBusy}
          >
            <Icon name="folder" size={14} /> Abrir pasta
          </button>
        )}

        {report.driveShareLink && (
          <button
            type="button"
            className="btn btn--link"
            onClick={handleOpenDrive}
            disabled={isVerifyingDriveLink}
          >
            <Icon name="drive" size={14} /> {isVerifyingDriveLink ? 'Verificando...' : 'Abrir no Drive'}
          </button>
        )}

        {report.matchId && (
          <a
            href={buildGamersClubReportUrl(report.matchId)}
            target="_blank"
            rel="noreferrer"
            className="btn btn--link"
            title="Volte pra cá se você preparou a prova mas ainda não terminou o formulário"
          >
            <Icon name="external" size={14} /> Continuar para o formulário de denúncia
          </a>
        )}

        {report.status !== 'uploaded' && report.hasLocalCopy && (action === 'none' || action === 'uploading') && (
          <button
            type="button"
            className={action === 'uploading' ? 'btn btn--primary btn--loading' : 'btn btn--primary'}
            onClick={handleUpload}
            disabled={action === 'uploading'}
          >
            <Icon name="send" size={15} />{' '}
            {report.status === 'upload-failed'
              ? 'Tentar enviar de novo'
              : report.status === 'uploading'
                ? // Só chega aqui se o envio ficou "preso" nesse status —
                  // ex.: o app fechou/travou no meio de um envio anterior
                  // (ver PendingReportBanner.tsx, que cobre o caso mais
                  // comum logo ao reabrir o app; este botão cobre quem
                  // chega até aqui direto pelo histórico). O clique
                  // reaproveita o checkpoint salvo — nunca reenvia o que
                  // já foi confirmado — então "Continuar envio" descreve
                  // melhor o que realmente acontece do que "Enviar ao
                  // Drive", que soa como começar do zero.
                  'Continuar envio'
                : 'Enviar ao Drive'}
          </button>
        )}

      </div>

      {report.hasLocalCopy || report.driveFolderId ? (
        <div className="history-item__danger-zone">
          {report.hasLocalCopy && report.status !== 'uploading' && action === 'none' && (
            <button
              type="button"
              className="btn btn--danger btn--small"
              onClick={() => setAction('confirm-delete-local')}
            >
              <Icon name="trash" size={13} /> Excluir do computador
            </button>
          )}
          {report.driveFolderId && action === 'none' && (
            <button
              type="button"
              className="btn btn--danger btn--small"
              onClick={() => setAction('confirm-delete-drive')}
            >
              <Icon name="trash" size={13} /> Excluir do Google Drive
            </button>
          )}
        </div>
      ) : null}

      {(action === 'confirm-delete-local' || action === 'deleting-local') && (
        <div
          className={
            report.driveFolderId ? 'history-item__confirm' : 'history-item__confirm history-item__confirm--danger'
          }
        >
          <p className="settings-overlay__section-title">
            <Icon name="alert" size={14} /> Excluir do computador?
          </p>
          <p className="settings-overlay__section-note">
            {report.driveFolderId ? (
              <>
                Isso remove todos os áudios desta prova guardados neste computador (a pasta
                inteira desta denúncia). A cópia enviada ao seu Google Drive{' '}
                <strong>não será afetada</strong> — você continua podendo gerenciá-la por aqui.
              </>
            ) : (
              <>
                Esta é a <strong>única cópia</strong> desta prova — não há cópia no Google Drive
                no momento. Depois de excluída, ela <strong>não poderá ser recuperada</strong>.
              </>
            )}
          </p>
          <div className="settings-overlay__confirm-actions">
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => setAction('none')}
              disabled={action === 'deleting-local'}
            >
              Cancelar
            </button>
            <button
              type="button"
              className={action === 'deleting-local' ? 'btn btn--danger btn--loading' : 'btn btn--danger'}
              onClick={handleDeleteLocal}
              disabled={action === 'deleting-local'}
            >
              Excluir do computador
            </button>
          </div>
        </div>
      )}

      {(action === 'confirm-delete-drive' || action === 'deleting-drive') && (
        <ModalOverlay
          title="Excluir prova do Google Drive?"
          onClose={() => {
            if (action !== 'deleting-drive') setAction('none')
          }}
          panelClassName="confirm-modal"
        >
          <p className="confirm-modal__message">
            Esta pasta contém a prova gerada para a sua denúncia e deve ser mantida disponível até
            que o formulário seja analisado pela equipe da Gamers Club.
            <br />
            <br />
            Excluir esta pasta antes da conclusão da análise poderá impedir o acesso às provas
            enviadas e fazer com que a denúncia seja invalidada.
            <br />
            <br />
            Tem certeza de que deseja continuar?
          </p>
          <div className="confirm-modal__actions">
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => setAction('none')}
              disabled={action === 'deleting-drive'}
              autoFocus
            >
              Manter prova no Google Drive
            </button>
            <button
              type="button"
              className={action === 'deleting-drive' ? 'btn btn--danger btn--loading' : 'btn btn--danger'}
              onClick={handleDeleteFromDrive}
              disabled={action === 'deleting-drive'}
            >
              <Icon name="trash" size={14} /> Excluir prova permanentemente
            </button>
          </div>
        </ModalOverlay>
      )}
    </li>
  )
}
