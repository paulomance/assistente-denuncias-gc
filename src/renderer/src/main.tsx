import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/global.css'

/**
 * Rede de seguranca global contra o comportamento padrao do Chromium: se
 * um arquivo for solto em qualquer ponto da janela que nao tenha um
 * handler de drop proprio (fora da drop zone, por exemplo), o padrao e
 * navegar a janela inteira para aquele arquivo. Sem isso, um drop
 * "errado" nao só falha silenciosamente como pode navegar o app para
 * fora da UI React.
 */
window.addEventListener('dragover', (event) => event.preventDefault())
window.addEventListener('drop', (event) => event.preventDefault())

/*
 * Diagnostico so em dev: se um drag real do Windows Explorer nunca
 * disparar isto no DevTools, o evento nao esta chegando nem no nivel de
 * `window` — sinal de bloqueio no SO (ex.: UIPI, quando o processo do
 * Explorer roda com privilegio diferente do app), nao um bug de codigo
 * React/Electron. Investigacao em andamento apos 3 relatos do usuario de
 * que o drag continua nao funcionando mesmo depois de correcoes
 * evidenciadas (dropEffect, tratamento de caminho vazio) — ver
 * docs/plano-frente-b.md.
 */
if (import.meta.env.DEV) {
  window.addEventListener('dragenter', () => console.log('[main.tsx] window dragenter'))
  window.addEventListener('drop', () => console.log('[main.tsx] window drop'))
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
