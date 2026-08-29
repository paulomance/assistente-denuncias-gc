import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

/**
 * Testa a lógica de retomada/pulo/falha-parcial de `uploadReport()` — a
 * correção real desta rodada para o bug de pastas órfãs duplicadas em
 * retries. Só o que é EXTERNO de verdade é mockado: a rede do Google
 * (`googleapis`) e a autenticação (`GoogleAuthManager`, que por sua vez
 * depende do Electron `app`/`safeStorage`/`shell` reais). Tudo o mais —
 * a leitura do diretório `audio/` dentro de `reportDir` — roda contra um
 * diretório temporário REAL (mesma disciplina de audioPlayback.test.ts),
 * não um mock de `fs`.
 *
 * Não é possível validar aqui o comportamento contra a API real do
 * Google Drive (precisaria de credenciais OAuth reais e uma conta de
 * teste) — isso permanece não validado neste ambiente. O que este
 * arquivo prova é que a lógica de CONTROLE (quais arquivos pular, que
 * pasta reaproveitar, quando retornar 'partial' vs 'success', quando
 * checkpointar) está correta para as respostas que o Google devolveria.
 */

const filesCreate = vi.fn()
const filesGet = vi.fn()
const permissionsCreate = vi.fn()

vi.mock('googleapis', () => ({
  google: {
    drive: () => ({
      files: { create: filesCreate, get: filesGet },
      permissions: { create: permissionsCreate }
    })
  }
}))

vi.mock('./GoogleAuthManager', () => ({
  GoogleAuthManager: vi.fn().mockImplementation(() => ({
    getAuthorizedClient: vi.fn().mockResolvedValue({}),
    getAuthStatus: vi.fn(),
    signIn: vi.fn(),
    signOut: vi.fn()
  }))
}))

let reportDir: string

function writeAudioFile(steamId64: string, name = `player_${steamId64}.wav`): void {
  const audioDir = join(reportDir, 'audio')
  mkdirSync(audioDir, { recursive: true })
  writeFileSync(join(audioDir, name), Buffer.from('fake-wav-bytes'))
}

function writeChatFile(steamId64: string, name = `player_${steamId64}.txt`): void {
  const chatDir = join(reportDir, 'chat')
  mkdirSync(chatDir, { recursive: true })
  writeFileSync(join(chatDir, name), '[GERAL] oi\n')
}

/**
 * Um cliente real do Google consumiria o stream de `media.body` pra
 * enviar os bytes pela rede. Se o mock simplesmente resolve sem ler o
 * stream, o Node abre o arquivo de forma preguiçosa (lazy) em algum
 * momento depois — que pode cair depois do `afterEach` já ter apagado o
 * diretório temporário, virando uma exceção não tratada que não tem
 * nada a ver com a lógica sendo testada. Drenar o stream aqui imita o
 * comportamento real e mantém o teste determinístico.
 */
function drainMediaBody(params: { media?: { body?: NodeJS.ReadableStream } }): Promise<void> {
  const stream = params.media?.body
  if (!stream) return Promise.resolve()
  return new Promise((resolve, reject) => {
    stream.on('data', () => {})
    stream.on('end', () => resolve())
    stream.on('error', reject)
  })
}

function resolveWith(id: string) {
  return async (params: { media?: { body?: NodeJS.ReadableStream } }): Promise<{ data: { id: string } }> => {
    await drainMediaBody(params)
    return { data: { id } }
  }
}

function rejectWith(error: Error) {
  return async (params: { media?: { body?: NodeJS.ReadableStream } }): Promise<never> => {
    await drainMediaBody(params)
    throw error
  }
}

beforeEach(() => {
  reportDir = mkdtempSync(join(tmpdir(), 'gc-drive-provider-test-'))
  filesCreate.mockReset()
  filesGet.mockReset()
  permissionsCreate.mockReset()
})

afterEach(() => {
  rmSync(reportDir, { recursive: true, force: true })
})

async function freshProvider(): Promise<InstanceType<typeof import('./GoogleDriveProvider').GoogleDriveProvider>> {
  vi.resetModules()
  const { GoogleDriveProvider } = await import('./GoogleDriveProvider')
  return new GoogleDriveProvider()
}

