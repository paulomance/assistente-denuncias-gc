import type { BrowserWindow } from 'electron'
import { getUiScale, getWindowMode } from './AppSettings'
import type { UiScale, WindowMode } from '../../shared/types/Settings'

/**
 * Fator de zoom nativo do Electron (`webContents.setZoomFactor`), NUNCA
 * `transform: scale()` em CSS — decisao explicita do usuario ("não faça
 * simplesmente transform: scale() na interface inteira"). `setZoomFactor`
 * e a mesma API que apps desktop reais usam pra "Zoom da interface"
 * (ex.: "Ctrl +/-" do VS Code) — recalcula o layout de verdade no fator
 * escolhido (fontes nitidas, hit-testing correto), diferente de um
 * transform visual que so estica pixels sem recalcular nada.
 */
const FIXED_SCALE_FACTORS: Record<Exclude<UiScale, 'auto'>, number> = {
  small: 0.9,
  medium: 1.0,
  large: 1.15
}

/**
 * So usado quando a preferencia e "automatica" — reavaliado a cada
 * resize da janela (ver `watchAutoScale` abaixo). Faixas calibradas em
 * torno do tamanho padrao da janela (1280x860, minimo 900x620): abaixo
 * de 1100px de largura o app ja esta proximo do minimo (mais compacto
 * faz sentido), acima de 1500px sobra espaço de verdade pra ampliar sem
 * a interface ficar espalhada demais.
 */
function computeAutoZoomFactor(windowWidthPx: number): number {
  if (windowWidthPx < 1100) return 0.92
  if (windowWidthPx < 1500) return 1.0
  return 1.12
}

function applyZoomFactor(window: BrowserWindow, scale: UiScale): void {
  if (window.isDestroyed()) return
  const factor =
    scale === 'auto' ? computeAutoZoomFactor(window.getBounds().width) : FIXED_SCALE_FACTORS[scale]
  window.webContents.setZoomFactor(factor)
}

function applyWindowMode(window: BrowserWindow, mode: WindowMode): void {
  if (window.isDestroyed()) return
  window.setFullScreen(mode === 'fullscreen')
}

/**
 * Aplica as preferencias persistidas (escala + modo de janela) numa
 * janela recem-criada, e mantem a escala "automatica" reagindo a
 * redimensionamentos reais — nunca um listener que sobrevive depois da
 * janela ser destruida (`window.once('closed', ...)` remove o
 * listener).
 */
export function applyPersistedAppearance(window: BrowserWindow): void {
  applyZoomFactor(window, getUiScale())
  applyWindowMode(window, getWindowMode())

  const handleResize = (): void => {
    if (getUiScale() === 'auto') {
      applyZoomFactor(window, 'auto')
    }
  }
  window.on('resize', handleResize)
  window.once('closed', () => window.removeListener('resize', handleResize))
}

/** Chamado quando o usuario muda a preferencia de escala em Configurações. */
export function reapplyUiScale(window: BrowserWindow): void {
  applyZoomFactor(window, getUiScale())
}

/** Chamado quando o usuario muda a preferencia de modo de janela. */
export function reapplyWindowMode(window: BrowserWindow): void {
  applyWindowMode(window, getWindowMode())
}
