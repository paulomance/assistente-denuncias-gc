// Gera licenses/THIRD-PARTY-NOTICES.txt de verdade a partir das
// dependencias npm realmente instaladas (nunca escrito a mao) + um
// cabecalho fixo com os componentes que uma varredura de dependencias
// de producao nao capturaria sozinha: CSGOVE (nao e uma dependencia
// npm, roda como processo externo) e Electron/React/React DOM (ficam
// em devDependencies neste projeto mesmo empacotando de verdade no
// build — ver package.json).
//
// Rodar de novo sempre que uma dependencia de producao mudar:
//   npm run licenses:generate
'use strict'

const { execSync } = require('node:child_process')
const { readFileSync, writeFileSync, unlinkSync } = require('node:fs')
const { join } = require('node:path')

const ROOT = join(__dirname, '..')
const LICENSES_DIR = join(ROOT, 'licenses')
const OUT_FILE = join(LICENSES_DIR, 'THIRD-PARTY-NOTICES.txt')

const electronPkg = require(join(ROOT, 'node_modules', 'electron', 'package.json'))
const reactPkg = require(join(ROOT, 'node_modules', 'react', 'package.json'))
const reactDomPkg = require(join(ROOT, 'node_modules', 'react-dom', 'package.json'))

function quote(value) {
  return `"${value.replace(/"/g, '\\"')}"`
}

function runLicenseChecker(args, outFile) {
  const npxBin = process.platform === 'win32' ? 'npx.cmd' : 'npx'
  const commandLine = [
    npxBin,
    'license-checker-rseidelsohn',
    ...args.map(quote),
    '--plainVertical',
    '--out',
    quote(outFile)
  ].join(' ')
  execSync(commandLine, { cwd: ROOT, stdio: 'inherit' })
  const content = readFileSync(outFile, 'utf-8')
  unlinkSync(outFile)
  return content
}

const HEADER = `AVISOS DE TERCEIROS — Assistente de Denúncias Gamers Club
============================================================

Este aplicativo usa componentes de código aberto de terceiros. Este
arquivo reúne os avisos de copyright e o texto das licenças exigidos
por eles, conforme cada licença determina. Nenhum destes componentes
foi modificado por este projeto, salvo indicação em contrário.

Este documento existe só para cumprir as licenças de terceiros —
atribuir autores/projetos corretamente e disponibilizar os textos que
cada licença exige. Ele não descreve a arquitetura interna deste
aplicativo nem nada do ambiente em que foi desenvolvido.

Gerado automaticamente por scripts/generate-third-party-notices.js
(rode "npm run licenses:generate" pra atualizar depois de mudar uma
dependência) a partir das dependências reais instaladas, mais os
componentes empacotados manualmente abaixo (Electron, React, React
DOM — usados no build mas listados como devDependencies no
package.json deste projeto, então não aparecem sozinhos numa varredura
de produção; e o CSGOVE, que não é uma dependência npm).

Nota sobre o conteúdo abaixo: para pacotes que não distribuem um
arquivo de licença separado, a ferramenta usada para gerar este
documento (license-checker-rseidelsohn) inclui o texto mais próximo
disponível — em alguns casos, o README do próprio pacote — como forma
de não deixar de fora nenhum aviso de copyright ou termo de uso
possivelmente exigido. Trechos que não são texto de licença em si
(ex.: instruções de instalação do pacote) aparecem só por precaução,
não por serem individualmente obrigatórios; nada disso foi editado ou
resumido, para preservar o conteúdo exatamente como o autor de cada
pacote o publicou.

============================================================
CSGOVE (csgo-voice-extractor)
============================================================

Este aplicativo usa o CSGOVE, um projeto de código aberto de terceiros
(https://github.com/akiver/csgo-voice-extractor, de AkiVer) para
processar arquivos de demo do Counter-Strike e extrair as comunicações
de voz neles contidas. O CSGOVE roda como um processo externo (nunca
embutido no código-fonte deste projeto), e o binário e as DLLs que o
acompanham são usados sem nenhuma modificação, exatamente como
distribuídos no release oficial v3.1.6 — ficam em "resources/csgove/"
dentro da instalação deste app.

O CSGOVE é um projeto independente, sem qualquer vínculo com a Gamers
Club — não foi desenvolvido por ela, e seu uso aqui não implica
parceria, patrocínio ou endosso por parte do autor do CSGOVE.

Licença: MIT
Repositório: https://github.com/akiver/csgo-voice-extractor

MIT License

Copyright (c) 2022 AkiVer

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

NOTA IMPORTANTE (não resolvida — ver docs/HANDOFF.md): o release oficial
do CSGOVE (v3.1.6, win32-x64.zip, confirmado byte-a-byte contra a cópia
usada por este projeto) inclui, além do binário do próprio CSGOVE, dois
arquivos que não são código do autor do CSGOVE: \`tier0.dll\` e
\`vaudio_celt.dll\`, componentes do motor Source da Valve. Confirmado
tecnicamente: os dois arquivos estão de fato incluídos no instalador
deste app (ficam ao lado de csgove.exe em "resources/csgove/", o
mesmo local onde o Windows procura DLLs de que um .exe depende) — não
é uma suposição, é o que está empacotado de verdade. (Um terceiro
arquivo que acompanha o mesmo release, \`opus.dll\`, não faz parte
desta pendência: é a biblioteca de codec Opus/CELT da Xiph.org,
open source, sem relação com a Valve.)

O README do CSGOVE não documenta a origem exata nem os termos de
redistribuição de \`tier0.dll\`/\`vaudio_celt.dll\` especificamente — a
licença MIT acima cobre o código do próprio AkiVer, não necessariamente
esses dois binários de terceiros inclusos por conveniência no release
dele. Isso precisa de revisão jurídica antes de uma distribuição pública
em larga escala — não foi possível determinar com confiança, só por
pesquisa pública, os termos exatos de redistribuição desses dois
arquivos especificamente.

============================================================
Componentes empacotados no build (não capturados pela varredura de
dependências de produção — ver nota no cabeçalho)
============================================================

`

console.log('Gerando avisos dos componentes empacotados manualmente (Electron/React/React DOM)...')
const shippedDevDeps = runLicenseChecker(
  [
    '--includePackages',
    `electron@${electronPkg.version};react@${reactPkg.version};react-dom@${reactDomPkg.version}`
  ],
  join(LICENSES_DIR, '_tmp-shipped.txt')
)

console.log('Gerando avisos da árvore de dependências de produção...')
const productionTree = runLicenseChecker(
  ['--production', '--excludePackages', 'gc-report-tool@0.1.0'],
  join(LICENSES_DIR, '_tmp-production.txt')
)

const separator =
  '\n============================================================\n' +
  'Dependências de produção (árvore completa, geradas automaticamente)\n' +
  '============================================================\n\n'

writeFileSync(OUT_FILE, HEADER + shippedDevDeps + separator + productionTree, 'utf-8')
console.log(`Escrito: ${OUT_FILE}`)
