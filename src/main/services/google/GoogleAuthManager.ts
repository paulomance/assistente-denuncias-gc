import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { createServer, type Server } from 'http'
import { app, safeStorage, shell } from 'electron'
import { google } from 'googleapis'
import { GoogleApiError, mapGoogleError } from './GoogleApiError'
import type { CloudAuthStatus } from '../../../shared/types/CloudStorage'

type OAuth2Client = InstanceType<typeof google.auth.OAuth2>

const SCOPES = ['https://www.googleapis.com/auth/drive.file']
const TOKEN_FILE_NAME = 'google-drive-auth.enc'
// Tempo maximo esperando o usuario terminar o consentimento no navegador
// do sistema antes de desistir e liberar a porta local.
const SIGN_IN_TIMEOUT_MS = 3 * 60 * 1000

interface InstalledClientCredentials {
  client_id: string
  client_secret: string
  auth_uri: string
  token_uri: string
  redirect_uris: string[]
}

interface PersistedTokens {
  refresh_token?: string | null
  access_token?: string | null
  expiry_date?: number | null
  scope?: string
  token_type?: string | null
}

function getCredentialsFilePath(): string {
  // Em dev, o arquivo fica em credentials/ na raiz do projeto (fora do
  // Git — ver .gitignore). Em producao, o instalador embute o mesmo
  // arquivo via extraResources do electron-builder (ver "build" em
  // package.json, confirmado na Fase B8) — mesmo padrao ja usado pelo
  // CsgoveRunner. O client_secret desse client "Desktop app" e o mesmo
  // para todos os usuarios que instalarem o app (esperado: o Google trata
  // esse segredo como nao-confidencial por natureza para esse tipo de
  // client — ver README.md).
  if (app.isPackaged) {
    return join(process.resourcesPath, 'credentials', 'google-oauth-client.json')
  }
  return join(app.getAppPath(), 'credentials', 'google-oauth-client.json')
}

function getTokenFilePath(): string {
  return join(app.getPath('userData'), TOKEN_FILE_NAME)
}

/**
 * Login/logout do Google e persistencia de token — nunca sabe nada sobre
 * Google Drive em si (isso e o GoogleDriveProvider). Fluxo padrao para
 * apps instalados (Desktop app), o mesmo usado pelos exemplos/quickstarts
 * oficiais do Google: servidor loopback temporario + navegador do
 * sistema (nunca um WebView embutido — mais seguro e e o que o Google
 * recomenda para OAuth de apps nativos).
 */
export class GoogleAuthManager {
  private cachedClient: OAuth2Client | null = null

  private loadClientCredentials(): InstalledClientCredentials {
    const filePath = getCredentialsFilePath()
    if (!existsSync(filePath)) {
      throw new GoogleApiError(
        'invalid-client-config',
        `Arquivo de credenciais do Google nao encontrado em: ${filePath}`
      )
    }
    const parsed = JSON.parse(readFileSync(filePath, 'utf-8')) as {
      installed: InstalledClientCredentials
    }
    return parsed.installed
  }

  private createClient(redirectUri: string): OAuth2Client {
    const creds = this.loadClientCredentials()
    return new google.auth.OAuth2(creds.client_id, creds.client_secret, redirectUri)
  }

  private loadPersistedTokens(): PersistedTokens | null {
    const filePath = getTokenFilePath()
    if (!existsSync(filePath) || !safeStorage.isEncryptionAvailable()) {
      return null
    }
    try {
      const decrypted = safeStorage.decryptString(readFileSync(filePath))
      return JSON.parse(decrypted) as PersistedTokens
    } catch {
      return null
    }
  }

  private persistTokens(tokens: PersistedTokens): void {
    if (!safeStorage.isEncryptionAvailable()) {
      // Sem criptografia disponivel no SO, preferimos NAO persistir a
      // guardar segredo em texto puro no disco — o usuario so precisa
      // logar de novo na proxima abertura do app.
      return
    }
    mkdirSync(app.getPath('userData'), { recursive: true })
    writeFileSync(getTokenFilePath(), safeStorage.encryptString(JSON.stringify(tokens)))
  }

