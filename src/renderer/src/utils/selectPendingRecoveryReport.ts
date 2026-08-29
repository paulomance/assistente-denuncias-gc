import type { ReportHistoryEntry } from '../../../shared/types/History'

/**
 * Uma denúncia "pendente" pra fins de recuperação ao reabrir o app é
 * qualquer uma que já tem cópia local (áudios extraídos + organizados —
 * só entram no histórico depois disso, ver EvidenceOrganizer.ts) mas
 * ainda não terminou de ser enviada ao Google Drive (`status !==
 * 'uploaded'`). Cobre os 3 sub-casos que a tela de recuperação precisa
 * diferenciar (ver PendingReportBanner.tsx): nunca tentado ('local'),
 * interrompido no meio ('uploading' — só fica assim entre reinícios se
 * o app fechou/travou durante um envio, já que o main process nunca
 * deixa esse status "pendurado" numa sessão que segue rodando), ou
 * tentado e não concluído ('upload-failed').
 *
 * Só o mais recente é retornado — mostrar uma fila de N pendências não
 * foi pedido e adicionaria complexidade desproporcional; as demais
 * continuam visíveis e recuperáveis normalmente pela tela "Minhas
 * provas" (histórico completo).
 */
export function selectPendingRecoveryReport(reports: ReportHistoryEntry[]): ReportHistoryEntry | null {
  const pending = reports.filter((report) => report.hasLocalCopy && report.status !== 'uploaded')
  if (pending.length === 0) return null

  const sorted = [...pending].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  return sorted[0]
}
