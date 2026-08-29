import { execFileSync } from 'child_process'

/**
 * Detecta se o processo atual roda elevado (Administrador) no Windows.
 * Investigação real (WebSearch + issues do Electron), não suposição:
 * `electron/electron#13288` e o blog oficial da Microsoft sobre UIPI
 * (Mandatory Integrity Control) confirmam que um app Electron rodando
 * elevado, ao receber um drag-and-drop de um Explorer NÃO elevado, mostra
 * exatamente o cursor de bloqueio (⊘/"não permitido") descrito pelo
 * usuário — o Windows nega a operação de OLE drag-and-drop entre
 * processos de nível de integridade diferente antes de qualquer evento
 * chegar ao processo de destino. Isso confirma que a hipótese em si é
 * real e correta; o problema encontrado nesta rodada foi na TECNICA de
 * deteccao (ver abaixo), não na hipótese.
 *
 * `net session` (tecnica usada na rodada anterior) se mostrou pouco
 * confiavel na pratica: o usuario reportou que o app acusava elevacao
 * mesmo com um PowerShell que ele acredita nao estar elevado. Causas
 * possiveis de falso positivo com `net session`: depende do servico
 * "Server" (LanmanServer) estar ativo, e depende de `net.exe` ser
 * resolvido do `System32` correto (ambiguidade de PATH em ambientes com
 * Git Bash/ferramentas Unix instaladas, comuns em maquinas de
 * desenvolvedor).
 *
 * Tecnica primaria agora: consultar o TOKEN de acesso do proprio
 * processo via .NET (`WindowsPrincipal.IsInRole(Administrator)`), que e
 * a forma canonica e oficial de verificar elevacao real no Windows — ao
 * contrario de checar so associacao ao grupo Administradores (que
 * continua listada mesmo SEM elevacao, por causa do token dividido do
 * UAC), `IsInRole` so retorna `true` quando o grupo esta de fato
 * habilitado no token, ou seja, quando o processo esta REALMENTE
 * elevado. Nao depende de nenhum servico do Windows nem de PATH
 * ambiguo (usa o caminho completo do PowerShell).
 *
 * `net session` continua rodando como verificacao cruzada, so para
 * log de diagnostico (nunca para decidir o resultado) — se as duas
 * tecnicas discordarem, isso fica registrado no console (modo dev) para
 * investigar depois, em vez de silenciosamente confiar na tecnica menos
 * confiavel.
 */

const POWERSHELL_PATH = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'

function checkViaPowerShellPrincipal(): boolean | null {
  try {
    const output = execFileSync(
      POWERSHELL_PATH,
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        '([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltinRole]::Administrator)'
      ],
      { windowsHide: true, timeout: 5000 }
    )
      .toString()
      .trim()

    if (output === 'True') return true
    if (output === 'False') return false
    return null
  } catch {
    return null
  }
}

function checkViaNetSession(): boolean | null {
  try {
    execFileSync('net', ['session'], { stdio: 'ignore', windowsHide: true, timeout: 3000 })
    return true
  } catch (error) {
    // ENOENT (comando nao encontrado) significa que essa tecnica nao da
    // pra confiar aqui, nao que "nao esta elevado".
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return null
    }
    return false
  }
}

export function isRunningElevated(): boolean {
  if (process.platform !== 'win32') return false

  const viaPowerShell = checkViaPowerShellPrincipal()
  const viaNetSession = checkViaNetSession()

  if (viaPowerShell !== null && viaNetSession !== null && viaPowerShell !== viaNetSession) {
    // Discordancia real entre as duas tecnicas — vale investigar, mas
    // nao decide o resultado sozinha (PowerShell e a tecnica primaria).
    console.warn(
      `[elevationCheck] Divergência entre técnicas de detecção: PowerShell(IsInRole)=${viaPowerShell}, net session=${viaNetSession}. Usando o resultado do PowerShell.`
    )
  }

  // PowerShell (tecnica canonica, baseada no token de acesso real) e
  // sempre a fonte da verdade quando disponivel. `net session` so serve
  // de fallback se o PowerShell nao puder ser executado por algum
  // motivo (nunca deveria acontecer em um Windows padrao, mas nao
  // custa ter uma rede de seguranca). Sem nenhuma tecnica confiavel,
  // assume NAO elevado — nunca acusar o usuario sem uma leitura real.
  if (viaPowerShell !== null) return viaPowerShell
  if (viaNetSession !== null) return viaNetSession
  return false
}
