export interface CsgoveRunOptions {
  demoPath: string
  outputDir: string
}

/**
 * Estagios reais do processamento de uma demo — cada um corresponde a
 * uma operacao real e observavel, nunca um timer artificial fatiado em
 * pedacos arbitrarios. `identifying-players` e `getMatchTeams()`
 * (leitura da propria demo via @laihoe/demoparser2, independente do
 * CSGOVE) rodando ANTES do CSGOVE — reordenado nesta rodada
 * (csgoveHandlers.ts) porque essa chamada ja existia, so ficava
 * escondida DEPOIS do CSGOVE terminar (o usuario via "Extraindo os
 * áudios..." parado por alguns segundos enquanto, na verdade, uma
 * operacao diferente — e as vezes mais lenta, ver matchTeams.test.ts —
 * ja estava rodando sem nenhum feedback visual proprio). `analyzing`/
 * `extracting` continuam vindo do stdout real do CSGOVE (ver
 * csgoveStdout.ts) — nunca inferidos por tempo decorrido.
 */
export type CsgoveProgressStage = 'identifying-players' | 'analyzing' | 'extracting'

/**
 * Uma mensagem de chat de texto, ja na forma exposta a UI/relatorio —
 * sem `tick` nem `steamId64` (redundante aqui, o agrupamento por
 * jogador ja aconteceu em matchChat.ts). Ordem do array = ordem
 * cronologica real na demo (garantida por matchChat.ts, nunca
 * reordenada depois). `teamOnly` distingue chat de equipe do chat
 * geral — unico metadado que precisa ficar visivel pro usuario (nunca
 * o tick/timestamp, decisao explicita do usuario: preservar ordem
 * importa, o horario exato nao).
 */
export interface PlayerChatMessage {
  text: string
  teamOnly: boolean
}

export interface ExtractedVoice {
  /**
   * Ausente quando o jogador tem chat de texto mas nenhuma comunicacao
   * de voz capturavel (nao falou, ou o CSGOVE nao conseguiu extrair) —
   * ver csgoveHandlers.ts. Audio e chat sao evidencias INDEPENDENTES:
   * um jogador pode ter so um dos dois, os dois, ou (nesse caso) nem
   * apareceria na lista.
   */
  audioPath?: string
  steamId64: string
  rawPlayerName: string
  /**
   * Time/lado do jogador na partida, obtidos separadamente da extracao de
   * audio (nao vem do CSGOVE — ver matchTeams.ts, que le a propria demo
   * com @laihoe/demoparser2). Ausentes (undefined) logo apos o CSGOVE
   * rodar; preenchidos pelo handler antes de chegar na UI. `null` quando
   * a leitura de time falhou ou nao havia dado confiavel — nesse caso a
   * selecao de jogadores volta a lista simples, sem separar por equipe.
   */
  teamName?: string | null
  side?: 'CT' | 'T' | null
  /** Ausente/vazio = sem chat de texto — UI nunca mostra "Ver chat" nesse caso. */
  chatMessages?: PlayerChatMessage[]
  /**
   * Decisao do usuario (tela de selecao) de incluir o .wav do audio na
   * denuncia — ver EvidenceOrganizer.ts. Audio e chat sao evidencias
   * INDEPENDENTES: marcar uma nunca marca a outra automaticamente
   * (bug real corrigido nesta rodada — antes, `audioPath` existir era
   * suficiente pra copiar o audio, sem nenhum opt-in explicito do
   * usuario). So tem efeito real se `audioPath` tambem existir.
   */
  includeAudioInReport?: boolean
  /** Decisao do usuario (tela de selecao) de incluir o .txt do chat na denuncia — ver EvidenceOrganizer.ts. */
  includeChatInReport?: boolean
}

/**
 * Resultado bruto da execucao do CSGOVE. `success` reflete apenas o exit
 * code do processo — nao o numero de arquivos de audio encontrados. Uma
 * demo pode ser processada com sucesso (exit code 0) e ainda assim nao
 * conter nenhuma comunicacao de voz capturavel; isso e uma possibilidade
 * real do dominio, nao um erro do CsgoveRunner (confirmado na validacao
 * empirica da B2 — ver docs/plano-frente-b.md).
 */
export interface CsgoveResult {
  success: boolean
  exitCode: number | null
  outputDir: string
  audioFiles: ExtractedVoice[]
  stdout: string
  stderr: string
  durationMs: number
}

/**
 * Resultado ja traduzido para os casos que a camada de IPC/UI precisa
 * distinguir (ver docs/plano-frente-b.md, Fase B2 — tratamento de erro).
 * `success` com `audioFiles: []` e um caso valido e distinto de erro —
 * cabe a UI decidir como comunicar "nenhum audio encontrado".
 */
export type ProcessDemoResult =
  | { status: 'success'; audioFiles: ExtractedVoice[]; outputDir: string; durationMs: number }
  | { status: 'csgove-not-found' }
  | { status: 'csgove-failed'; exitCode: number | null }
  | { status: 'unexpected-error' }
  | { status: 'already-processing' }