describe('GoogleDriveProvider.uploadReport — pasta de áudio ausente/vazia (bug real corrigido)', () => {
  it('NUNCA cria uma pasta vazia no Drive nem retorna sucesso quando audio/ não existe', async () => {
    // Sem writeAudioFile() nenhum — reportDir existe (mkdtempSync no
    // beforeEach) mas audio/ nunca foi criada, simulando os arquivos
    // terem sido removidos por fora do app depois de organizados.
    const provider = await freshProvider()
    await expect(provider.uploadReport(reportDir, 'report-1')).rejects.toMatchObject({
      kind: 'local-source-missing'
    })
    expect(filesCreate).not.toHaveBeenCalled()
    expect(permissionsCreate).not.toHaveBeenCalled()
  })

  it('NUNCA cria uma pasta vazia quando audio/ existe mas está vazia', async () => {
    mkdirSync(join(reportDir, 'audio'), { recursive: true })
    const provider = await freshProvider()
    await expect(provider.uploadReport(reportDir, 'report-1')).rejects.toMatchObject({
      kind: 'local-source-missing'
    })
    expect(filesCreate).not.toHaveBeenCalled()
  })

  it('retomar um checkpoint com arquivos já confirmados NÃO dispara o erro, mesmo com audio/ ausente', async () => {
    // completed > 0 vindo do resumeFrom — não é o cenário de "nada pra
    // enviar", é uma retomada legítima (o guard só deve disparar
    // quando total===0 E completed===0).
    filesGet.mockResolvedValueOnce({ data: { webViewLink: 'https://drive.google.com/folder-existente' } })
    const provider = await freshProvider()
    const result = await provider.uploadReport(reportDir, 'report-1', undefined, {
      folderId: 'folder-existente',
      fileIdsBySteamId64: { '76561198000000001': 'file-1-ja-confirmado' }
    })
    expect(result.status).toBe('success')
  })
})

describe('GoogleDriveProvider.uploadReport — envio do zero (sem resumeFrom)', () => {
  it('cria a pasta, envia todos os arquivos e retorna sucesso com o link', async () => {
    writeAudioFile('76561198000000001')
    writeAudioFile('76561198000000002')
    filesCreate
      .mockImplementationOnce(resolveWith('folder-1'))
      .mockImplementationOnce(resolveWith('file-1'))
      .mockImplementationOnce(resolveWith('file-2'))
    filesGet.mockResolvedValueOnce({ data: { webViewLink: 'https://drive.google.com/folder-1' } })

    const provider = await freshProvider()
    const result = await provider.uploadReport(reportDir, 'report-1')

    expect(result.status).toBe('success')
    if (result.status !== 'success') throw new Error('esperado sucesso')
    expect(result.folderId).toBe('folder-1')
    expect(result.shareLink).toBe('https://drive.google.com/folder-1')
    expect(Object.keys(result.fileIdsBySteamId64).sort()).toEqual([
      '76561198000000001',
      '76561198000000002'
    ])
    expect(filesCreate).toHaveBeenCalledTimes(3) // 1 pasta + 2 arquivos
    expect(permissionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ fileId: 'folder-1', requestBody: { role: 'reader', type: 'anyone' } })
    )
  })

  it('nunca compartilha a pasta (não chama permissions.create) se algum arquivo falhar', async () => {
    writeAudioFile('76561198000000001')
    writeAudioFile('76561198000000002')
    filesCreate
      .mockImplementationOnce(resolveWith('folder-1'))
      .mockImplementationOnce(resolveWith('file-1'))
      .mockImplementationOnce(rejectWith(new Error('network error')))

    const provider = await freshProvider()
    const result = await provider.uploadReport(reportDir, 'report-1')

    expect(result.status).toBe('partial')
    expect(permissionsCreate).not.toHaveBeenCalled()
    expect(filesGet).not.toHaveBeenCalled()
  })
})

