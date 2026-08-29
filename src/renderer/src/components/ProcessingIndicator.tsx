import { useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'
import type { CsgoveProgressStage } from '../../../shared/types/Csgove'
import { estimateProcessingDurationMs } from '../utils/estimateProcessingDuration'

const STAGE_ORDER: CsgoveProgressStage[] = ['identifying-players', 'analyzing', 'extracting']

const STAGE_LABELS: Record<CsgoveProgressStage, string> = {
  'identifying-players': 'Identificando os jogadores e os times',
  analyzing: 'Abrindo o arquivo da demo',
  extracting: 'Extraindo as comunicações de voz e texto'
}

// Nunca mostra 100% enquanto ainda estiver rodando de verdade — evita o
// classico "travado em 99%" quando a estimativa erra pra menos. A tela
// so troca (pra resultado ou erro) quando o processamento realmente
// termina, entao o usuario nunca ve "100%" parado sem nada acontecer.
const MAX_ESTIMATED_PERCENT = 95
const TICK_INTERVAL_MS = 200

interface ProcessingIndicatorProps {
  stage: CsgoveProgressStage
  fileSizeBytes: number
}

/**
 * Checklist de etapas REAIS (nunca um timer fatiado artificialmente) —
 * cada linha corresponde a uma operacao real e observavel:
 * `identifying-players` (leitura da demo via demoparser2, ver
 * matchTeams.ts) roda ANTES do CSGOVE (reordenado nesta rodada, ver
 * csgoveHandlers.ts); `analyzing`/`extracting` vem do stdout real do
 * CSGOVE (csgoveStdout.ts). A barra de porcentagem so aparece durante
 * `analyzing`/`extracting` — e a UNICA fase com uma estimativa
 * calibrada de verdade (ver estimateProcessingDuration.ts, medida
 * contra uma demo real). `identifying-players` nao tem estimativa
 * numerica porque nunca foi calibrada isoladamente — mostrar um numero
 * ali seria inventar precisao que nao temos.
 */
export function ProcessingIndicator({ stage, fileSizeBytes }: ProcessingIndicatorProps): React.JSX.Element {
  const [, forceTick] = useState(0)
  // So marca o inicio da fase do CSGOVE (analyzing) uma unica vez — a
  // estimativa calibrada cobre analyzing+extracting como uma execucao
  // continua (assim como o CSGOVE roda de verdade), nunca reiniciada
  // entre as duas.
  const csgoveStartedAtRef = useRef<number | null>(null)

  useEffect(() => {
    if (stage === 'analyzing' && csgoveStartedAtRef.current === null) {
      csgoveStartedAtRef.current = Date.now()
    }
  }, [stage])

  useEffect(() => {
    const interval = setInterval(() => forceTick((n) => n + 1), TICK_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [])

  const currentIndex = STAGE_ORDER.indexOf(stage)
  const elapsedMs = csgoveStartedAtRef.current ? Date.now() - csgoveStartedAtRef.current : 0
  const estimatedTotalMs = estimateProcessingDurationMs(fileSizeBytes)
  const rawPercent = estimatedTotalMs > 0 ? (elapsedMs / estimatedTotalMs) * 100 : 0
  const percent = Math.min(MAX_ESTIMATED_PERCENT, Math.max(0, Math.round(rawPercent)))
  const secondsRemaining = Math.max(0, Math.round((estimatedTotalMs - elapsedMs) / 1000))
  const showEstimate = stage === 'analyzing' || stage === 'extracting'

  return (
    <div className="processing">
      <p className="processing__title">Preparando sua denúncia</p>

      <ul className="processing__steps">
        {STAGE_ORDER.map((s, index) => {
          const isDone = index < currentIndex
          const isCurrent = index === currentIndex
          return (
            <li
              key={s}
              className={
                'processing__step' +
                (isDone ? ' processing__step--done' : '') +
                (isCurrent ? ' processing__step--current' : '')
              }
            >
              <span className="processing__step-icon">
                {isDone ? (
                  <Icon name="check" size={13} />
                ) : isCurrent ? (
                  <span className="processing__step-spinner" aria-hidden="true" />
                ) : (
                  <span className="processing__step-dot" aria-hidden="true" />
                )}
              </span>
              <span className="processing__step-label">{STAGE_LABELS[s]}</span>
            </li>
          )
        })}
      </ul>

      {showEstimate ? (
        <>
          <div
            className="processing__bar-track"
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className="processing__bar-fill" style={{ width: `${percent}%` }} />
          </div>
          <p className="processing__estimate">
            {percent}% concluído (estimativa)
            {secondsRemaining > 0 ? ` — cerca de ${secondsRemaining}s restantes` : ''}
          </p>
        </>
      ) : (
        <p className="processing__subtitle">Isso costuma levar só alguns segundos.</p>
      )}
    </div>
  )
}
