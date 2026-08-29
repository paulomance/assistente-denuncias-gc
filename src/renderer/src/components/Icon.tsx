export type IconName =
  | 'history'
  | 'folder'
  | 'drive'
  | 'send'
  | 'trash'
  | 'alert'
  | 'check'
  | 'external'
  | 'copy'
  | 'close'
  | 'player'
  | 'play'
  | 'pause'
  | 'settings'
  | 'volume'
  | 'volume-mute'
  | 'help'
  | 'chevron-right'
  | 'download'
  | 'chat'
  | 'mic'

interface IconProps {
  name: IconName
  size?: number
  className?: string
}

/**
 * Conjunto minimo e consistente de icones de linha (stroke, sem
 * preenchimento) para substituir simbolos Unicode improvisados (✓, ⚠, ✕)
 * espalhados pela UI antes desta revisao — decisao explicita do usuario
 * de nao depender de uma biblioteca de icones pesada, so um punhado de
 * SVGs autorais no mesmo estilo do icone de configuracoes ja existente em
 * Header.tsx (stroke-width 1.5, linecap/linejoin round).
 */
const PATHS: Record<IconName, React.ReactNode> = {
  history: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </>
  ),
  folder: <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2h9a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5v-10Z" />,
  drive: <path d="M7 18a4 4 0 0 1-.5-7.97A5 5 0 0 1 16.9 8.05 4 4 0 0 1 16.5 16H7Z" />,
  send: (
    <>
      <path d="M12 18V6" />
      <path d="M6.5 11.5 12 6l5.5 5.5" />
      <path d="M5 19h14" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16" />
      <path d="M9 7V5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5v2" />
      <path d="M6.5 7 7 19.5A1.5 1.5 0 0 0 8.5 21h7a1.5 1.5 0 0 0 1.5-1.5L17.5 7" />
      <path d="M10.5 11v6" />
      <path d="M13.5 11v6" />
    </>
  ),
  alert: (
    <>
      <path d="M12 9v4.5" />
      <path d="M12 16.5h.01" />
      <path d="M10.4 3.7 1.9 18a1 1 0 0 0 .87 1.5h18.46a1 1 0 0 0 .87-1.5L13.6 3.7a1.4 1.4 0 0 0-2.4 0Z" />
    </>
  ),
  check: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12.5 2.7 2.7L16.5 9" />
    </>
  ),
  external: (
    <>
      <path d="M14 5h5v5" />
      <path d="M19 5l-8.5 8.5" />
      <path d="M9.5 5H7a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2.5" />
    </>
  ),
  copy: (
    <>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15H4.5A1.5 1.5 0 0 1 3 13.5v-9A1.5 1.5 0 0 1 4.5 3h9A1.5 1.5 0 0 1 15 4.5V5" />
    </>
  ),
  close: (
    <>
      <path d="M6 6l12 12" />
      <path d="M18 6 6 18" />
    </>
  ),
  player: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c0-3.6 3.1-6.5 7-6.5s7 2.9 7 6.5" />
    </>
  ),
  // Unicas duas com preenchimento (fill), nao so stroke — triangulo/barras
  // vazadas ficam ambiguas demais pro simbolo universal de play/pause.
  play: <path d="M8 5.5v13l11-6.5-11-6.5Z" fill="currentColor" stroke="none" />,
  pause: (
    <>
      <rect x="7" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none" />
      <rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none" />
    </>
  ),
  settings: (
    <>
      <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </>
  ),
  volume: (
    <>
      <path d="M4 9.5h3.2L11 6v12l-3.8-3.5H4v-5Z" />
      <path d="M15.3 9a3.5 3.5 0 0 1 0 6" />
      <path d="M17.3 6.5a7 7 0 0 1 0 11" />
    </>
  ),
  'volume-mute': (
    <>
      <path d="M4 9.5h3.2L11 6v12l-3.8-3.5H4v-5Z" />
      <path d="M15.5 10.5 20 15" />
      <path d="M20 10.5 15.5 15" />
    </>
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.3 9.3a2.7 2.7 0 1 1 3.9 2.4c-.8.5-1.2.9-1.2 1.9" />
      <path d="M12 17h.01" />
    </>
  ),
  'chevron-right': <path d="M9 5.5 15.5 12 9 18.5" />,
  chat: (
    <path d="M4 5.5h16v10H9.5L5 19v-3.5H4z" />
  ),
  // Achado numa auditoria de consistência: o ícone 'drive' (nuvem) era
  // reaproveitado pra "nova versão do app disponível" — mas em toda
  // outra tela ele significa Google Drive especificamente, arriscando
  // confundir os dois. Ícone dedicado de download (seta + bandeja),
  // sem relação com nenhum outro significado já em uso.
  download: (
    <>
      <path d="M12 4v11" />
      <path d="M7 10.5 12 15.5 17 10.5" />
      <path d="M5 19.5h14" />
    </>
  ),
  // Toggle de "incluir áudio deste jogador" (ver PlayerSelectionList.tsx)
  // — cápsula + suporte, o desenho universal de microfone, deliberadamente
  // distinto do triângulo de play (ouvir) que já existe ao lado dele.
  mic: (
    <>
      <rect x="9" y="2.5" width="6" height="11" rx="3" />
      <path d="M5.5 10.5a6.5 6.5 0 0 0 13 0" />
      <path d="M12 17v4" />
      <path d="M8.5 21h7" />
    </>
  )
}

export function Icon({ name, size = 18, className }: IconProps): React.JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  )
}