describe('GoogleDriveProvider.uploadReport — falha parcial', () => {
  it('continua tentando os demais arquivos quando um falha, em vez de abortar tudo', async () => {
    writeAudioFile('76561198000000001')
    writeAudioFile('76561198000000002')
    writeAudioFile('76561198000000003')
    filesCreate
      .mockImplementationOnce(resolveWith('folder-1'))
      .mockImplementationOnce(resolveWith('file-1'))
      .mockImplementationOnce(rejectWith(new Error('falha transitória')))
      .mockImplementationOnce(resolveWith('file-3'))

    const provider = await freshProvider()
    const result = await provider.uploadReport(reportDir, 'report-1')

    expect(result.status).toBe('partial')
    if (result.status !== 'partial') throw new Error('esperado parcial')
    expect(result.failedSteamIds).toEqual(['76561198000000002'])
    expect(Object.keys(result.fileIdsBySteamId64).sort()).toEqual([
      '76561198000000001',
      '76561198000000003'
    ])
    // 3 arquivos tentados mesmo após a falha do segundo — nenhum é pulado.
    expect(filesCreate).toHaveBeenCalledTimes(4) // 1 pasta + 3 arquivos
  })

  it('classifica a falha real (não descarta o motivo) — sessão expirada vira errorKind "auth-expired"', async () => {
    // Achado real numa auditoria: antes, o catch por arquivo descartava
    // o erro por completo, então uma falha parcial NUNCA distinguia
    // "sua sessão expirou" de qualquer outro motivo — a UI só oferecia
    // "tentar de novo" mesmo quando isso repetiria o mesmo erro.
    writeAudioFile('76561198000000001')
    writeAudioFile('76561198000000002')
    const authExpiredError = Object.assign(new Error('unauthorized'), { response: { status: 401 } })
    filesCreate
      .mockImplementationOnce(resolveWith('folder-1'))
      .mockImplementationOnce(resolveWith('file-1'))
      .mockImplementationOnce(rejectWith(authExpiredError))

    const provider = await freshProvider()
    const result = await provider.uploadReport(reportDir, 'report-1')

    expect(result.status).toBe('partial')
    if (result.status !== 'partial') throw new Error('esperado parcial')
    expect(result.errorKind).toBe('auth-expired')
  })

  it('classifica uma falha de rede real como errorKind "network-unavailable"', async () => {
    writeAudioFile('76561198000000001')
    writeAudioFile('76561198000000002')
    const networkError = Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' })
    filesCreate
      .mockImplementationOnce(resolveWith('folder-1'))
      .mockImplementationOnce(resolveWith('file-1'))
      .mockImplementationOnce(rejectWith(networkError))

    const provider = await freshProvider()
    const result = await provider.uploadReport(reportDir, 'report-1')

    expect(result.status).toBe('partial')
    if (result.status !== 'partial') throw new Error('esperado parcial')
    expect(result.errorKind).toBe('network-unavailable')
  })
})

describe('GoogleDriveProvider.uploadReport — retomada (resumeFrom)', () => {
  it('reaproveita a pasta existente em vez de criar uma nova', async () => {
    writeAudioFile('76561198000000001')
    writeAudioFile('76561198000000002')
    filesCreate.mockImplementationOnce(resolveWith('file-2'))
    filesGet.mockResolvedValueOnce({ data: { webViewLink: 'https://drive.google.com/folder-existente' } })

    const provider = await freshProvider()
    const result = await provider.uploadReport(reportDir, 'report-1', undefined, {
      folderId: 'folder-existente',
      fileIdsBySteamId64: { '76561198000000001': 'file-1-ja-confirmado' }
    })

    expect(result.status).toBe('success')
    if (result.status !== 'success') throw new Error('esperado sucesso')
    expect(result.folderId).toBe('folder-existente')
    // Só o arquivo que faltava foi enviado — 1 chamada, não 2.
    expect(filesCreate).toHaveBeenCalledTimes(1)
    expect(result.fileIdsBySteamId64).toEqual({
      '76561198000000001': 'file-1-ja-confirmado',
      '76561198000000002': 'file-2'
    })
  })

  it('não reenvia nenhum arquivo se todos já estavam confirmados no checkpoint', async () => {
    writeAudioFile('76561198000000001')
    filesGet.mockResolvedValueOnce({ data: { webViewLink: 'https://drive.google.com/folder-existente' } })

    const provider = await freshProvider()
    const result = await provider.uploadReport(reportDir, 'report-1', undefined, {
      folderId: 'folder-existente',
      fileIdsBySteamId64: { '76561198000000001': 'file-1-ja-confirmado' }
    })

    expect(result.status).toBe('success')
    expect(filesCreate).not.toHaveBeenCalled()
  })
})

