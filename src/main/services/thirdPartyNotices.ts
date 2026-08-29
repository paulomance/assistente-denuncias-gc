import { join } from 'path'
import { app } from 'electron'

/**
 * Mesmo padrao de resolucao dev-vs-empacotado ja usado pra credenciais
 * do Google (GoogleAuthManager.ts) e pro binario do CSGOVE — em dev, o
 * arquivo fica na raiz do projeto (gerado por `npm run
 * licenses:generate`, ver scripts/generate-third-party-notices.js); no
 * app empacotado, o electron-builder copia a mesma pasta `licenses/`
 * pra `resources/licenses` via `extraResources` (ver package.json).
 */
export function getThirdPartyNoticesPath(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'licenses', 'THIRD-PARTY-NOTICES.txt')
  }
  return join(app.getAppPath(), 'licenses', 'THIRD-PARTY-NOTICES.txt')
}
