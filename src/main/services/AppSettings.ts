import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import type { FontSize, UiScale, WindowMode } from '../../shared/types/Settings'

interface PersistedSettings {
  evidenceRootDir?: string
  uiScale?: UiScale
  windowMode?: WindowMode
  fontSize?: FontSize
  hardwareAcceleration?: boolean
}

/**
 * 'medium' (não 'auto') por decisão explícita do usuário: quer que uma
 * instalação nova sempre abra numa experiência previsível — "Média" —
 * em vez de depender do tamanho da janela logo de cara. Na prática os
 * dois já coincidem visualmente pra janela padrão do app (1280x860,
 * ver createWindow em main/index.ts): `computeAutoZoomFactor` em
 * windowAppearance.ts já usa exatamente o fator de "Média" (1.0) pra
 * qualquer largura entre 1100 e 1500px, então "Automática" continua
 * sendo, na prática, "Média + ajustes responsivos só em janelas bem
 * pequenas ou bem grandes" — nunca uma experiência muito diferente da
 * referência. "Automática" continua disponível e recomendada em
 * Configurações, só não é mais o padrão de uma instalação nova.
 */
const DEFAULT_UI_SCALE: UiScale = 'medium'
const DEFAULT_WINDOW_MODE: WindowMode = 'windowed'
const DEFAULT_FONT_SIZE: FontSize = 'medium'
/**
 * Desligada por padrao (decisao de produto, nao tecnica) — aceleracao
 * por GPU so afeta a renderizacao do Chromium (scroll, sombras,
 * decodificacao de midia acelerada), nunca o processamento real deste
 * app (CSGOVE roda como processo nativo separado, upload ao Drive e
 * I/O). Em compensacao, drivers de GPU problematicos podem causar tela
 * preta/travamento na inicializacao — um risco pior que o ganho
 * marginal pra uma interface simples como esta. Ver
 * .claude/skills/electron-desktop-engineering/SKILL.md secao 9.
 */
const DEFAULT_HARDWARE_ACCELERATION = false

const SETTINGS_FILE_NAME = 'settings.json'

/**
 * Subpasta que o app gerencia dentro da raiz escolhida pelo usuario (ou
 * dentro de Documentos, por padrao). Nome unico, referenciado tanto aqui
 * quanto no EvidenceOrganizer.ts, para nunca divergir entre "onde
 * dizemos que vai salvar" e "onde realmente salva".
 *
 * Renomeada NESTA rodada (pedido explícito do usuário): era "Assistente
 * de Denuncias GC" (por sua vez renomeada de "Gamers Club Reports" numa
 * rodada anterior de rebranding). Mudar o nome de uma pasta persistida É
 * uma mudança de identificador real — decidido conscientemente aqui
 * porque o app ainda não foi publicado publicamente (só testado
 * internamente até agora), então não existe usuário externo real que
 * perderia acesso a dados antigos. Instalações de teste já existentes
 * (inclusive as usadas neste projeto durante o desenvolvimento) vão
 * passar a gerenciar uma pasta NOVA a partir desta mudança — o conteúdo
 * antigo em "Documentos/Assistente de Denuncias GC" continua no disco,
 * só não é mais lido/gerenciado automaticamente pelo app (mover
 * manualmente pro novo nome se precisar recuperar).
 */
export const MANAGED_SUBFOLDER_NAME = 'Provas do Assistente de Denúncias GC'

function getSettingsFilePath(): string {
  return join(app.getPath('userData'), SETTINGS_FILE_NAME)
}

function readPersistedSettings(): PersistedSettings {
  try {
    return JSON.parse(readFileSync(getSettingsFilePath(), 'utf-8')) as PersistedSettings
  } catch {
    return {}
  }
}

function writePersistedSettings(settings: PersistedSettings): void {
  mkdirSync(app.getPath('userData'), { recursive: true })
  writeFileSync(getSettingsFilePath(), JSON.stringify(settings, null, 2), 'utf-8')
}

/**
 * Pasta RAIZ escolhida pelo usuario para guardar evidencias. Cai para
 * Documentos se o usuario nunca escolheu nada, ou se a pasta escolhida
 * nao existe mais (ex.: HD externo desconectado) — nunca quebra por
 * causa disso.
 */
export function getEvidenceRootDir(): string {
  const persisted = readPersistedSettings()
  if (persisted.evidenceRootDir && existsSync(persisted.evidenceRootDir)) {
    return persisted.evidenceRootDir
  }
  return app.getPath('documents')
}

/** Caminho completo que sera mostrado/usado de fato (raiz + subpasta gerenciada). */
export function getManagedEvidenceDir(): string {
  return join(getEvidenceRootDir(), MANAGED_SUBFOLDER_NAME)
}

/**
 * Diferencia "usuario nunca escolheu nada" (deve perguntar de forma mais
 * proeminente) de "ja escolheu antes" (so confirma e oferece alterar) —
 * ver ConfirmStorageLocation.tsx.
 */
export function hasExplicitlyChosenEvidenceRootDir(): boolean {
  const persisted = readPersistedSettings()
  return Boolean(persisted.evidenceRootDir && existsSync(persisted.evidenceRootDir))
}

/**
 * true quando existe uma pasta persistida (o usuario escolheu antes) mas
 * ela nao existe mais no disco agora — caso distinto de "nunca escolheu
 * nada", usado pra UI avisar que a pasta anterior sumiu em vez de tratar
 * como primeira vez (ver ConfirmStorageLocation.tsx).
 */
export function isEvidenceRootDirMissing(): boolean {
  const persisted = readPersistedSettings()
  return Boolean(persisted.evidenceRootDir) && !existsSync(persisted.evidenceRootDir as string)
}

export function setEvidenceRootDir(newRootDir: string): void {
  writePersistedSettings({ ...readPersistedSettings(), evidenceRootDir: newRootDir })
}

export function getUiScale(): UiScale {
  return readPersistedSettings().uiScale ?? DEFAULT_UI_SCALE
}

export function setUiScale(scale: UiScale): void {
  writePersistedSettings({ ...readPersistedSettings(), uiScale: scale })
}

export function getWindowMode(): WindowMode {
  return readPersistedSettings().windowMode ?? DEFAULT_WINDOW_MODE
}

export function setWindowMode(mode: WindowMode): void {
  writePersistedSettings({ ...readPersistedSettings(), windowMode: mode })
}

export function getFontSize(): FontSize {
  return readPersistedSettings().fontSize ?? DEFAULT_FONT_SIZE
}

export function setFontSize(size: FontSize): void {
  writePersistedSettings({ ...readPersistedSettings(), fontSize: size })
}

/**
 * Lido em `main/index.ts` ANTES de `app.whenReady()` — aceleracao por
 * GPU so pode ser desligada antes do Electron inicializar, exige
 * reiniciar o processo inteiro pra ter efeito (nunca aplicavel "ao
 * vivo").
 */
export function getHardwareAcceleration(): boolean {
  return readPersistedSettings().hardwareAcceleration ?? DEFAULT_HARDWARE_ACCELERATION
}

export function setHardwareAcceleration(enabled: boolean): void {
  writePersistedSettings({ ...readPersistedSettings(), hardwareAcceleration: enabled })
}