describe('GoogleDriveProvider.uploadReport — checkpoint incremental (onCheckpoint)', () => {
  it('chama onCheckpoint após criar a pasta e após cada arquivo confirmado', async () => {
    writeAudioFile('76561198000000001')
    writeAudioFile('76561198000000002')
    filesCreate
      .mockImplementationOnce(resolveWith('folder-1'))
      .mockImplementationOnce(resolveWith('file-1'))
      .mockImplementationOnce(resolveWith('file-2'))
    filesGet.mockResolvedValueOnce({ data: { webViewLink: 'https://drive.google.com/folder-1' } })

    const checkpoints: { folderId: string; fileIdsBySteamId64: Record<string, string> }[] = []
    const provider = await freshProvider()
    await provider.uploadReport(reportDir, 'report-1', undefined, undefined, (checkpoint) => {
      // Snapshot: `checkpoint.fileIdsBySteamId64` é o MESMO objeto
      // mutável reaproveitado em toda a execução (ver
      // GoogleDriveProvider.ts) — sem copiar aqui, todo item já
      // empurrado no array acabaria refletindo o estado FINAL, não o
      // estado no momento da chamada. Em produção isso é seguro porque
      // quem consome (driveHandlers.ts) faz `JSON.stringify` de forma
      // síncrona antes de qualquer mutação seguinte.
      checkpoints.push({ folderId: checkpoint.folderId, fileIdsBySteamId64: { ...checkpoint.fileIdsBySteamId64 } })
    })

    // 1 checkpoint pra pasta + 1 por arquivo confirmado = 3
    expect(checkpoints).toHaveLength(3)
    expect(checkpoints[0]).toEqual({ folderId: 'folder-1', fileIdsBySteamId64: {} })
    expect(Object.keys(checkpoints[2].fileIdsBySteamId64)).toHaveLength(2)
  })

  it('não chama onCheckpoint para arquivos que falham', async () => {
    writeAudioFile('76561198000000001')
    filesCreate
      .mockImplementationOnce(resolveWith('folder-1'))
      .mockImplementationOnce(rejectWith(new Error('falha')))

    const checkpoints: unknown[] = []
    const provider = await freshProvider()
    await provider.uploadReport(reportDir, 'report-1', undefined, undefined, (checkpoint) => {
      checkpoints.push(checkpoint)
    })

    // Só o checkpoint da criação da pasta — o arquivo que falhou não gera um.
    expect(checkpoints).toHaveLength(1)
  })
})

describe('GoogleDriveProvider.folderExists', () => {
  it('retorna true quando o Google confirma a pasta e ela não está na lixeira', async () => {
    filesGet.mockResolvedValueOnce({ data: { id: 'folder-1', trashed: false } })

    const provider = await freshProvider()
    await expect(provider.folderExists('folder-1')).resolves.toBe(true)
    expect(filesGet).toHaveBeenCalledWith({ fileId: 'folder-1', fields: 'id,trashed' })
  })

  it('retorna false quando a pasta está na lixeira do Drive (excluída, mas não esvaziada ainda)', async () => {
    filesGet.mockResolvedValueOnce({ data: { id: 'folder-1', trashed: true } })

    const provider = await freshProvider()
    await expect(provider.folderExists('folder-1')).resolves.toBe(false)
  })

  it('retorna false apenas numa confirmação real de 404 do Google (pasta excluída de vez)', async () => {
    const notFoundError = Object.assign(new Error('not found'), { response: { status: 404 } })
    filesGet.mockRejectedValueOnce(notFoundError)

    const provider = await freshProvider()
    await expect(provider.folderExists('folder-1')).resolves.toBe(false)
  })

  it('RELANÇA (não retorna false) numa falha ambígua de sessão expirada — nunca acusar sem confirmação real', async () => {
    const authExpiredError = Object.assign(new Error('unauthorized'), { response: { status: 401 } })
    filesGet.mockRejectedValueOnce(authExpiredError)

    const provider = await freshProvider()
    await expect(provider.folderExists('folder-1')).rejects.toMatchObject({ kind: 'auth-expired' })
  })

  it('RELANÇA (não retorna false) numa falha ambígua de rede — nunca acusar sem confirmação real', async () => {
    const networkError = Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' })
    filesGet.mockRejectedValueOnce(networkError)

    const provider = await freshProvider()
    await expect(provider.folderExists('folder-1')).rejects.toMatchObject({ kind: 'network-unavailable' })
  })
})

describe('GoogleDriveProvider.uploadReport — progresso real (onProgress)', () => {
  it('reporta contagem real de arquivos, nunca uma porcentagem inventada', async () => {
    writeAudioFile('76561198000000001')
    writeAudioFile('76561198000000002')
    filesCreate
      .mockImplementationOnce(resolveWith('folder-1'))
      .mockImplementationOnce(resolveWith('file-1'))
      .mockImplementationOnce(resolveWith('file-2'))
    filesGet.mockResolvedValueOnce({ data: { webViewLink: 'https://drive.google.com/folder-1' } })

    const progressEvents: { stage: string; completed: number; total: number }[] = []
    const provider = await freshProvider()
    await provider.uploadReport(reportDir, 'report-1', (progress) => progressEvents.push(progress))

    expect(progressEvents[0]).toEqual({ stage: 'creating-folder', completed: 0, total: 2 })
    expect(progressEvents.some((p) => p.stage === 'uploading' && p.completed === 2 && p.total === 2)).toBe(
      true
    )
    expect(progressEvents.at(-1)).toEqual({ stage: 'finalizing', completed: 2, total: 2 })
  })
})

