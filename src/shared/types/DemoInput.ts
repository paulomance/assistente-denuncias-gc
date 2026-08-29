/**
 * Contrato central do pipeline: a origem da demo é desacoplada do restante
 * da aplicacao. Nesta rodada (B1) apenas "manual" e usado; "gamersclub" fica
 * reservado para quando a Frente A (download automatico) for retomada, sem
 * exigir mudancas no DemoManager, CsgoveRunner, selecao de jogador, etc.
 */
export type DemoSource = 'manual' | 'gamersclub'

export interface DemoInput {
  localPath: string
  source: DemoSource
}

export type DemoValidationResult =
  | {
      valid: true
      demoInput: DemoInput
      fileName: string
      fileSizeBytes: number
    }
  | {
      valid: false
      error: string
    }
