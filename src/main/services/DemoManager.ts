import { existsSync, statSync } from 'fs'
import { basename, extname } from 'path'
import type { DemoInput, DemoValidationResult } from '../../shared/types/DemoInput'

/**
 * Limite de tamanho inicial, conservador e arbitrario (nao baseado em dado
 * empirico de demos reais da GC ainda). Existe apenas para evitar tentar
 * processar um arquivo absurdamente grande por engano. Deve ser revisto
 * quando tivermos dados reais de tamanho de demo na Fase B2.
 */
export const MAX_DEMO_SIZE_BYTES = 500 * 1024 * 1024 // 500 MB

/**
 * Responsavel apenas por validar uma demo e produzir um DemoInput.
 * Nao executa CSGOVE, nao faz upload, nao lida com UI. Preparo de diretorio
 * de trabalho, limpeza de temporarios e demais responsabilidades futuras
 * (ver docs/plano-frente-b.md, Fase B2) serao adicionadas quando a
 * integracao com o CSGOVE comecar.
 */
export class DemoManager {
  validate(localPath: string, source: DemoInput['source'] = 'manual'): DemoValidationResult {
    if (extname(localPath).toLowerCase() !== '.dem') {
      return {
        valid: false,
        error: 'Esse arquivo não é uma demo (.dem). Selecione o arquivo da partida que você baixou na Gamers Club.'
      }
    }

    if (!existsSync(localPath)) {
      return { valid: false, error: 'Não conseguimos encontrar esse arquivo. Ele pode ter sido movido ou apagado.' }
    }

    const stats = statSync(localPath)

    if (!stats.isFile()) {
      return { valid: false, error: 'Isso não é um arquivo válido. Selecione o arquivo .dem da partida.' }
    }

    if (stats.size <= 0) {
      return { valid: false, error: 'Esse arquivo está vazio e não pode ser processado. Tente baixar a demo novamente.' }
    }

    if (stats.size > MAX_DEMO_SIZE_BYTES) {
      const limitMb = Math.round(MAX_DEMO_SIZE_BYTES / (1024 * 1024))
      return {
        valid: false,
        error: `Esse arquivo é maior do que o aplicativo suporta no momento (limite de ${limitMb} MB).`
      }
    }

    return {
      valid: true,
      demoInput: { localPath, source },
      fileName: basename(localPath),
      fileSizeBytes: stats.size
    }
  }
}
