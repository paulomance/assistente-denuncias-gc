# Assistente de Denúncias GC (Beta)

**Projeto independente, feito pela comunidade, para a comunidade.**

Aplicativo desktop para Windows que ajuda jogadores de Counter-Strike a
organizar provas de comunicação de voz de uma partida, para usar num
processo de denúncia de toxicidade.

> Este é um projeto independente, criado pela comunidade. **Não é um
> aplicativo oficial** e não possui vínculo, parceria, patrocínio ou
> representação da Gamers Club ou de qualquer outra plataforma. Veja a
> seção [Projeto independente](#projeto-independente) abaixo.

## O que é

A partir de uma demo (`.dem`) de uma partida de CS, o app identifica os
jogadores, extrai a comunicação de voz de cada um (usando o
[CSGOVE](#créditos), um projeto de código aberto de terceiros) e o chat
de texto da partida, e organiza tudo como uma prova pronta para anexar
num formulário de denúncia. Ele não substitui nem envia a denúncia por
você — só prepara a evidência.

## Para que serve

Se você joga CS competitivamente e passa por casos de toxicidade via
chat de voz, reunir prova costuma ser trabalhoso: é preciso encontrar a
demo, identificar quem falou o quê, e organizar isso de um jeito que a
equipe responsável pela denúncia consiga analisar. Este app automatiza
essa parte.

## Como funciona, em alto nível

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
5. **Utilizar os resultados no fluxo de denúncia apropriado** — você
   copia o link (ou usa a pasta local) e continua pelo formulário
   oficial de denúncia da plataforma — o app te leva até lá, mas o
   envio da denúncia em si acontece nesse formulário oficial, não
   dentro deste app.

## Compatibilidade

Só fatos confirmados:

- **Sistema operacional**: Windows 10 (build 1809 ou mais recente) ou
  Windows 11. Não testado em outras versões.
- **Arquitetura**: x64 (64-bit Intel/AMD). O build atual não roda em
  Windows ARM nativamente.
- **Origem da demo**: testado com demos reais baixadas da Gamers Club
  (`.dem` do motor CS2/Source 2). Demos de outras plataformas/fontes
  não foram testadas.
- **Sem necessidade de administrador** para uma instalação normal
  (por usuário).

## Como instalar

Quando um instalador estiver publicado numa release pública, esta
seção será atualizada com o link de download e o passo a passo. Por
enquanto, o app precisa ser compilado localmente — ver "Como
desenvolver" abaixo.

## Como desenvolver

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
- **Pendência legal não resolvida**: o release oficial do CSGOVE inclui
  dois arquivos que não são código do próprio CSGOVE —
  `tier0.dll` e `vaudio_celt.dll`, componentes do motor Source da
  Valve. Os termos exatos de redistribuição desses dois arquivos
  especificamente não foram confirmados. Isso precisa de revisão
  jurídica antes de uma distribuição pública em larga escala — ver
  [`licenses/THIRD-PARTY-NOTICES.txt`](licenses/THIRD-PARTY-NOTICES.txt)
  para o detalhe completo.
- **Testado principalmente em ambiente de desenvolvimento**: o app
  ainda não passou por um período real de uso público.

## Segurança e privacidade

Descrição factual do que realmente acontece com os dados — nenhuma
promessa além do que está implementado:

- **Processado localmente**: a demo `.dem`, a identificação de
  jogadores/times, a extração de áudio e a organização das provas
  acontecem inteiramente no seu computador. A demo original não é
  copiada nem enviada a lugar nenhum.
- **Enviado a um serviço externo (opcional)**: se você conectar sua
  conta do Google e optar por isso, os áudios organizados são enviados
  ao **seu próprio** Google Drive (não a um servidor deste projeto —
  este projeto não opera nenhum servidor). Isso só acontece depois de
  você autenticar via login oficial do Google no seu navegador.
- **O que fica salvo localmente**: os áudios extraídos e um arquivo de
  metadados por denúncia (data, jogadores, status de envio), numa
  pasta que você pode escolher em Configurações.
- **O que você pode excluir**: a cópia local de qualquer prova (a
  qualquer momento, pela tela "Minhas provas") e a cópia no Google
  Drive (independentemente, com confirmação antes de excluir).
- Nenhum dado é coletado por telemetria, analytics ou qualquer serviço
  de terceiros além do Google Drive (e só quando você opta por
  conectar sua conta).

## Licença

O código deste projeto é licenciado sob a [Licença MIT](LICENSE). Isso
cobre só o código escrito aqui — não se estende ao CSGOVE (licença
própria, ver [Créditos](#créditos)) nem resolve a pendência jurídica
sobre `tier0.dll`/`vaudio_celt.dll` descrita em [Limitações
conhecidas](#limitações-conhecidas).
