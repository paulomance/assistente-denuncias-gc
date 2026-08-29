import type { CloudStorageErrorKind } from '../../../shared/types/CloudStorage'

export class GoogleApiError extends Error {
  constructor(
    public readonly kind: CloudStorageErrorKind,
    message: string
  ) {
    super(message)
    this.name = 'GoogleApiError'
  }
}

/**
 * Traduz erros crus da API do Google (googleapis) para as categorias que
 * a UI sabe tratar (CloudStorageErrorKind) — a UI nunca deve ver algo
 * como "invalid_grant" ou um codigo HTTP cru (regra explicita do
 * usuario). O formato do erro (err.response.data.error para respostas
 * OAuth, err.code/err.response.data.error.errors para respostas da API
 * REST) e o formato real documentado pelas bibliotecas
 * google-auth-library/googleapis — nao suposicao.
 *
 * Achado numa auditoria pos-upgrade do googleapis (140->176, ver
 * docs/plano-frente-b.md): o motivo de erro de um 403 da API REST do
 * Google (usado abaixo pra distinguir quota de permissao negada) vem
 * dentro do corpo da resposta (`response.data.error.errors[]`), nao
 * como propriedade solta no proprio objeto de erro
 * (`err.errors`, formato antigo assumido aqui antes desta correcao —
 * nunca populado de verdade por gaxios/googleapis-common em nenhuma
 * versao testada, entao esse caminho nunca disparava). Comportamento
 * pratico da UI nao mudou pra nenhum caso ja validado (o fallback
 * generico "permission-denied" sempre cobriu isso) — so passa a
 * detectar quota corretamente quando o motivo realmente vier no lugar
 * certo.
 */
export function mapGoogleError(error: unknown): GoogleApiError {
  if (error instanceof GoogleApiError) {
    return error
  }

  const err = error as {
    code?: number | string
    message?: string
    response?: {
      status?: number
      data?: {
        error?: string | { errors?: { reason?: string }[]; message?: string }
        error_description?: string
      }
    }
  }

  const oauthError = typeof err.response?.data?.error === 'string' ? err.response.data.error : undefined
  if (oauthError === 'invalid_grant') {
    return new GoogleApiError('auth-expired', err.message ?? oauthError)
  }
  if (oauthError === 'invalid_client') {
    return new GoogleApiError('invalid-client-config', err.message ?? oauthError)
  }
  if (oauthError === 'access_denied') {
    return new GoogleApiError('auth-cancelled', err.message ?? oauthError)
  }

  const httpStatus = err.response?.status ?? (typeof err.code === 'number' ? err.code : undefined)

  if (httpStatus === 401) {
    return new GoogleApiError('auth-expired', err.message ?? 'unauthorized')
  }
  if (httpStatus === 403) {
    const restError = typeof err.response?.data?.error === 'object' ? err.response.data.error : undefined
    const reason = (restError?.errors?.[0]?.reason ?? '').toLowerCase()
    if (reason.includes('quota') || reason.includes('storage')) {
      return new GoogleApiError('quota-exceeded', err.message ?? reason)
    }
    return new GoogleApiError('permission-denied', err.message ?? reason)
  }
  if (httpStatus === 404) {
    return new GoogleApiError('not-found', err.message ?? 'not found')
  }

  const systemCode = typeof err.code === 'string' ? err.code : undefined
  if (
    systemCode === 'ENOTFOUND' ||
    systemCode === 'ECONNREFUSED' ||
    systemCode === 'ETIMEDOUT' ||
    systemCode === 'EAI_AGAIN' ||
    systemCode === 'ECONNRESET'
  ) {
    return new GoogleApiError('network-unavailable', err.message ?? systemCode)
  }

  return new GoogleApiError('unexpected', err.message ?? 'Erro desconhecido do Google Drive.')
}
