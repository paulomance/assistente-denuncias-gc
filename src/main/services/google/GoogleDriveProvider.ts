import { createReadStream, existsSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { google } from 'googleapis'
import { GoogleAuthManager } from './GoogleAuthManager'
import { GoogleApiError, mapGoogleError } from './GoogleApiError'
import type {
  CloudAuthStatus,
  CloudStorageErrorKind,
  CloudStorageProvider,
  CloudUploadedReportSummary,
  CloudUploadResult
} from '../../../shared/types/CloudStorage'
import type { UploadProgress } from '../../../shared/types/Drive'

function extractSteamId64(fileName: string): string {
  const match = fileName.match(/_(\d{15,20})\.(?:wav|txt)$/i)
  return match ? match[1] : fileName
}

/**
 * Lista os arquivos de um subdiretorio (audio/ ou chat/), na mesma
 * pasta de uma denuncia — nunca lanca se a pasta nao existir (chat/ so
 * existe quando pelo menos um jogador teve o chat incluido, ver
 * EvidenceOrganizer.ts; audio/ sempre existe, mas por simetria trata
 * os dois do mesmo jeito).
 */
function listFilesIn(dir: string): string[] {
  return existsSync(dir) ? readdirSync(dir).filter((fileName) => statSync(join(dir, fileName)).isFile()) : []
}

/**
 * Implementacao real do CloudStorageProvider para o Google Drive.
 *
 * `listUploadedReports` continua nao implementada de proposito: o
 * historico de denuncias (ver localReportsStore.ts) e local-first — le
 * os metadata.json existentes (que ja guardam `drive.folderId` apos um
 * upload bem-sucedido), sem precisar consultar o Drive so pra montar a
 * lista. `deleteUploadedReport` e usada de verdade quando o usuario
 * exclui uma denuncia do Drive pela tela de historico.
 */
export class GoogleDriveProvider implements CloudStorageProvider {
  private readonly authManager = new GoogleAuthManager()

  async getAuthStatus(): Promise<CloudAuthStatus> {
    return this.authManager.getAuthStatus()
  }

  async signIn(): Promise<void> {
    await this.authManager.signIn()
  }

  async signOut(): Promise<void> {
    await this.authManager.signOut()
  }

  /**
   * Cria uma pasta no Drive (ou REAPROVEITA uma existente, se
   * `resumeFrom` vier de uma tentativa anterior interrompida), envia
   * cada .wav de dentro de reportDir/audio que AINDA nao tem um
   * `fileId` confirmado, e so entao compartilha a pasta por link SE
   * TODOS os arquivos tiverem sido confirmados. Cada etapa so avanca
   * depois de uma resposta com ID real do Google — nunca consideramos
   * "enviado" so por nao ter lancado excecao ate aquele ponto (regra
   * explicita do usuario: nunca confirmar envio sem confirmacao real).
   *
   * Diferente da versao anterior desta funcao: uma falha em UM arquivo
   * nao aborta os demais — continua tentando o resto da lista, e
   * devolve `{status: 'partial', ...}` com quem falhou em vez de
   * lancar uma excecao que descartaria o progresso dos que deram
   * certo. Bug real corrigido nesta rodada: antes, uma falha parcial
   * fazia a PROXIMA tentativa criar uma pasta NOVA do zero (nunca
   * reaproveitando a anterior), deixando pastas orfas acumulando na
   * conta do Drive do usuario a cada retry. Com `resumeFrom` +
   * `onCheckpoint`, uma nova tentativa reaproveita a mesma pasta e so
   * envia o que falta.
   *
   * `onProgress` (opcional) e chamado com contagem REAL de arquivos
   * (nunca uma porcentagem inventada — ver UploadProgress em
   * shared/types/Drive.ts). `total` e conhecido de antemao (contagem
   * dos .wav em reportDir/audio antes de comecar), entao mesmo o
   * primeiro callback ja mostra "N ja confirmados de M" em vez de
   * aparecer do nada no meio do envio. `onCheckpoint` (opcional) e
   * chamado apos a pasta ser criada/confirmada e apos CADA arquivo
   * confirmado — quem chama pode persistir isso incrementalmente (ver
   * driveHandlers.ts), sobrevivendo ate a um fechamento inesperado do
   * app no meio do envio.
   */
  async uploadReport(
    reportDir: string,
    reportId: string,
    onProgress?: (progress: UploadProgress) => void,
    resumeFrom?: {
      folderId: string
      fileIdsBySteamId64: Record<string, string>
      /**
       * Rastreamento SEPARADO do de audio, de proposito — nunca uma
       * chave composta dentro do mesmo dicionario. Aditivo: opcional
       * (`?? {}`), entao retomar um checkpoint gravado ANTES desta
       * rodada (só áudio) continua funcionando sem nenhuma migração —
       * simplesmente não tinha chat pra retomar.
       */
      chatFileIdsBySteamId64?: Record<string, string>
    },
    onCheckpoint?: (checkpoint: {
      folderId: string
      fileIdsBySteamId64: Record<string, string>
      chatFileIdsBySteamId64: Record<string, string>
    }) => void
  ): Promise<CloudUploadResult> {
    const auth = await this.authManager.getAuthorizedClient()
    const drive = google.drive({ version: 'v3', auth })

    try {
      const audioFileNames = listFilesIn(join(reportDir, 'audio'))
      const chatFileNames = listFilesIn(join(reportDir, 'chat'))
      const total = audioFileNames.length + chatFileNames.length

      const fileIdsBySteamId64: Record<string, string> = { ...(resumeFrom?.fileIdsBySteamId64 ?? {}) }
      const chatFileIdsBySteamId64: Record<string, string> = { ...(resumeFrom?.chatFileIdsBySteamId64 ?? {}) }
      let completed = Object.keys(fileIdsBySteamId64).length + Object.keys(chatFileIdsBySteamId64).length

      // Bug real corrigido numa rodada anterior: sem esta checagem, uma
      // pasta `audio/` ausente ou vazia (arquivos removidos por fora do
      // app depois de organizados) fazia este método seguir em frente,
      // criar uma pasta VAZIA no Drive, compartilhá-la e retornar
      // `'success'` com um link real — uma falsa confirmação de envio
      // pra uma prova que na verdade não tinha nenhum arquivo dentro
      // (nem áudio, nem chat). `completed === 0` também cobre o caso de
      // retomar (`resumeFrom`) um checkpoint cujos arquivos sumiram
      // junto.
      if (total === 0 && completed === 0) {
        throw new GoogleApiError(
          'local-source-missing',
          'Nenhum arquivo de áudio ou chat encontrado localmente para esta prova.'
        )
      }

      onProgress?.({ stage: 'creating-folder', completed, total })

      let folderId = resumeFrom?.folderId ?? null
      if (!folderId) {
        const folderResponse = await drive.files.create({
          requestBody: { name: reportId, mimeType: 'application/vnd.google-apps.folder' },
          fields: 'id'
        })
        folderId = folderResponse.data.id ?? null
        if (!folderId) {
          throw new GoogleApiError('unexpected', 'Google Drive não retornou o ID da pasta criada.')
        }
      }
      onCheckpoint?.({ folderId, fileIdsBySteamId64, chatFileIdsBySteamId64 })

      const failedSteamIds: string[] = []
      const failedChatSteamIds: string[] = []
      // Achado real numa auditoria: o catch por arquivo descartava o
      // erro por completo (só empurrava o steamId64 pra lista de
      // falhas) — se a sessão expirasse ou a rede caísse NO MEIO do
      // lote, isso virava um 'partial' genérico indistinguível de
      // qualquer outra falha, e a UI nunca oferecia "reconectar" nesse
      // caso. Agora cada falha é classificada de verdade
      // (`mapGoogleError`, nunca o erro cru) — guarda a última
      // classificação encontrada, suficiente pra UI decidir se vale
      // oferecer reconexão em vez de só "tentar de novo".
      let lastErrorKind: CloudStorageErrorKind = 'unexpected'

      const uploadOne = async (
        dirName: 'audio' | 'chat',
        fileName: string,
        mimeType: string,
        confirmedIds: Record<string, string>,
        failedList: string[]
      ): Promise<void> => {
        const steamId64 = extractSteamId64(fileName)
        // Ja confirmado numa tentativa anterior (resumeFrom) ou nesta
        // mesma execucao — nunca reenvia o que o Google ja confirmou.
        if (confirmedIds[steamId64]) return

        const filePath = join(reportDir, dirName, fileName)
        try {
          const uploadResponse = await drive.files.create({
            requestBody: { name: fileName, parents: [folderId as string] },
            media: { mimeType, body: createReadStream(filePath) },
            fields: 'id'
          })
          if (!uploadResponse.data.id) {
            throw new Error('Google Drive não confirmou o envio deste arquivo.')
          }
          confirmedIds[steamId64] = uploadResponse.data.id
          completed += 1
          onProgress?.({ stage: 'uploading', completed, total })
          onCheckpoint?.({ folderId: folderId as string, fileIdsBySteamId64, chatFileIdsBySteamId64 })
        } catch (error) {
          // Falha de UM arquivo nao aborta os demais — continua
          // tentando o resto da lista (item real pedido pelo usuário:
          // diferenciar falha total de falha parcial).
          failedList.push(steamId64)
          lastErrorKind = mapGoogleError(error).kind
        }
      }

      for (const fileName of audioFileNames) {
        await uploadOne('audio', fileName, 'audio/wav', fileIdsBySteamId64, failedSteamIds)
      }
      for (const fileName of chatFileNames) {
        await uploadOne('chat', fileName, 'text/plain', chatFileIdsBySteamId64, failedChatSteamIds)
      }

      if (failedSteamIds.length > 0 || failedChatSteamIds.length > 0) {
        return {
          status: 'partial',
          folderId,
          fileIdsBySteamId64,
          chatFileIdsBySteamId64,
          failedSteamIds,
          failedChatSteamIds,
          errorKind: lastErrorKind
        }
      }

      onProgress?.({ stage: 'finalizing', completed: total, total })

      await drive.permissions.create({
        fileId: folderId,
        requestBody: { role: 'reader', type: 'anyone' }
      })

      const folderMeta = await drive.files.get({ fileId: folderId, fields: 'webViewLink' })
      const shareLink = folderMeta.data.webViewLink
      if (!shareLink) {
        throw new GoogleApiError('unexpected', 'Google Drive não retornou o link de compartilhamento.')
      }

      return { status: 'success', folderId, fileIdsBySteamId64, chatFileIdsBySteamId64, shareLink }
    } catch (error) {
      throw mapGoogleError(error)
    }
  }

  async listUploadedReports(): Promise<CloudUploadedReportSummary[]> {
    throw new GoogleApiError(
      'unexpected',
      'Listagem direto do Drive não implementada — o histórico usa os metadata.json locais.'
    )
  }

  /**
   * Exclui a pasta (e, em cascata, os arquivos dentro dela) do Drive do
   * usuário. Se a pasta já não existir mais (ex.: usuário excluiu
   * manualmente pelo próprio Google Drive antes), o Google retorna 404 —
   * mapeado para `not-found`, não um erro genérico, para a UI poder
   * tratar como "já não existe" em vez de "algo quebrou".
   */
  async deleteUploadedReport(folderId: string): Promise<void> {
    const auth = await this.authManager.getAuthorizedClient()
    const drive = google.drive({ version: 'v3', auth })
    try {
      await drive.files.delete({ fileId: folderId })
    } catch (error) {
      throw mapGoogleError(error)
    }
  }

  /**
   * So retorna `false` numa confirmacao REAL do Google (404, mapeado
   * para 'not-found' — mesma pasta ja excluida, seja pelo app ou
   * diretamente em drive.google.com). Qualquer outra falha (sessao
   * expirada, rede indisponivel) e relancada, nunca convertida em
   * `false` — do contrario um problema temporario de rede pareceria
   * "a prova sumiu", uma falsa acusacao (ver driveLinkVerification.ts,
   * que trata esse relancamento como 'check-failed').
   */
  async folderExists(folderId: string): Promise<boolean> {
    const auth = await this.authManager.getAuthorizedClient()
    const drive = google.drive({ version: 'v3', auth })
    try {
      const response = await drive.files.get({ fileId: folderId, fields: 'id,trashed' })
      return response.data.trashed !== true
    } catch (error) {
      const mapped = mapGoogleError(error)
      if (mapped.kind === 'not-found') return false
      throw mapped
    }
  }
}
