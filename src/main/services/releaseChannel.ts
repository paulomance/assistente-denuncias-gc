import { readFileSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import type { AppInfo, ReleaseChannel } from '../../shared/types/AppInfo'

/**
 * `package.json` sempre existe na raiz do app (dentro do asar quando
 * empacotado — o proprio Electron depende disso pra saber o `main`
 * entry point, entao `readFileSync` funciona nos dois casos sem
 * nenhuma configuracao extra). Le so pra pegar `gcReleaseChannel`, um
 * campo customizado que so `npm run dist:win:test` grava (via
 * `--config.extraMetadata.gcReleaseChannel=test`, ver package.json) —
 * nunca presente num build de producao real nem em dev.
 */
function readPackagedGcReleaseChannel(): string | undefined {
  try {
    const raw = readFileSync(join(app.getAppPath(), 'package.json'), 'utf-8')
    const parsed = JSON.parse(raw) as { gcReleaseChannel?: string }
    return parsed.gcReleaseChannel
  } catch {
    return undefined
  }
}

/**
 * `development`: sempre que `!app.isPackaged` (npm run dev), mesmo que
 * por algum motivo o package.json tenha o campo — nunca confia em dado
 * de configuracao pra dizer "isto e dev", so no fato real de nao estar
 * empacotado. `test`: build empacotado com a marca explicita (instala
 * lado a lado com producao, appId/productName diferentes — ver
 * package.json). `production`: o padrao seguro pra qualquer outro
 * build empacotado, inclusive se o package.json nao puder ser lido por
 * algum motivo (nunca trava a deteccao de canal por causa disso).
 */
export function getReleaseChannel(): ReleaseChannel {
  if (!app.isPackaged) return 'development'
  return readPackagedGcReleaseChannel() === 'test' ? 'test' : 'production'
}

export function getAppInfo(): AppInfo {
  return { version: app.getVersion(), channel: getReleaseChannel() }
}
