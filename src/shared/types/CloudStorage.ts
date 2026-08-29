/**
 * Contrato de armazenamento em nuvem para as evidencias. GoogleDriveProvider
 * sera a primeira implementacao (Fase B6, bloqueada em credenciais OAuth
 * fornecidas pelo usuario) — o resto do app (EvidenceOrganizer, UI) nao
 * deve depender de nada especifico do Google.
 *
 * So os TIPOS estao definidos aqui, de proposito — nenhum codigo de OAuth
 * ou de chamada a API sera escrito sem poder ser validado com credenciais
 * reais (mesma disciplina do CsgoveRunner: nada de codigo baseado em
 * suposicao sobre um sistema externo). Isto existe agora so para que a UI
 * e o restante do pipeline possam ser desenhados sem depender dos
 * detalhes internos do Google Drive, e para documentar decisoes de
 * arquitetura já tomadas antes da implementacao (histórico de denúncias,
 * gerenciamento de espaço, login separado do conceito de "logado na
 * Gamers Club") — ver docs/plano-frente-b.md.
 */

import type { UploadProgress } from './Drive'

export type CloudAuthStatus = 'signed-out' | 'signed-in'

/**
 * `'success'`: todos os arquivos confirmados + link de compartilhamento
 * obtido. `'partial'`: pelo menos um arquivo foi enviado com sucesso,
 * mas pelo menos um outro falhou — a pasta e os arquivos que
 * funcionaram continuam no Drive (nunca descartados), mas o link de
 * compartilhamento so e criado quando TUDO estiver confirmado (mesma
 * regra de sempre: nunca confirmar como "pronta" sem confirmacao
 * real e completa). `failedSteamIds` deixa a UI explicita sobre QUEM
 * falhou, nao so "algo deu errado". `errorKind` (achado real numa
 * auditoria: antes esse dado era descartado por um `catch` mudo por
 * arquivo) classifica a falha mais recente entre os arquivos que
 * falharam — permite a UI diferenciar "sessão expirada, precisa
 * reconectar" de qualquer outra falha, em vez de sempre oferecer só
 * "tentar de novo" mesmo quando repetir a chamada vai falhar de novo
 * com o mesmo erro.
 */
export type CloudUploadResult =
  | {
      status: 'success'
      folderId: string
      fileIdsBySteamId64: Record<string, string>
      /** Rastreamento SEPARADO do de áudio, de propósito — ver GoogleDriveProvider.ts::uploadReport. */
      chatFileIdsBySteamId64: Record<string, string>
      shareLink: string
    }
  | {
      status: 'partial'
      folderId: string
      fileIdsBySteamId64: Record<string, string>
      chatFileIdsBySteamId64: Record<string, string>
      failedSteamIds: string[]
      failedChatSteamIds: string[]
      errorKind: CloudStorageErrorKind
    }

/**
 * Resumo de uma denuncia ja enviada, o suficiente para uma futura tela de
 * historico/gerenciamento listar e permitir excluir sem precisar buscar
 * detalhe por detalhe.
 */
export interface CloudUploadedReportSummary {
  folderId: string
  reportId: string
  createdAt: string
  playerCount: number
  totalSizeBytes: number
}

/**
 * Categorias de erro que a UI precisa distinguir para dar uma mensagem
 * amigavel — nunca o texto cru de erro do Google (ex.: "401
 * invalid_grant"). Nao e uma lista definitiva: sera ajustada com erros
 * reais observados quando a B6 for implementada de fato, mas mapeia as
 * situacoes ja identificadas como necessarias.
 */
export type CloudStorageErrorKind =
  | 'not-signed-in'
  | 'auth-cancelled'
  | 'auth-expired'
  | 'invalid-client-config'
  | 'network-unavailable'
  | 'upload-interrupted'
  | 'quota-exceeded'
  | 'not-found'
  | 'permission-denied'
  | 'already-uploading'
  /**
   * A pasta local desta prova (ou os áudios dentro dela) não existe
   * mais no computador do usuário no momento do envio — nunca um erro
   * do Google, então nunca deve receber a mesma mensagem genérica de
   * falha de envio (achado real: antes disso caía em 'unexpected',
   * uma mensagem enganosa que dizia "suas evidências continuam salvas
   * neste computador", exatamente o oposto do que aconteceu). Só
   * alcançável por uma condição de corrida real: o histórico mostrava
   * a prova como disponível localmente, mas ela foi removida por fora
   * do app (Explorer, outro processo, HD externo desconectado) entre a
   * listagem e o clique em enviar/reenviar.
   */
  | 'local-source-missing'
  | 'unexpected'

/**
 * Interface que qualquer provider (Google Drive, e futuramente
 * Dropbox/OneDrive se fizer sentido) deve implementar.
 *
 * Principio importante: um erro em qualquer um desses metodos NUNCA deve
 * apagar/invalidar a evidencia local ja organizada pelo EvidenceOrganizer
 * — o app so deve marcar o metadata.json (ver ReportMetadata em
 * shared/types/Evidence.ts) como `status: 'upload-failed'` e manter o
 * arquivo local intacto para uma nova tentativa.
 */
export interface CloudStorageProvider {
  getAuthStatus(): Promise<CloudAuthStatus>
  signIn(): Promise<void>
  signOut(): Promise<void>

  uploadReport(
    reportDir: string,
    reportId: string,
    onProgress?: (progress: UploadProgress) => void,
    resumeFrom?: { folderId: string; fileIdsBySteamId64: Record<string, string> }
  ): Promise<CloudUploadResult>

  listUploadedReports(): Promise<CloudUploadedReportSummary[]>
  deleteUploadedReport(folderId: string): Promise<void>

  /**
   * Confirma se uma pasta AINDA existe no Drive (nao apagada nem
   * movida pra lixeira) — usado antes de deixar o usuario copiar/abrir
   * um link, pra nunca tratar um link morto como se fosse valido (ver
   * verifyDriveLink em driveLinkVerification.ts). So retorna `false`
   * numa confirmacao real e definitiva do Google (404/nao encontrado);
   * qualquer outra falha (rede, sessao expirada) deve ser relancada —
   * nunca interpretada como "a pasta nao existe", que seria uma falsa
   * acusacao.
   */
  folderExists(folderId: string): Promise<boolean>
}