describe('GoogleDriveProvider.uploadReport — chat de texto (evidência independente do áudio)', () => {
  it('envia áudio E chat na mesma pasta, rastreados em dicionários separados', async () => {
    writeAudioFile('76561198000000001')
    writeChatFile('76561198000000001')
    filesCreate
      .mockImplementationOnce(resolveWith('folder-1'))
      .mockImplementationOnce(resolveWith('file-audio-1'))
      .mockImplementationOnce(resolveWith('file-chat-1'))
    filesGet.mockResolvedValueOnce({ data: { webViewLink: 'https://drive.google.com/folder-1' } })

    const provider = await freshProvider()
    const result = await provider.uploadReport(reportDir, 'report-1')

    expect(result.status).toBe('success')
    if (result.status !== 'success') throw new Error('esperado sucesso')
    expect(result.fileIdsBySteamId64).toEqual({ '76561198000000001': 'file-audio-1' })
    expect(result.chatFileIdsBySteamId64).toEqual({ '76561198000000001': 'file-chat-1' })
    expect(filesCreate).toHaveBeenCalledTimes(3) // 1 pasta + 1 audio + 1 chat
  })

  it('funciona com jogador SÓ-COM-CHAT (sem audio/ nenhum)', async () => {
    writeChatFile('76561198000000001')
    filesCreate.mockImplementationOnce(resolveWith('folder-1')).mockImplementationOnce(resolveWith('file-chat-1'))
    filesGet.mockResolvedValueOnce({ data: { webViewLink: 'https://drive.google.com/folder-1' } })

    const provider = await freshProvider()
    const result = await provider.uploadReport(reportDir, 'report-1')

    expect(result.status).toBe('success')
    if (result.status !== 'success') throw new Error('esperado sucesso')
    expect(result.fileIdsBySteamId64).toEqual({})
    expect(result.chatFileIdsBySteamId64).toEqual({ '76561198000000001': 'file-chat-1' })
  })

  it('falha parcial distingue falha de áudio de falha de chat (failedSteamIds vs failedChatSteamIds)', async () => {
    writeAudioFile('76561198000000001')
    writeChatFile('76561198000000002')
    filesCreate
      .mockImplementationOnce(resolveWith('folder-1'))
      .mockImplementationOnce(rejectWith(new Error('falha no áudio')))
      .mockImplementationOnce(rejectWith(new Error('falha no chat')))

    const provider = await freshProvider()
    const result = await provider.uploadReport(reportDir, 'report-1')

    expect(result.status).toBe('partial')
    if (result.status !== 'partial') throw new Error('esperado parcial')
    expect(result.failedSteamIds).toEqual(['76561198000000001'])
    expect(result.failedChatSteamIds).toEqual(['76561198000000002'])
  })

  it('retoma um checkpoint com chat já confirmado, sem reenviar (chatFileIdsBySteamId64 no resumeFrom)', async () => {
    writeChatFile('76561198000000001')
    // Nenhum filesCreate mockado pra chat — se tentasse reenviar, o
    // mock (undefined) quebraria o teste. Confirma que pula de verdade.
    filesGet.mockResolvedValueOnce({ data: { webViewLink: 'https://drive.google.com/folder-existente' } })

    const provider = await freshProvider()
    const result = await provider.uploadReport(reportDir, 'report-1', undefined, {
      folderId: 'folder-existente',
      fileIdsBySteamId64: {},
      chatFileIdsBySteamId64: { '76561198000000001': 'chat-ja-confirmado' }
    })

    expect(result.status).toBe('success')
    expect(filesCreate).not.toHaveBeenCalled()
  })

  it('resumeFrom sem chatFileIdsBySteamId64 (checkpoint gravado antes desta rodada) continua funcionando', async () => {
    writeAudioFile('76561198000000001')
    filesGet.mockResolvedValueOnce({ data: { webViewLink: 'https://drive.google.com/folder-existente' } })

    const provider = await freshProvider()
    const result = await provider.uploadReport(reportDir, 'report-1', undefined, {
      folderId: 'folder-existente',
      fileIdsBySteamId64: { '76561198000000001': 'ja-confirmado' }
      // chatFileIdsBySteamId64 ausente de propósito — simula um checkpoint antigo.
    })

    expect(result.status).toBe('success')
    if (result.status !== 'success') throw new Error('esperado sucesso')
    expect(result.chatFileIdsBySteamId64).toEqual({})
  })
})
