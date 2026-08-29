import type { GcReportApi } from './index'

declare global {
  interface Window {
    gcReport: GcReportApi
  }
}
