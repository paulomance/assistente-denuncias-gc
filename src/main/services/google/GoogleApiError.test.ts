import { describe, expect, it } from 'vitest'
import { GoogleApiError, mapGoogleError } from './GoogleApiError'

describe('mapGoogleError', () => {
  it('mapeia invalid_grant (token expirado/revogado) para auth-expired', () => {
    const error = { response: { data: { error: 'invalid_grant' } } }
    expect(mapGoogleError(error).kind).toBe('auth-expired')
  })

  it('mapeia access_denied (usuario recusou o consentimento) para auth-cancelled', () => {
    const error = { response: { data: { error: 'access_denied' } } }
    expect(mapGoogleError(error).kind).toBe('auth-cancelled')
  })

  it('mapeia invalid_client (client_id/secret invalidos) para invalid-client-config', () => {
    const error = { response: { data: { error: 'invalid_client' } } }
    expect(mapGoogleError(error).kind).toBe('invalid-client-config')
  })

  it('mapeia HTTP 401 para auth-expired', () => {
    expect(mapGoogleError({ response: { status: 401 } }).kind).toBe('auth-expired')
  })

  it('mapeia HTTP 403 com motivo de quota para quota-exceeded (formato real: response.data.error.errors[])', () => {
    const error = {
      response: {
        status: 403,
        data: { error: { errors: [{ reason: 'storageQuotaExceeded' }] } }
      }
    }
    expect(mapGoogleError(error).kind).toBe('quota-exceeded')
  })

  it('mapeia HTTP 403 sem motivo de quota para permission-denied (formato real: response.data.error.errors[])', () => {
    const error = {
      response: {
        status: 403,
        data: { error: { errors: [{ reason: 'insufficientPermissions' }] } }
      }
    }
    expect(mapGoogleError(error).kind).toBe('permission-denied')
  })

  it('mapeia HTTP 403 sem corpo de erro nenhum (so o status) para permission-denied', () => {
    expect(mapGoogleError({ response: { status: 403 } }).kind).toBe('permission-denied')
  })

  it('mapeia HTTP 404 para not-found', () => {
    expect(mapGoogleError({ response: { status: 404 } }).kind).toBe('not-found')
  })

  it('mapeia erros de rede do sistema (ENOTFOUND, ETIMEDOUT etc.) para network-unavailable', () => {
    expect(mapGoogleError({ code: 'ENOTFOUND' }).kind).toBe('network-unavailable')
    expect(mapGoogleError({ code: 'ETIMEDOUT' }).kind).toBe('network-unavailable')
  })

  it('mapeia erro desconhecido para unexpected', () => {
    expect(mapGoogleError(new Error('algo estranho')).kind).toBe('unexpected')
  })

  it('preserva um GoogleApiError ja tipado em vez de remapear', () => {
    const original = new GoogleApiError('quota-exceeded', 'ja mapeado')
    expect(mapGoogleError(original)).toBe(original)
  })
})
