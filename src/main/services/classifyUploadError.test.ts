import { describe, expect, it } from 'vitest'
import { classifyUploadError } from './classifyUploadError'
import { GoogleApiError } from './google/GoogleApiError'

/**
 * Bug real corrigido nesta rodada: uma tentativa de reenvio quando a
 * pasta local da prova já não existe mais (removida por fora do app)
 * mostrava a mensagem genérica "Não foi possível concluir o envio...
 * suas evidências continuam salvas neste computador" — o oposto do que
 * de fato aconteceu. `classifyUploadError` garante que ENOENT vira
 * `'local-source-missing'`, nunca `'unexpected'`.
 */
describe('classifyUploadError', () => {
  it('classifica ENOENT (metadata.json/pasta local ausente) como local-source-missing', () => {
    const enoent = Object.assign(new Error("ENOENT: no such file or directory, open 'metadata.json'"), {
      code: 'ENOENT'
    })
    expect(classifyUploadError(enoent)).toBe('local-source-missing')
  })

  it('preserva o kind real de um GoogleApiError (nunca vira "unexpected" por engano)', () => {
    expect(classifyUploadError(new GoogleApiError('auth-expired', 'sessão expirada'))).toBe('auth-expired')
  })

  it('um erro de rede real (ENOTFOUND, não ENOENT) não é confundido com pasta local ausente', () => {
    const networkError = Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' })
    expect(classifyUploadError(networkError)).toBe('unexpected')
  })

  it('um erro genérico sem código vira "unexpected"', () => {
    expect(classifyUploadError(new Error('algo deu errado'))).toBe('unexpected')
  })

  it('um valor não-Error (ex.: string lançada) nunca quebra a classificação', () => {
    expect(classifyUploadError('erro cru')).toBe('unexpected')
    expect(classifyUploadError(null)).toBe('unexpected')
    expect(classifyUploadError(undefined)).toBe('unexpected')
  })
})
