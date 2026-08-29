export interface EvidenceStorageInfo {
  /** Raiz escolhida pelo usuario (ou Documentos, por padrao). */
  rootDir: string
  /** Caminho completo onde as denuncias realmente sao salvas (raiz + subpasta gerenciada). */
  managedDir: string
  /** false = usuario nunca escolheu uma pasta explicitamente (ainda usando o padrao). */
  isConfigured: boolean
  /**
   * true quando o usuario JA escolheu uma pasta antes, mas ela nao existe
   * mais no disco agora (HD externo desconectado, pasta apagada, etc.) —
   * distinto de "nunca escolheu nada", pra UI poder avisar especificamente
   * que a pasta anterior sumiu, em vez de tratar como primeira vez.
   */
  rootDirMissing: boolean
}

/**
 * "Automatica" recalcula o fator de zoom com base na largura real da
 * janela sempre que ela for redimensionada (ver windowAppearance.ts) —
 * as outras 3 sao um fator fixo, escolhido explicitamente pelo usuario,
 * que ignora o tamanho da janela.
 */
export type UiScale = 'small' | 'medium' | 'large' | 'auto'

/** `fullscreen` usa `BrowserWindow.setFullScreen`, nunca kiosk mode. */
export type WindowMode = 'windowed' | 'fullscreen'

/**
 * Independente de `UiScale`: `UiScale` usa o zoom nativo do Chromium
 * (`setZoomFactor`, ver windowAppearance.ts) e reescala a interface
 * inteira (layout, alvos de clique, texto). `FontSize` mexe SÓ no
 * tamanho do texto (uma variável CSS multiplicadora aplicada em cima de
 * cada `font-size`, ver global.css) — pensado pra quem quer texto maior
 * sem também aumentar o tamanho de botões/cards, ou vice-versa.
 */
export type FontSize = 'small' | 'medium' | 'large'

export interface AppearanceSettings {
  uiScale: UiScale
  windowMode: WindowMode
  fontSize: FontSize
  /**
   * Desligada por padrão — só afeta a renderização da interface
   * (Chromium), nunca o processamento da demo/upload. Mudar exige
   * reiniciar o aplicativo pra ter efeito (ver `system:restartApp`).
   */
  hardwareAcceleration: boolean
}
