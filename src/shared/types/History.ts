import type { ReportStatus } from './Evidence'
import type { CloudStorageErrorKind } from './CloudStorage'

export interface ReportHistoryEntry {
  reportId: string
  folderPath: string
  createdAt: string
  originalDemoFileName: string
  matchId: string | null
  map: string | null
  players: { steamId64: string; displayName: string }[]
  status: ReportStatus
  hasLocalCopy: boolean
  localSizeBytes: number
  driveShareLink: string | null
  driveFolderId: string | null
}

export type DeleteLocalCopyResult =
  | { status: 'success' }
  | { status: 'error'; reason: 'upload-in-progress' | 'unexpected' }

export type DeleteDriveReportResult =
  | { status: 'success' }
  | { status: 'error'; errorKind: CloudStorageErrorKind }
