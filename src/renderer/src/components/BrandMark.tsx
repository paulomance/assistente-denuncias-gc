interface BrandMarkProps {
  /** Tamanho total do selo, em px. */
  size: number
  className?: string
}

/**
 * Monograma neutro "GC" — texto simples, cores da própria paleta do
 * app (nunca as cores oficiais da Gamers Club), sem tentar reproduzir
 * o símbolo/tipografia/identidade visual oficial da marca. Substitui a
 * marca oficial (`assets/brand/gc-mark.png`, removida nesta rodada)
 * como parte do rebranding pra projeto independente — este app não é
 * afiliado, patrocinado ou representante da Gamers Club (ver seção
 * "Projeto independente" em Configurações → Sobre).
 */
export function BrandMark({ size, className }: BrandMarkProps): React.JSX.Element {
  return (
    <span
      className={className ? `brand-mark ${className}` : 'brand-mark'}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
      aria-hidden="true"
    >
      GC
    </span>
  )
}
