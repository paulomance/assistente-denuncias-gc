// Gera o .ico multi-resolucao oficial do app a partir da imagem-fonte
// real (resources/icons/report-tool-icon.png) — nunca renomeando um
// PNG pra .ico (o Windows exige o formato de container real, com uma
// entrada por resolucao).
//
// Empacotador do ICO escrito a mao aqui de proposito, sem depender de
// um pacote pronto: a alternativa mais comum do ecossistema npm
// (`to-ico`) traz uma arvore de dependencias antiga (jimp -> request/
// jpeg-js/mkdirp/minimist) com varias vulnerabilidades reais e ja
// conhecidas (SSRF, prototype pollution, DoS por loop infinito —
// confirmado via `npm audit` real ao instalar, nao suposicao),
// removida logo em seguida. O formato ICO em si e simples o bastante
// pra nao precisar de pacote nenhum: Windows Vista+ aceita PNG cru
// dentro de cada entrada do ICO (nao precisa reimplementar BMP/DIB) —
// so um cabecalho + um diretorio de entradas + os PNGs redimensionados
// por `sharp` (unica dependencia nova, sem vulnerabilidades conhecidas
// na arvore, usada so pra redimensionar).
//
// Rodar de novo sempre que a imagem-fonte mudar:
//   npm run icon:generate
'use strict'

const { writeFileSync } = require('node:fs')
const { join } = require('node:path')
const sharp = require('sharp')

const ROOT = join(__dirname, '..')
const SOURCE_PNG = join(ROOT, 'resources', 'icons', 'report-tool-icon.png')
const OUT_ICO = join(ROOT, 'resources', 'icons', 'report-tool-icon.ico')

// Faixa pedida explicitamente: cobre area de trabalho, Menu Iniciar,
// barra de tarefas, Explorador (em varios modos de exibicao) e o
// instalador NSIS (que usa o maior tamanho disponivel, 256, pra tela
// de instalacao em telas de alta densidade).
const SIZES = [16, 20, 24, 32, 40, 48, 64, 128, 256]

const ICO_HEADER_SIZE = 6
const ICO_DIR_ENTRY_SIZE = 16

// Alfa minimo pra contar um pixel como parte do desenho de verdade (nao
// so um resto de anti-aliasing quase invisivel na borda).
const OPAQUE_ALPHA_THRESHOLD = 200
// Margem mantida ao redor do conteudo detectado, como fracao do lado
// do recorte — pequena o bastante pra nao cortar rente (ainda parece
// um icone, nao uma captura de tela), grande o bastante pra corrigir o
// problema real medido: a arte original só ocupa ~82% da tela 1254x1254
// (margem transparente de ~124px por lado), fazendo o glifo parecer
// pequeno nos tamanhos de taskbar/área de trabalho comparado a outros
// apps. Achado real reportado pelo usuário ("ícone ficou muito
// pequena"), confirmado por varredura real de pixel (canal alfa), não
// suposição.
const CONTENT_MARGIN_FRACTION = 0.035

/**
 * Calcula a caixa delimitadora real do conteúdo opaco (varredura do
 * canal alfa, não um `trim()` de biblioteca — a arte tem cantos
 * arredondados então um trim ingênuo por linha/coluna já teria
 * detectado "conteúdo" nos cantos e não cortado nada, testado e
 * confirmado nesta rodada).
 */
async function computeOpaqueBoundingBox(imagePath) {
  const { data, info } = await sharp(imagePath).raw().ensureAlpha().toBuffer({ resolveWithObject: true })
  const { width, height, channels } = info
  let minX = width
  let maxX = -1
  let minY = height
  let maxY = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = data[(y * width + x) * channels + 3]
      if (alpha >= OPAQUE_ALPHA_THRESHOLD) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  return { minX, maxX, minY, maxY, canvasWidth: width, canvasHeight: height }
}

