/**
 * Ambiente de distribuicao do build atual — nunca inferido no
 * renderer, sempre vindo do main process (ver
 * services/releaseChannel.ts). `development` e `npm run dev` (nunca
 * empacotado). `test` e um instalador gerado por `npm run
 * dist:win:test`, marcado explicitamente via `extraMetadata
 * .gcReleaseChannel` no package.json empacotado — pensado pra nunca
 * ser confundido com uma instalacao real de producao (appId e
 * productName tambem diferentes, ver package.json). `production` e
 * qualquer build empacotado sem essa marca — o padrao seguro (um build
 * de producao nunca precisa de configuracao extra pra ser reconhecido
 * como tal).
 */
export type ReleaseChannel = 'development' | 'test' | 'production'

export interface AppInfo {
  version: string
  channel: ReleaseChannel
}
