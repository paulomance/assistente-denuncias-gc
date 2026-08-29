import { copyFileSync, existsSync, mkdirSync, renameSync, writeFileSync } from 'fs'
import { basename, join } from 'path'
import { getManagedEvidenceDir } from './AppSettings'
import {
  buildReportFolderName,
  extractMapFromDemoFileName,
  extractMatchIdFromDemoFileName
} from './reportFolderName'
import { sanitizeFileNameSegment } from './sanitizeFileNameSegment'
import type { ExtractedVoice } from '../../shared/types/Csgove'
import type { OrganizedEvidence, ReportMetadata } from '../../shared/types/Evidence'

/**
 * Formato do .txt de chat exportado — uma linha por mensagem, ORDEM
 * PRESERVADA (o array ja chega ordenado cronologicamente, ver
 * matchChat.ts — nunca reordenado aqui). So a categoria (geral/equipe)
 * fica visivel, nunca um horario/tick — decisao explicita do usuario:
 * preservar ordem importa, o instante exato nao.
 */
function formatChatFileContents(messages: { text: string; teamOnly: boolean }[]): string {
  return messages.map((message) => `[${message.teamOnly ? 'TIME' : 'GERAL'}] ${message.text}`).join('\n') + '\n'
}

/**
 * Organiza os audios dos jogadores SELECIONADOS (nao todos os extraidos)
 * numa pasta persistente, legivel pelo usuario e configuravel (ver
 * AppSettings.ts), com um metadata.json descrevendo o que foi incluido.
 * Nao copia a demo original — ela e grande (300+ MB, ver B1) e nao e a
 * "prova" em si, so o audio importa para a denuncia.
 *
 * Estrutura: <raiz escolhida pelo usuario, ou Documentos>/Provas do
 * Assistente de Denuncias GC/<ID da partida ou data> - <jogadores>/audio/*.wav +
 * metadata.json. Nomes de pasta colidentes (mesma partida/jogadores
 * processados de novo) recebem um sufixo " (2)", " (3)"... — nunca
 * sobrescrevem uma denuncia existente silenciosamente.
 *
 * Isso so organiza localmente. Upload (Google Drive, Fase B6) ainda nao
 * existe — ver docs/plano-frente-b.md.
 */