  private clearPersistedTokens(): void {
    rmSync(getTokenFilePath(), { force: true })
  }

  async getAuthStatus(): Promise<CloudAuthStatus> {
    const tokens = this.loadPersistedTokens()
    return tokens?.refresh_token ? 'signed-in' : 'signed-out'
  }

  async signIn(): Promise<void> {
    const { server, port } = await this.startLoopbackServer()
    const redirectUri = `http://127.0.0.1:${port}`
    const client = this.createClient(redirectUri)

    const authUrl = client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: SCOPES
    })

    const codePromise = this.waitForAuthorizationCode(server, redirectUri)

    try {
      await shell.openExternal(authUrl)
    } catch {
      server.close()
      throw new GoogleApiError('unexpected', 'Não foi possível abrir o navegador para o login.')
    }

    const code = await codePromise

    try {
      const { tokens } = await client.getToken(code)
      this.persistTokens(tokens)
      this.cachedClient = null
    } catch (error) {
      throw mapGoogleError(error)
    }
  }

  async signOut(): Promise<void> {
    const tokens = this.loadPersistedTokens()
    if (tokens?.refresh_token) {
      try {
        const client = this.createClient('http://127.0.0.1')
        await client.revokeToken(tokens.refresh_token)
      } catch {
        // Revogar no lado do Google e "melhor esforco" — mesmo que falhe
        // (ex.: sem rede), ainda limpamos o token local. O usuario pediu
        // pra desconectar; nao deixamos o app "meio conectado".
      }
    }
    this.clearPersistedTokens()
    this.cachedClient = null
  }

  async getAuthorizedClient(): Promise<OAuth2Client> {
    if (this.cachedClient) {
      return this.cachedClient
    }

    const tokens = this.loadPersistedTokens()
    if (!tokens?.refresh_token) {
      throw new GoogleApiError('not-signed-in', 'Usuário não conectado ao Google Drive.')
    }

    const client = this.createClient('http://127.0.0.1')
    client.setCredentials(tokens)
    client.on('tokens', (newTokens) => {
      // O Google pode emitir um novo access_token (e ocasionalmente um
      // novo refresh_token) durante o uso — persistimos de novo pra
      // manter valido na proxima abertura do app.
      this.persistTokens({ ...tokens, ...newTokens })
    })

    this.cachedClient = client
    return client
  }

  private waitForAuthorizationCode(server: Server, redirectUri: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => {
        server.close()
        reject(new GoogleApiError('auth-cancelled', 'Tempo esgotado esperando o login no navegador.'))
      }, SIGN_IN_TIMEOUT_MS)

      const finish = (fn: () => void): void => {
        clearTimeout(timeout)
        server.close()
        fn()
      }

      server.on('request', (req, res) => {
        const url = new URL(req.url ?? '/', redirectUri)
        const code = url.searchParams.get('code')
        const error = url.searchParams.get('error')

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })

        if (error) {
          res.end(
            '<html><body><h1>Login cancelado.</h1><p>Pode fechar esta aba e voltar ao aplicativo.</p></body></html>'
          )
          finish(() =>
            reject(new GoogleApiError('auth-cancelled', `Usuário cancelou o login: ${error}`))
          )
          return
        }

        if (!code) {
          res.end(
            '<html><body><h1>Algo deu errado.</h1><p>Pode fechar esta aba e tentar de novo no aplicativo.</p></body></html>'
          )
          finish(() =>
            reject(new GoogleApiError('unexpected', 'Redirecionamento do Google sem parâmetro "code".'))
          )
          return
        }

        res.end(
          '<html><body><h1>Login concluído!</h1><p>Pode fechar esta aba e voltar ao aplicativo.</p></body></html>'
        )
        finish(() => resolve(code))
      })
    })
  }

  private startLoopbackServer(): Promise<{ server: Server; port: number }> {
    return new Promise((resolve, reject) => {
      const server = createServer()
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => {
        const address = server.address()
        if (address && typeof address === 'object') {
          resolve({ server, port: address.port })
        } else {
          reject(new GoogleApiError('unexpected', 'Não foi possível iniciar o servidor local de login.'))
        }
      })
    })
  }
}
