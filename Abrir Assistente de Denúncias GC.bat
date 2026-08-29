@echo off
setlocal

title Assistente de Denuncias GC (Beta) - Modo de teste

rem Sempre roda a partir da pasta onde este arquivo esta, nao importa
rem de onde foi clicado (funciona clicando direto no Explorer, por um
rem atalho, ou de qualquer outro lugar).
cd /d "%~dp0"

echo ============================================================
echo   Assistente de Denuncias GC (Beta)  -  Modo de teste
echo ============================================================
echo.
echo Esta janela e so uma janela tecnica que o aplicativo precisa
echo para funcionar enquanto estiver em desenvolvimento. Pode deixar
echo ela aberta ao lado - o aplicativo de verdade vai abrir em uma
echo janela separada em alguns instantes.
echo.

where node >nul 2>nul
if errorlevel 1 (
    echo [ERRO] Nao encontramos o Node.js instalado neste computador.
    echo.
    echo Este aplicativo, enquanto ainda esta em desenvolvimento, precisa
    echo do Node.js para funcionar. Baixe e instale a versao "LTS" em:
    echo.
    echo     https://nodejs.org
    echo.
    echo Depois de instalar, feche esta janela e clique de novo neste
    echo arquivo para tentar de novo.
    echo.
    pause
    exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
    echo [ERRO] O Node.js foi encontrado, mas o npm, que normalmente vem
    echo junto com ele, nao foi encontrado. Tente reinstalar o Node.js
    echo pelo site oficial:
    echo.
    echo     https://nodejs.org
    echo.
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo As pecas internas do aplicativo ainda nao foram preparadas
    echo neste computador. Isso costuma acontecer so na primeira vez e
    echo pode levar alguns minutos - por favor aguarde...
    echo.
    call npm install
    if errorlevel 1 (
        echo.
        echo [ERRO] Nao foi possivel preparar o aplicativo.
        echo Verifique sua conexao com a internet e tente novamente.
        echo Se o problema continuar, avise quem esta te ajudando com o
        echo aplicativo e mostre esta mensagem.
        echo.
        pause
        exit /b 1
    )
    echo.
    echo Preparacao concluida.
    echo.
)

echo Abrindo o aplicativo, aguarde...
echo.

call npm run dev

echo.
echo O aplicativo foi fechado.
echo.
pause
