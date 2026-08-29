import { existsSync, readdirSync, rmSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { getManagedEvidenceDir } from './AppSettings'

// Renomeada nesta rodada (rebranding) — era 'gc-report-tool'. Pasta
// TEMPORÁRIA do SO (nunca dados do usuário): seguro mudar sem qualquer
// migração, o pior caso é uma pasta órfã do nome antigo que o próprio
// SO já limpa periodicamente sozinho.
const TEMP_OUTPUT_ROOT_NAME = 'assistente-denuncias-gc'

export function getTempOutputRoot(): string {
  return join(app.getPath('temp'), TEMP_OUTPUT_ROOT_NAME)
}

/**
 * Remove todo o diretorio temporario de saida do CSGOVE de sessoes
 * anteriores do app. Seguro chamar no inicio do app: nenhuma sessao
 * anterior pode estar processando nada nesse momento, entao qualquer
 * coisa aqui e garantidamente lixo abandonado (fluxo interrompido, app
 * fechado no meio, usuario nunca confirmou uma selecao de jogador etc.).
 */
export function cleanupStaleTempOutput(): void {
  const root = getTempOutputRoot()
  try {
    if (existsSync(root)) {
      rmSync(root, { recursive: true, force: true })
    }
  } catch {
    // Limpeza de temporario nunca deve impedir o app de iniciar.
  }
}

/**
 * Remove o diretorio de saida de UMA execucao especifica do CSGOVE,
 * depois que os arquivos necessarios ja foram copiados para o destino
 * persistente (ver EvidenceOrganizer). So deve ser chamada apos a copia
 * ter sido confirmada com sucesso — nunca antes, para nao arriscar
 * perder a unica copia existente do audio extraido.
 */
export function cleanupRunOutput(outputDir: string): void {
  try {
    if (existsSync(outputDir)) {
      rmSync(outputDir, { recursive: true, force: true })
    }
  } catch {
    // Limpeza de temporario nunca deve derrubar o fluxo do usuario — na
    // pior hipotese sobra lixo temporario, nunca perda de dado.
  }
}

/**
 * Remove pastas de staging (`<nome> (montando-<pid>-<timestamp>)`,
 * ver EvidenceOrganizer.ts) deixadas pra tras por um crash/fechamento
 * do app bem no meio de organizar uma denuncia — antes do
 * `renameSync` final, que só acontece depois de todo audio + o
 * metadata.json já estarem escritos com sucesso. Mesmo raciocinio de
 * segurança do `cleanupStaleTempOutput`: nenhuma sessão anterior pode
 * estar no meio desse processo agora, então qualquer pasta de staging
 * encontrada no início do app é garantidamente lixo abandonado —
 * nunca a única cópia de nada (o áudio de origem, no diretório
 * temporário do CSGOVE, só é limpo depois que a organização confirma
 * sucesso, ver `cleanupRunOutput`/`evidenceHandlers.ts`).
 */
export function cleanupOrphanedStagingFolders(): void {
  try {
    const managedRoot = getManagedEvidenceDir()
    if (!existsSync(managedRoot)) return
    for (const entry of readdirSync(managedRoot)) {
      if (entry.includes('.montando-')) {
        rmSync(join(managedRoot, entry), { recursive: true, force: true })
      }
    }
  } catch {
    // Mesma regra: limpeza nunca deve impedir o app de iniciar.
  }
}
