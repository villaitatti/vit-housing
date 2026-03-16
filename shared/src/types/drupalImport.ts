export type DrupalImportPhase =
  | 'upload_validation'
  | 'files_extraction'
  | 'temp_db_preparation'
  | 'sql_restore'
  | 'source_analysis'
  | 'user_import'
  | 'listing_import'
  | 'photo_import'
  | 'audit_write'
  | 'cleanup'
  | 'completed';

export type DrupalImportStatusCode =
  | 'idle'
  | 'uploading'
  | 'preflight_ready'
  | 'preflight_failed'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cleaning_up';

export interface DrupalImportSummary {
  source_users: number;
  source_listings: number;
  source_listing_photos: number;
  source_user_pictures: number;
  imported_users: number;
  linked_existing_users: number;
  skipped_users: number;
  imported_listings: number;
  linked_existing_listings: number;
  slug_collisions: number;
  missing_photos: number;
  warnings_count: number;
}

export interface DrupalImportWarning {
  code: string;
  message: string;
}

export interface DrupalImportArtifact {
  filename: string;
  uploaded_at: string;
  size_bytes: number;
}

export interface DrupalImportPreflightCheck {
  id: string;
  label: string;
  status: 'pass' | 'warn' | 'fail';
  detail: string;
}

export interface DrupalImportStatus {
  status: DrupalImportStatusCode;
  phase: DrupalImportPhase | null;
  progress_percent: number;
  current_step: string;
  detail_message: string;
  started_at: string | null;
  finished_at: string | null;
  summary: DrupalImportSummary;
  warnings: DrupalImportWarning[];
  error_summary: string | null;
  log_available: boolean;
  audit_available: boolean;
  database_dump: DrupalImportArtifact | null;
  files_archive: DrupalImportArtifact | null;
  preflight_checks: DrupalImportPreflightCheck[];
  preflight_ready_at: string | null;
}

