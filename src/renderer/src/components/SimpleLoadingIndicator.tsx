interface SimpleLoadingIndicatorProps {
  title: string
  subtitle?: string
}

/**
 * Para operacoes sem base real para estimar tempo/percentual (ex.: copiar
 * alguns arquivos — rapido e variavel demais pro tipo de estimativa que
 * fazemos para o CSGOVE em ProcessingIndicator.tsx). Ainda assim, nunca
 * so um "Carregando..." generico — sempre com titulo especifico da etapa.
 */
export function SimpleLoadingIndicator({ title, subtitle }: SimpleLoadingIndicatorProps): React.JSX.Element {
  return (
    <div className="processing">
      <div className="simple-spinner" aria-hidden="true" />
      <p className="processing__title">{title}</p>
      {subtitle && <p className="processing__subtitle">{subtitle}</p>}
    </div>
  )
}
