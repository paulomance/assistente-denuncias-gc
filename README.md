# Assistente de Denúncias GC (Beta)

**Projeto independente, feito pela comunidade, para a comunidade.**

Aplicativo desktop para Windows que ajuda jogadores de Counter-Strike a
organizar provas de comunicação de voz e texto de uma partida, para
usar num processo de denúncia de toxicidade.

> Este é um projeto independente, criado pela comunidade. **Não é um
> aplicativo oficial** e não possui vínculo, parceria, patrocínio ou
> representação da Gamers Club ou de qualquer outra plataforma. Veja a
> seção [Projeto independente](#projeto-independente) abaixo.

## O que é

A partir de uma demo (`.dem`) de uma partida de CS, o app identifica os
jogadores e as evidências disponíveis — áudio de voz (usando o
[CSGOVE](#créditos), um projeto de código aberto de terceiros) e chat
de texto — deixa você ouvir/ler e escolher o que quer denunciar, e
organiza tudo como uma prova pronta para anexar num formulário de
denúncia. Ele não substitui nem envia a denúncia por você — só prepara
a evidência.

Se você joga CS competitivamente e passa por casos de toxicidade,
reunir prova costuma ser trabalhoso: é preciso encontrar a demo,
identificar quem falou/escreveu o quê, e organizar isso de um jeito que
a equipe responsável pela denúncia consiga analisar. Este app
automatiza essa parte.

## Como baixar e instalar

1. Acesse a página de [**Releases**](../../releases/latest) deste
   repositório.
2. Baixe o instalador `.exe` mais recente (ex.:
   `assistente-denuncias-gc-setup-X.X.X.exe`).
3. Execute o instalador e siga os passos na tela.

Não é necessário instalar Node.js, Python, Git ou qualquer outra
dependência — o instalador já inclui tudo que o app precisa para
funcionar.

## Como usar

1. **Selecionar a demo** — você escolhe o arquivo `.dem` da partida
   (baixado da plataforma onde ela aconteceu).
2. **Processar informações** — o app lê a demo e identifica os
   jogadores, times e o mapa.
3. **Selecionar jogadores e evidências** — você escolhe quem quer
   denunciar e, pra cada um, se quer incluir o áudio, o chat de texto,
   ou os dois — podendo ouvir uma prévia do áudio e ler as mensagens de
   texto antes de decidir.
4. **Organizar arquivos** — o app guarda as evidências selecionadas
   numa pasta local e, opcionalmente, envia para o Google Drive do
   próprio usuário, gerando um link de compartilhamento.
5. **Continuar pelo canal oficial de denúncia** — você copia o link
   (ou usa a pasta local) e continua pelo formulário oficial de
   denúncia da plataforma — o app te leva até lá, mas o envio da
   denúncia em si acontece nesse formulário oficial, não dentro deste
   app.

## Requisitos

- **Sistema operacional**: Windows 10 (build 1809 ou mais recente) ou
  Windows 11. Não testado em outras versões.
- **Arquitetura**: x64 (64-bit Intel/AMD). O build atual não roda em
  Windows ARM nativamente.
- **Origem da demo**: testado com demos reais baixadas da Gamers Club
  (`.dem` do motor CS2/Source 2). Demos de outras plataformas/fontes
  não foram testadas.
- Não requer permissão de administrador para uma instalação normal
  (por usuário).

## Licença

O código deste projeto é licenciado sob a [Licença MIT](LICENSE). Isso
cobre só o código escrito aqui — não se estende ao CSGOVE (licença
própria, ver [Créditos](#créditos)) nem resolve a pendência descrita em
[Limitações conhecidas](#limitações-conhecidas).

## Créditos

Este aplicativo usa tecnologias e projetos de código aberto de
terceiros:

- **[CSGOVE](https://github.com/akiver/csgo-voice-extractor)**, de
  AkiVer (licença MIT) — usado para processar os arquivos de demo e
  extrair as comunicações de voz. Projeto independente, sem vínculo
  com este projeto nem com a Gamers Club.
- Diversas bibliotecas de código aberto (Electron, React e outras) —
  ver [`licenses/THIRD-PARTY-NOTICES.txt`](licenses/THIRD-PARTY-NOTICES.txt)
  para a lista completa de avisos e licenças.

## Projeto independente

Este é um projeto **independente**, mantido pela comunidade. Ele não é
um aplicativo oficial e não possui vínculo, parceria, patrocínio ou
representação da Gamers Club ou de qualquer outra plataforma
mencionada. Referências à Gamers Club neste projeto (como links para o
formulário de denúncia ou para a página de uma partida) existem apenas
porque são necessárias para explicar de onde vêm as demos e para onde
o usuário deve continuar o processo de denúncia — não implicam
afiliação.

## Limitações conhecidas

- **Assinatura de código**: o instalador não é assinado digitalmente.
  O Windows SmartScreen mostra um aviso ao abrir o instalador pela
  primeira vez ("Windows protegeu seu PC") — é esperado, não indica um
  problema com o arquivo.
- **Pendência de licenciamento documentada**: o release oficial do
  CSGOVE inclui dois arquivos que não são código do próprio CSGOVE —
  `tier0.dll` e `vaudio_celt.dll`, componentes do motor Source da
  Valve. Os termos exatos de redistribuição desses dois arquivos
  especificamente não foram confirmados publicamente — ver
  [`licenses/THIRD-PARTY-NOTICES.txt`](licenses/THIRD-PARTY-NOTICES.txt)
  para o detalhe completo.
- **Beta**: o app ainda está em fase inicial de uso público — feedback
  e reports de problemas são bem-vindos via
  [Issues](../../issues).

## Segurança e privacidade

Descrição factual do que realmente acontece com os dados — nenhuma
promessa além do que está implementado:

- **Processado localmente**: a demo `.dem`, a identificação de
  jogadores/times, a extração de áudio/texto e a organização das
  provas acontecem inteiramente no seu computador. A demo original não
  é copiada nem enviada a lugar nenhum.
- **Enviado a um serviço externo (opcional)**: se você conectar sua
  conta do Google e optar por isso, as evidências organizadas são
  enviadas ao **seu próprio** Google Drive (não a um servidor deste
  projeto — este projeto não opera nenhum servidor). Isso só acontece
  depois de você autenticar via login oficial do Google no seu
  navegador.
- **O que fica salvo localmente**: as evidências extraídas e um
  arquivo de metadados por denúncia (data, jogadores, status de
  envio), numa pasta que você pode escolher em Configurações.
- **O que você pode excluir**: a cópia local de qualquer prova (a
  qualquer momento, pela tela "Minhas provas") e a cópia no Google
  Drive (independentemente, com confirmação antes de excluir).
- Nenhum dado é coletado por telemetria, analytics ou qualquer serviço
  de terceiros além do Google Drive (e só quando você opta por
  conectar sua conta).
- O app verifica automaticamente se existe uma versão mais nova
  publicada neste repositório (via GitHub Releases) e oferece a opção
  de atualizar — nenhum dado da sua denúncia é enviado nessa
  verificação.

---

## Como desenvolver

Esta seção é para quem quer compilar o app a partir do código-fonte —
não é necessária para instalar/usar o app (ver
[Como baixar e instalar](#como-baixar-e-instalar) acima).

Pré-requisitos: [Node.js](https://nodejs.org) (versão LTS) e npm.

```bash
npm install
npm run dev
```

**Importante:** este repositório **não inclui** o binário do CSGOVE
(um executável de terceiros, não é código deste projeto — ver
[Créditos](#créditos)) nem credenciais do Google OAuth, por não serem
apropriados para um repositório de código público. Para rodar o app
localmente com a funcionalidade completa:

- **CSGOVE**: baixe o release oficial correspondente
  (`win32-x64`) em
  [github.com/akiver/csgo-voice-extractor/releases](https://github.com/akiver/csgo-voice-extractor/releases)
  e extraia o conteúdo em `tools/csgove/win32-x64/` na raiz deste
  projeto.
- **Google OAuth (opcional — só necessário para testar o envio ao
  Google Drive)**: crie suas próprias credenciais OAuth de "aplicativo
  desktop" no [Google Cloud Console](https://console.cloud.google.com/)
  e salve o arquivo JSON baixado como
  `credentials/google-oauth-client.json`.

Outros comandos úteis:

```bash
npm run typecheck   # verificação de tipos TypeScript
npm run test         # suíte de testes automatizados
npm run build        # build de produção do renderer/main
npm run dist:win     # gera um instalador Windows (NSIS)
```

Artefatos de build (`out/`, `release/`, `dist/`) e o próprio instalador
gerado nunca são commitados neste repositório — a única forma oficial
de distribuir uma versão é publicando-a em
[Releases](../../releases).
