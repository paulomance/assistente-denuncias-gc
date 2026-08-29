export interface OrganizedEvidenceAudio {
  steamId64: string
  displayName: string
  audioPath: string
}

/** Chat de texto exportado de um jogador — só existe quando o usuário marcou "incluir" na tela de seleção. */
export interface OrganizedEvidenceChat {
  steamId64: string
  displayName: string
  chatPath: string
}

export interface OrganizedEvidence {
  reportId: string
  reportDir: string
  audioFiles: OrganizedEvidenceAudio[]
  /** Vazio quando nenhum jogador selecionado teve chat incluído — nunca uma pasta `chat/` vazia criada à toa (ver EvidenceOrganizer.ts). */
  chatFiles: OrganizedEvidenceChat[]
  /**
   * ID da partida extraido do nome original da demo (ver
   * reportFolderName.ts::extractMatchIdFromDemoFileName) — mesmo valor
   * gravado em ReportMetadata.matchId, exposto aqui tambem para a UI
   * poder montar o link do formulario de denuncia da GC (B7) sem
   * reler o metadata.json. `null` quando o nome do arquivo nao segue o
   * padrao reconhecido (usuario renomeou a demo, por exemplo).
   */
  matchId: string | null
  /**
   * Mapa extraido do nome original da demo (ver
   * reportFolderName.ts::extractMapFromDemoFileName) — mesma garantia do
   * matchId: `null` quando o nome do arquivo nao segue o padrao
   * reconhecido, nunca inventado.
   */
  map: string | null
}

export type OrganizeEvidenceResult = ({ status: 'success' } & OrganizedEvidence) | { status: 'error' }

/**
 * Estados do ciclo de vida de uma denuncia, do ponto em que o audio e
 * organizado localmente ate (no futuro) o upload pro Google Drive.
 * Definido agora, mesmo sem o upload existir ainda, para que o
 * metadata.json de cada denuncia (ver EvidenceOrganizer.ts) nao precise
 * de migracao de esquema quando a B6 for implementada — so passa a
 * preencher os campos que ja existem. Tambem e a base natural para um
 * futuro historico de denuncias (bastaria listar as pastas em
 * "Documentos/Provas do Assistente de Denúncias GC" e ler cada metadata.json).
 */
export type ReportStatus = 'local' | 'uploading' | 'uploaded' | 'upload-failed'

export interface ReportDriveInfo {
  folderId: string
  fileIdsBySteamId64: Record<string, string>
  /** Rastreamento SEPARADO do de áudio — ver GoogleDriveProvider.ts::uploadReport. `?? {}` em toda leitura: metadata.json de antes desta rodada nunca tem este campo. */
  chatFileIdsBySteamId64?: Record<string, string>
  shareLink: string
  uploadedAt: string
}

/**
 * Checkpoint de um upload PARCIAL ou interrompido — gravado
 * incrementalmente durante `GoogleDriveProvider.uploadReport()` (apos
 * criar a pasta, e apos CADA arquivo enviado com sucesso), nao so no
 * final. Existe pra corrigir um bug real: antes, uma falha no meio do
 * envio (arquivo 3 de 5, por exemplo) descartava esse progresso por
 * completo — uma nova tentativa criava uma pasta NOVA no Drive do
 * zero, reenviando tudo de novo e deixando a pasta parcial anterior
 * orfa (nunca referenciada, nunca limpa) na conta do usuario. Com o
 * checkpoint persistido, uma nova tentativa reaproveita a MESMA pasta
 * e pula os arquivos que ja tem `fileId` real confirmado, enviando so
 * o que falta — nunca reenvia o que ja foi confirmado pelo Google.
 * `steamIdsFailedLastAttempt` existe so pra UI poder listar quem falhou
 * na ultima tentativa (ver DriveUploadPanel.tsx) — nao afeta a logica
 * de retomada, que sempre se baseia no que EXISTE em
 * `fileIdsBySteamId64`, nao no que falhou antes.
 */
export interface ReportDriveCheckpoint {
  folderId: string
  fileIdsBySteamId64: Record<string, string>
  /** Rastreamento SEPARADO do de áudio — ver GoogleDriveProvider.ts::uploadReport. */
  chatFileIdsBySteamId64: Record<string, string>
  steamIdsFailedLastAttempt: string[]
  chatSteamIdsFailedLastAttempt: string[]
}

export interface ReportMetadata {
  reportId: string
  createdAt: string
  originalDemoFileName: string
  /**
   * ID da partida extraido do nome original da demo, quando reconhecivel
   * (ver reportFolderName.ts). Metadado de conveniencia, nunca uma
   * dependencia — pode ser null se o usuario renomeou o arquivo.
   */
  matchId: string | null
  /** Ver OrganizedEvidence.map — mesma garantia (extraido ou null, nunca inventado). */
  map: string | null
  players: { steamId64: string; displayName: string }[]
  status: ReportStatus
  drive?: ReportDriveInfo
  /** So presente enquanto um upload parcial/interrompido ainda nao foi concluido — ver ReportDriveCheckpoint. */
  driveCheckpoint?: ReportDriveCheckpoint
}
