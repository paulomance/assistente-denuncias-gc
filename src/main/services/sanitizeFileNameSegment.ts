/**
 * So remove caracteres invalidos em nomes de arquivo/pasta no Windows e
 * colapsa espacos — sem limitar tamanho nem decidir um fallback. Usado
 * tanto para nomes de jogador isolados (sanitizeFileNameSegment) quanto
 * para nomes de pasta compostos (reportFolderName.ts).
 */
export function stripInvalidFileNameChars(raw: string): string {
  return raw
    .trim()
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
}

/**
 * Remove caracteres invalidos em nomes de arquivo no Windows e limita o
 * tamanho, para usar nomes de jogadores (que podem ter praticamente
 * qualquer caractere unicode, incluindo simbolos decorativos — ver
 * validacao empirica da B2/B3) como parte de um nome de arquivo seguro.
 */
export function sanitizeFileNameSegment(raw: string, maxLength = 60): string {
  const cleaned = stripInvalidFileNameChars(raw).slice(0, maxLength)
  return cleaned.length > 0 ? cleaned : 'jogador'
}