/**
 * Recorta a imagem-fonte pro conteúdo real (+ margem pequena),
 * SEMPRE um quadrado (o formato ICO não suporta proporção diferente de
 * 1:1) centrado no conteúdo detectado, sem esticar nem distorcer —
 * mesma técnica que ferramentas de geração de ícone profissionais usam
 * ("trim + pad"), aqui sem depender de nenhuma delas.
 */
async function buildTightSourceBuffer() {
  const bbox = await computeOpaqueBoundingBox(SOURCE_PNG)
  const contentWidth = bbox.maxX - bbox.minX
  const contentHeight = bbox.maxY - bbox.minY
  const contentSize = Math.max(contentWidth, contentHeight)
  const cropSize = Math.round(contentSize / (1 - 2 * CONTENT_MARGIN_FRACTION))

  const centerX = (bbox.minX + bbox.maxX) / 2
  const centerY = (bbox.minY + bbox.maxY) / 2
  const left = Math.max(0, Math.min(bbox.canvasWidth - cropSize, Math.round(centerX - cropSize / 2)))
  const top = Math.max(0, Math.min(bbox.canvasHeight - cropSize, Math.round(centerY - cropSize / 2)))
  const safeSize = Math.min(cropSize, bbox.canvasWidth - left, bbox.canvasHeight - top)

  console.log(
    `Conteúdo real detectado: ${contentWidth}x${contentHeight}px de um canvas ${bbox.canvasWidth}x${bbox.canvasHeight} ` +
      `(${((100 * contentWidth) / bbox.canvasWidth).toFixed(1)}% de preenchimento). ` +
      `Recortando pra ${safeSize}x${safeSize}px (+${(CONTENT_MARGIN_FRACTION * 100).toFixed(1)}% de margem) antes de gerar as resoluções.`
  )

  return sharp(SOURCE_PNG).extract({ left, top, width: safeSize, height: safeSize }).png().toBuffer()
}

async function main() {
  const tightSource = await buildTightSourceBuffer()
  const pngBuffers = await Promise.all(
    SIZES.map((size) =>
      sharp(tightSource)
        .resize(size, size, { fit: 'cover' })
        .png()
        .toBuffer()
    )
  )

  const header = Buffer.alloc(ICO_HEADER_SIZE)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type: 1 = icon
  header.writeUInt16LE(SIZES.length, 4) // numero de imagens

  const dirEntries = Buffer.alloc(ICO_DIR_ENTRY_SIZE * SIZES.length)
  let dataOffset = ICO_HEADER_SIZE + ICO_DIR_ENTRY_SIZE * SIZES.length

  SIZES.forEach((size, index) => {
    const buffer = pngBuffers[index]
    const entryOffset = index * ICO_DIR_ENTRY_SIZE
    // 256 e representado como 0 num campo de 1 byte (limite do formato ICO).
    dirEntries.writeUInt8(size === 256 ? 0 : size, entryOffset + 0) // width
    dirEntries.writeUInt8(size === 256 ? 0 : size, entryOffset + 1) // height
    dirEntries.writeUInt8(0, entryOffset + 2) // color count (0 = >=256 cores)
    dirEntries.writeUInt8(0, entryOffset + 3) // reserved
    dirEntries.writeUInt16LE(1, entryOffset + 4) // color planes
    dirEntries.writeUInt16LE(32, entryOffset + 6) // bits per pixel (RGBA)
    dirEntries.writeUInt32LE(buffer.length, entryOffset + 8) // tamanho dos dados
    dirEntries.writeUInt32LE(dataOffset, entryOffset + 12) // offset dos dados
    dataOffset += buffer.length
  })

  const icoBuffer = Buffer.concat([header, dirEntries, ...pngBuffers])
  writeFileSync(OUT_ICO, icoBuffer)
  console.log(`Escrito: ${OUT_ICO} (${SIZES.length} resoluções: ${SIZES.join(', ')})`)
}

main().catch((error) => {
  console.error('Falha ao gerar o ícone:', error)
  process.exit(1)
})
