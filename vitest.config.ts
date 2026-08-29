import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // `.test.tsx` (novo nesta rodada) roda testes de componente React
    // real via @testing-library/react — precisa do ambiente `jsdom`
    // (window/document simulados). `.test.ts` (main process/utils
    // puros) continua rodando no mesmo ambiente: `fs`/`path`/`os` do
    // Node funcionam normalmente sob jsdom, o jsdom só adiciona
    // globals de DOM, nunca remove APIs do Node — confirmado empiricamente
    // rodando a suíte inteira depois desta mudança, nenhum teste
    // existente quebrou.
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'jsdom'
  }
})