export class EvidenceOrganizer {
  organize(demoPath: string, selectedPlayers: ExtractedVoice[]): OrganizedEvidence {
    const reportId = this.generateReportId()
    const demoFileName = basename(demoPath)
    const matchId = extractMatchIdFromDemoFileName(demoFileName)
    const map = extractMapFromDemoFileName(demoFileName)
    const managedRoot = getManagedEvidenceDir()
    mkdirSync(managedRoot, { recursive: true })

    const folderName = buildReportFolderName(
      demoFileName,
      selectedPlayers.map((player) => player.rawPlayerName)
    )
    const finalDir = this.resolveUniqueDirectory(managedRoot, folderName)

    // Constroi tudo numa pasta de STAGING (nome reconhecivel, nunca
    // colide com `resolveUniqueDirectory` porque este sufixo nunca e
    // usado por uma denuncia real) e só move pra `finalDir` — via
    // `renameSync`, atomico no mesmo volume — depois que TODOS os
    // audios e o metadata.json ja estao escritos com sucesso. Achado
    // real numa auditoria (nao hipotetico): antes, se o app fosse
    // fechado/travasse no meio do loop de copia, ficava uma pasta com
    // audio/ parcial e SEM metadata.json na raiz gerenciada —
    // `listLocalReports()` ignora qualquer pasta sem metadata.json
    // (nunca vira uma denuncia "quebrada" visivel), entao esse lixo
    // ficava invisivel e nunca era limpo, ocupando espaco em disco pra
    // sempre. Com staging+rename, um crash no meio do processo deixa
    // só a pasta `.montando-...` (nunca `finalDir`), que
    // `cleanupOrphanedStagingFolders` varre e remove no proximo start
        // (ver tempOutputCleanup.ts).
    const stagingDir = `${finalDir}.montando-${process.pid}-${Date.now()}`
    const audioDir = join(stagingDir, 'audio')
    const chatDir = join(stagingDir, 'chat')
    mkdirSync(audioDir, { recursive: true })

    // Audio e chat sao evidencias INDEPENDENTES (decisao explicita do
    // usuario) — um jogador selecionado pode ter só um dos dois, os
    // dois, ou (raro, mas possivel) nenhum arquivo, so entrando na lista
    // de `players` do metadata.json. `includeAudioInReport` precisa
    // estar marcado E `audioPath` precisa existir — bug real corrigido
    // nesta rodada: antes só a existencia de `audioPath` bastava pra
    // copiar o audio, entao marcar so "incluir chat" de um jogador que
    // tambem tinha audio acabava anexando o .wav dele sem pedido.
    const audioFiles: OrganizedEvidence['audioFiles'] = []
    for (const player of selectedPlayers) {
      if (!player.includeAudioInReport || !player.audioPath) continue
      const safeName = sanitizeFileNameSegment(player.rawPlayerName)
      const destPath = join(audioDir, `${safeName}_${player.steamId64}.wav`)
      copyFileSync(player.audioPath, destPath)
      audioFiles.push({
        steamId64: player.steamId64,
        displayName: player.rawPlayerName,
        // Caminho final (pos-rename) — o arquivo em si so existe no
        // caminho de staging ate a linha do renameSync abaixo, mas o
        // valor retornado pro resto do app já reflete onde ele vai
        // acabar morando.
        audioPath: join(finalDir, 'audio', `${safeName}_${player.steamId64}.wav`)
      })
    }

    const chatFiles: OrganizedEvidence['chatFiles'] = []
    for (const player of selectedPlayers) {
      if (!player.includeChatInReport || !player.chatMessages || player.chatMessages.length === 0) continue
      if (!existsSync(chatDir)) mkdirSync(chatDir, { recursive: true })
      const safeName = sanitizeFileNameSegment(player.rawPlayerName)
      const destPath = join(chatDir, `${safeName}_${player.steamId64}.txt`)
      writeFileSync(destPath, formatChatFileContents(player.chatMessages), 'utf-8')
      chatFiles.push({
        steamId64: player.steamId64,
        displayName: player.rawPlayerName,
        chatPath: join(finalDir, 'chat', `${safeName}_${player.steamId64}.txt`)
      })
    }

    // status/drive/matchId seguem o formato de ReportMetadata desde ja
    // (mesmo sem upload existir ainda) para que uma futura B6 so precise
    // atualizar este mesmo arquivo, sem migracao de esquema — e para que
    // um futuro historico de denuncias possa ser construido so lendo os
    // metadata.json existentes em "<raiz>/Provas do Assistente de Denúncias GC".
    // `players` lista TODOS os selecionados (nao so quem tem audio) —
    // um jogador só-com-chat continua fazendo parte da denuncia.
    const metadata: ReportMetadata = {
      reportId,
      createdAt: new Date().toISOString(),
      originalDemoFileName: demoFileName,
      matchId,
      map,
      players: selectedPlayers.map(({ steamId64, rawPlayerName }) => ({
        steamId64,
        displayName: rawPlayerName
      })),
      status: 'local'
    }

    writeFileSync(join(stagingDir, 'metadata.json'), JSON.stringify(metadata, null, 2), 'utf-8')

    // Só a partir daqui a denuncia passa a existir de verdade pro resto
    // do app (`listLocalReports()` só enxerga `finalDir`) — tudo antes
    // desta linha, se falhar no meio, so deixa a pasta de staging pra
    // ser limpa, nunca uma denuncia com metadata.json mas
    // audio/incompleto.
    renameSync(stagingDir, finalDir)

    return { reportId, reportDir: finalDir, audioFiles, chatFiles, matchId, map }
  }

  private resolveUniqueDirectory(parentDir: string, desiredName: string): string {
    let candidate = join(parentDir, desiredName)
    let suffix = 2
    while (existsSync(candidate)) {
      candidate = join(parentDir, `${desiredName} (${suffix})`)
      suffix += 1
    }
    return candidate
  }

  private generateReportId(): string {
    const now = new Date()
    const pad = (value: number): string => String(value).padStart(2, '0')
    return `report-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(
      now.getHours()
    )}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  }
}
