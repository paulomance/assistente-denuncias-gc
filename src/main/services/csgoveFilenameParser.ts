export type ParsedCsgoveFilename =
  | { ok: true; steamId64: string; rawPlayerName: string }
  | { ok: false; reason: string }

/**
 * Interpreta o nome de um arquivo gerado pelo CSGOVE no modo padrao
 * (split-compact): "<demoBaseName>_<rawPlayerName>_<steamId64>.wav"
 * (nomenclatura confirmada empiricamente na Fase B2, nao documentacao).
 *
 * Recebe `demoBaseName` explicitamente (nome da demo original, sem
 * extensao, exatamente como foi passado ao CSGOVE) em vez de tentar
 * adivinhar onde ele termina dentro do nome do arquivo gerado. O nome da
 * demo pode ter qualquer formato — o usuario pode renomea-la livremente —
 * entao nao deve haver nenhuma suposicao sobre a estrutura interna dele
 * (mesma regra ja aplicada na Fase B5 do plano tecnico).
 *
 * O nome do jogador (`rawPlayerName`) e tratado como string opaca: pode
 * conter espacos, unicode e simbolos decorativos observados na validacao
 * empirica (ex.: "✓ ★ Nome do Jogador"). Nao deve ser usado como
 * identificador — o Steam ID64 e o identificador confiavel.
 */
export function parseCsgoveAudioFilename(
  fileName: string,
  demoBaseName: string
): ParsedCsgoveFilename {
  if (!fileName.toLowerCase().endsWith('.wav')) {
    return { ok: false, reason: 'Nome de arquivo nao termina em .wav.' }
  }

  const withoutExtension = fileName.slice(0, -4)
  const expectedPrefix = `${demoBaseName}_`

  if (!withoutExtension.startsWith(expectedPrefix)) {
    return { ok: false, reason: 'Nome de arquivo nao comeca com o nome da demo original.' }
  }

  const remainder = withoutExtension.slice(expectedPrefix.length)
  const lastUnderscoreIndex = remainder.lastIndexOf('_')

  if (lastUnderscoreIndex === -1) {
    return { ok: false, reason: 'Nao foi possivel separar nome do jogador e Steam ID64.' }
  }

  const rawPlayerName = remainder.slice(0, lastUnderscoreIndex)
  const steamId64 = remainder.slice(lastUnderscoreIndex + 1)

  if (rawPlayerName.length === 0) {
    return { ok: false, reason: 'Nome do jogador vazio.' }
  }

  // IDs Steam64 reais tem 17 digitos; aceitamos uma faixa um pouco mais
  // ampla (15-20) para nao quebrar por causa de um detalhe de formato
  // nao confirmado, mas sem aceitar qualquer sequencia numerica.
  if (!/^\d{15,20}$/.test(steamId64)) {
    return { ok: false, reason: `Steam ID64 invalido: "${steamId64}".` }
  }

  return { ok: true, steamId64, rawPlayerName }
}
