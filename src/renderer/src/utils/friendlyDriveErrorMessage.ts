import type { CloudStorageErrorKind } from '../../../shared/types/CloudStorage'

/**
 * Nunca expor codigo/mensagem crua do Google na UI (regra explicita do
 * usuario) — cada categoria de erro (ver CloudStorageErrorKind) vira uma
 * frase acionavel em portugues.
 */
export function friendlyDriveErrorMessage(kind: CloudStorageErrorKind): string {
  switch (kind) {
    case 'not-signed-in':
      return 'Você precisa conectar sua conta do Google primeiro.'
    case 'auth-cancelled':
      return 'O login foi cancelado. Você pode tentar novamente quando quiser.'
    case 'auth-expired':
      return 'Sua sessão com o Google expirou. Conecte novamente para continuar.'
    case 'invalid-client-config':
      return 'Não foi possível configurar a conexão com o Google. Entre em contato com o suporte.'
    case 'network-unavailable':
      return 'Não foi possível conectar à internet. Verifique sua conexão e tente novamente.'
    case 'upload-interrupted':
      return 'O envio foi interrompido no meio do caminho. Suas evidências continuam salvas neste computador.'
    case 'quota-exceeded':
      return 'Seu Google Drive está sem espaço disponível. Libere espaço na sua conta e tente novamente.'
    case 'not-found':
      return 'Não foi possível encontrar a pasta no Google Drive. Tente enviar novamente.'
    case 'permission-denied':
      return 'O aplicativo não tem permissão para acessar seu Google Drive. Tente conectar novamente.'
    case 'already-uploading':
      return 'Já existe um envio em andamento. Aguarde terminar antes de tentar de novo.'
    case 'local-source-missing':
      return 'Não encontramos mais os áudios desta prova neste computador — a pasta local parece ter sido removida ou movida. Para enviar ao Google Drive, processe a demo novamente para extrair os áudios.'
    case 'unexpected':
    default:
      return 'Não foi possível concluir o envio. Suas evidências continuam salvas neste computador. Você pode tentar novamente mais tarde.'
  }
}
