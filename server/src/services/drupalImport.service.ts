import path from 'path';
import fs from 'fs/promises';
import { createReadStream } from 'fs';
import { createGunzip } from 'zlib';
import readline from 'readline';
import { promisify } from 'util';
import { execFile } from 'child_process';
import { createConnection, type Connection } from 'mysql2/promise';
import type {
  DrupalImportArtifact,
  DrupalImportPreflightCheck,
  DrupalImportStatus,
  DrupalImportSummary,
  DrupalImportWarning,
} from '@vithousing/shared';
import { prisma } from '../lib/prisma.js';
import {
  buildDrupalImportSummary,
  inspectDrupalSource,
  runDrupalImport,
  type MigrationAudit,
  type DrupalImportProgressUpdate,
} from '../lib/drupalImport.js';
import {
  isValidDrupalDatabaseDumpFilename,
  isValidDrupalFilesArchiveFilename,
} from '../lib/drupalImportArtifacts.js';

const execFileAsync = promisify(execFile);

type StoredDrupalImportStatus = DrupalImportStatus & {
  database_dump_path: string | null;
  files_archive_path: string | null;
  extracted_files_root: string | null;
  log_path: string | null;
  audit_path: string | null;
  runner_token: string | null;
  runner_kind: 'run' | 'preflight' | null;
  runner_heartbeat_at: string | null;
};

type UploadedArtifactKind = 'database_dump' | 'files_archive';

interface MysqlImportConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

const RUNTIME_DIR = path.resolve('server/.runtime/drupal-import');
const STAGING_DIR = path.join(RUNTIME_DIR, 'staging');
const INCOMING_DIR = path.join(RUNTIME_DIR, 'incoming');
const EXTRACTED_DIR = path.join(RUNTIME_DIR, 'extracted');
const ARTIFACTS_DIR = path.join(RUNTIME_DIR, 'artifacts');
const STATUS_FILE = path.join(RUNTIME_DIR, 'latest-status.json');
const PREFLIGHT_LOG_FILE = path.join(RUNTIME_DIR, 'preflight.log');
const MYSQL_CONNECT_TIMEOUT_MS = 10_000;
const MYSQL_QUERY_TIMEOUT_MS = 60_000;
const RUNNER_HEARTBEAT_INTERVAL_MS = 5_000;
const RUNNER_HEARTBEAT_TTL_MS = Number(process.env.DRUPAL_IMPORT_RUNNER_TTL_MS || '30000');

let activeRun: Promise<void> | null = null;
let activePreflight: Promise<void> | null = null;
let statusLock: Promise<void> = Promise.resolve();
let startupRecoveryPromise: Promise<void> | null = null;

async function withStatusLock<T>(callback: () => Promise<T>): Promise<T> {
  const previous = statusLock;
  let release: (() => void) | undefined;
  statusLock = new Promise<void>((resolve) => {
    release = resolve;
  });

  await previous;

  try {
    return await callback();
  } finally {
    if (release) {
      release();
    }
  }
}

function emptySummary(): DrupalImportSummary {
  return {
    source_users: 0,
    source_listings: 0,
    source_listing_photos: 0,
    source_user_pictures: 0,
    imported_users: 0,
    linked_existing_users: 0,
    skipped_users: 0,
    imported_listings: 0,
    linked_existing_listings: 0,
    slug_collisions: 0,
    missing_photos: 0,
    warnings_count: 0,
  };
}

function createDefaultStatus(): StoredDrupalImportStatus {
  return {
    status: 'idle',
    phase: null,
    progress_percent: 0,
    current_step: 'Upload a Drupal database dump and files archive to begin.',
    detail_message: 'Pantheon exports are accepted directly: *_database.sql.gz and *_files.tar.gz.',
    started_at: null,
    finished_at: null,
    summary: emptySummary(),
    warnings: [],
    error_summary: null,
    log_available: false,
    audit_available: false,
    database_dump: null,
    files_archive: null,
    preflight_checks: [],
    preflight_ready_at: null,
    database_dump_path: null,
    files_archive_path: null,
    extracted_files_root: null,
    log_path: null,
    audit_path: null,
    runner_token: null,
    runner_kind: null,
    runner_heartbeat_at: null,
  };
}

function createRunnerToken(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function isRunnerHeartbeatFresh(status: StoredDrupalImportStatus): boolean {
  if (!status.runner_token || !status.runner_heartbeat_at) {
    return false;
  }

  const heartbeatAt = new Date(status.runner_heartbeat_at).getTime();
  if (Number.isNaN(heartbeatAt)) {
    return false;
  }

  return (Date.now() - heartbeatAt) <= RUNNER_HEARTBEAT_TTL_MS;
}

function clearRunnerState(status: StoredDrupalImportStatus): StoredDrupalImportStatus {
  return {
    ...status,
    runner_token: null,
    runner_kind: null,
    runner_heartbeat_at: null,
  };
}

function recoverInterruptedStatus(status: StoredDrupalImportStatus): StoredDrupalImportStatus {
  if (status.runner_token && isRunnerHeartbeatFresh(status)) {
    return status;
  }

  const recovered = clearRunnerState(status);
  const hadInterruptedRun = status.status === 'running'
    || status.status === 'cleaning_up'
    || status.runner_kind === 'run';
  const hadInterruptedPreflight = status.runner_kind === 'preflight';

  if (!hadInterruptedRun && !hadInterruptedPreflight) {
    return recovered;
  }

  const recoveryMessage = status.runner_kind === 'preflight'
    ? 'A previous Drupal import preflight was interrupted and has been reset.'
    : 'A previous Drupal import run was interrupted and has been marked as failed.';

  if (status.runner_kind === 'preflight') {
    return {
      ...recovered,
      status: 'preflight_failed',
      phase: 'source_analysis',
      progress_percent: 0,
      current_step: 'Preflight interrupted',
      detail_message: recoveryMessage,
      error_summary: recoveryMessage,
      summary: emptySummary(),
      warnings: [],
      preflight_checks: [],
      preflight_ready_at: null,
      extracted_files_root: null,
    };
  }

  return {
    ...recovered,
    status: 'failed',
    finished_at: new Date().toISOString(),
    current_step: 'Drupal migration interrupted',
    detail_message: recoveryMessage,
    error_summary: recoveryMessage,
  };
}

async function ensureRuntimeDirs(): Promise<void> {
  await Promise.all([
    fs.mkdir(RUNTIME_DIR, { recursive: true }),
    fs.mkdir(STAGING_DIR, { recursive: true }),
    fs.mkdir(INCOMING_DIR, { recursive: true }),
    fs.mkdir(EXTRACTED_DIR, { recursive: true }),
    fs.mkdir(ARTIFACTS_DIR, { recursive: true }),
  ]);
}

async function readStoredStatusFile(): Promise<StoredDrupalImportStatus> {
  await ensureRuntimeDirs();

  try {
    const content = await fs.readFile(STATUS_FILE, 'utf8');
    return {
      ...createDefaultStatus(),
      ...JSON.parse(content) as StoredDrupalImportStatus,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return createDefaultStatus();
    }

    console.error('Failed to read stored Drupal import status:', error);
    throw error;
  }
}

async function ensureStartupRecovery(): Promise<void> {
  if (!startupRecoveryPromise) {
    startupRecoveryPromise = (async () => {
      const stored = await readStoredStatusFile();
      const recovered = recoverInterruptedStatus(stored);

      if (recovered !== stored) {
        await writeStoredStatus(recovered);
      }
    })().catch((error) => {
      startupRecoveryPromise = null;
      throw error;
    });
  }

  await startupRecoveryPromise;
}

async function readStoredStatus(): Promise<StoredDrupalImportStatus> {
  await ensureStartupRecovery();

  const stored = await readStoredStatusFile();
  const recovered = recoverInterruptedStatus(stored);
  if (recovered !== stored) {
    await writeStoredStatus(recovered);
    return recovered;
  }

  return stored;
}

void ensureStartupRecovery().catch((error) => {
  console.error('Failed to recover Drupal import status on startup:', error);
});

async function writeStoredStatus(status: StoredDrupalImportStatus): Promise<void> {
  await ensureRuntimeDirs();
  await fs.writeFile(STATUS_FILE, `${JSON.stringify(status, null, 2)}\n`);
}

async function updateStoredStatus(
  updater: (current: StoredDrupalImportStatus) => StoredDrupalImportStatus,
): Promise<StoredDrupalImportStatus> {
  return withStatusLock(async () => {
    const next = updater(await readStoredStatus());
    await writeStoredStatus(next);
    return next;
  });
}

function buildArtifact(filePath: string, filename: string, sizeBytes: number): DrupalImportArtifact {
  return {
    filename,
    uploaded_at: new Date().toISOString(),
    size_bytes: sizeBytes,
  };
}

function sanitizeStoredDrupalImportStatus(status: StoredDrupalImportStatus): DrupalImportStatus {
  const {
    database_dump_path: _databaseDumpPath,
    files_archive_path: _filesArchivePath,
    extracted_files_root: _extractedFilesRoot,
    log_path: _logPath,
    audit_path: _auditPath,
    runner_token: _runnerToken,
    runner_kind: _runnerKind,
    runner_heartbeat_at: _runnerHeartbeatAt,
    ...publicStatus
  } = status;

  return publicStatus;
}

function toWarning(message: string, code = 'WARNING'): DrupalImportWarning {
  return { code, message };
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]/g, '_');
}

async function ensureWritableDirectory(targetDir: string): Promise<void> {
  await fs.mkdir(targetDir, { recursive: true });
  const probe = path.join(targetDir, `.probe-${Date.now()}`);
  await fs.writeFile(probe, 'ok');
  await fs.unlink(probe);
}

function getMysqlImportConfig(): MysqlImportConfig {
  const host = process.env.DRUPAL_IMPORT_MYSQL_HOST || '127.0.0.1';
  const port = Number(process.env.DRUPAL_IMPORT_MYSQL_PORT || '3306');
  const user = process.env.DRUPAL_IMPORT_MYSQL_USER || '';
  const password = process.env.DRUPAL_IMPORT_MYSQL_PASSWORD || '';
  const database = process.env.DRUPAL_IMPORT_MYSQL_DATABASE || 'drupal_import_temp';

  if (!user) {
    throw new Error(
      'Drupal import requires a temporary MySQL/MariaDB runtime. Set DRUPAL_IMPORT_MYSQL_USER in the server environment before running preflight or migration.',
    );
  }

  if (!Number.isFinite(port)) {
    throw new Error('DRUPAL_IMPORT_MYSQL_PORT must be a valid number.');
  }

  if (!/^[A-Za-z0-9_]+$/.test(database)) {
    throw new Error('DRUPAL_IMPORT_MYSQL_DATABASE may only contain letters, numbers, and underscores.');
  }

  return {
    host,
    port,
    user,
    password,
    database,
  };
}

function buildDrupalDbUrl(config: MysqlImportConfig): string {
  const passwordPart = config.password ? `:${encodeURIComponent(config.password)}` : '';
  return `mysql://${encodeURIComponent(config.user)}${passwordPart}@${config.host}:${config.port}/${config.database}`;
}

async function createMysqlRuntimeConnection(
  config: MysqlImportConfig,
  database?: string,
): Promise<Connection> {
  return createConnection({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database,
    multipleStatements: false,
    connectTimeout: MYSQL_CONNECT_TIMEOUT_MS,
  });
}

async function runMysqlQuery(connection: Connection, sql: string): Promise<void> {
  await connection.query({
    sql,
    timeout: MYSQL_QUERY_TIMEOUT_MS,
  });
}

async function resetTemporaryDrupalDatabase(config: MysqlImportConfig): Promise<void> {
  const connection = await createMysqlRuntimeConnection(config);

  try {
    await runMysqlQuery(connection, `DROP DATABASE IF EXISTS \`${config.database}\``);
    await runMysqlQuery(connection, `CREATE DATABASE \`${config.database}\``);
  } finally {
    await connection.end();
  }
}

async function dropTemporaryDrupalDatabase(config: MysqlImportConfig): Promise<void> {
  const connection = await createMysqlRuntimeConnection(config);

  try {
    await runMysqlQuery(connection, `DROP DATABASE IF EXISTS \`${config.database}\``);
  } finally {
    await connection.end();
  }
}

async function importSqlDumpIntoTemporaryDatabase(
  dumpPath: string,
  config: MysqlImportConfig,
  onProgress?: (statementCount: number) => Promise<void> | void,
): Promise<void> {
  const connection = await createMysqlRuntimeConnection(config, config.database);

  let statementCount = 0;
  let delimiter = ';';
  let buffer = '';

  try {
    const lineReader = readline.createInterface({
      input: createReadStream(dumpPath).pipe(createGunzip()),
      crlfDelay: Infinity,
    });

    for await (const line of lineReader) {
      const trimmed = line.trim();

      if (!buffer && (trimmed === '' || trimmed.startsWith('--') || trimmed.startsWith('#'))) {
        continue;
      }

      if (!buffer && trimmed.startsWith('DELIMITER ')) {
        delimiter = trimmed.slice('DELIMITER '.length).trim() || ';';
        continue;
      }

      buffer += `${line}\n`;

      if (!buffer.trimEnd().endsWith(delimiter)) {
        continue;
      }

      const statement = buffer.trimEnd().slice(0, -delimiter.length).trim();
      buffer = '';

      if (!statement) {
        continue;
      }

      await connection.query({
        sql: statement,
        timeout: MYSQL_QUERY_TIMEOUT_MS,
      });
      statementCount += 1;

      if (statementCount % 50 === 0) {
        await onProgress?.(statementCount);
      }
    }

    if (buffer.trim()) {
      await connection.query({
        sql: buffer.trim(),
        timeout: MYSQL_QUERY_TIMEOUT_MS,
      });
      statementCount += 1;
      await onProgress?.(statementCount);
    }
  } finally {
    await connection.end();
  }
}

async function verifyGzipReadable(filePath: string): Promise<void> {
  await execFileAsync('gunzip', ['-t', filePath]);
}

async function extractFilesArchive(archivePath: string): Promise<string> {
  await fs.rm(EXTRACTED_DIR, { recursive: true, force: true });
  await fs.mkdir(EXTRACTED_DIR, { recursive: true });
  await execFileAsync('tar', ['-xzf', archivePath, '-C', EXTRACTED_DIR]);
  const filesLiveRoot = await findFilesLiveRoot(EXTRACTED_DIR);

  if (!filesLiveRoot) {
    throw new Error('The files archive did not contain a files_live directory.');
  }

  return filesLiveRoot;
}

async function findFilesLiveRoot(searchRoot: string): Promise<string | null> {
  const queue = [searchRoot];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }

    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const fullPath = path.join(current, entry.name);
      if (entry.name === 'files_live') {
        return fullPath;
      }

      queue.push(fullPath);
    }
  }

  return null;
}

async function appendPreflightLog(message: string): Promise<void> {
  await ensureRuntimeDirs();
  await fs.appendFile(PREFLIGHT_LOG_FILE, `[${new Date().toISOString()}] ${message}\n`);
}

async function appendRunLog(logPath: string | null, message: string): Promise<void> {
  if (!logPath) {
    return;
  }

  await ensureRuntimeDirs();
  await fs.appendFile(logPath, `[${new Date().toISOString()}] ${message}\n`);
}

function summarizeAudit(audit: MigrationAudit, sourceSummary: DrupalImportSummary): DrupalImportSummary {
  return {
    ...buildDrupalImportSummary(audit, sourceSummary),
    source_users: sourceSummary.source_users,
    source_listings: sourceSummary.source_listings,
    source_listing_photos: sourceSummary.source_listing_photos,
    source_user_pictures: sourceSummary.source_user_pictures,
  };
}

async function runPreflightChecks(state: StoredDrupalImportStatus): Promise<{
  checks: DrupalImportPreflightCheck[];
  warnings: DrupalImportWarning[];
  summary: DrupalImportSummary;
  extractedFilesRoot: string;
  drupalDbUrl: string;
}> {
  if (!state.database_dump_path || !state.files_archive_path || !state.database_dump || !state.files_archive) {
    throw new Error('Upload both the Drupal database dump and the files archive before running preflight.');
  }

  const checks: DrupalImportPreflightCheck[] = [];
  const warnings: DrupalImportWarning[] = [];
  const pushCheck = (check: DrupalImportPreflightCheck) => {
    checks.push(check);
  };

  await appendPreflightLog('Starting Drupal import preflight');

  await verifyGzipReadable(state.database_dump_path);
  pushCheck({
    id: 'database_dump',
    label: 'Database dump',
    status: 'pass',
    detail: `${state.database_dump.filename} is a readable gzip-compressed SQL dump.`,
  });

  const extractedFilesRoot = await extractFilesArchive(state.files_archive_path);
  pushCheck({
    id: 'files_archive',
    label: 'Files archive',
    status: 'pass',
    detail: `Extracted ${state.files_archive.filename} and found files_live at ${extractedFilesRoot}.`,
  });

  await ensureWritableDirectory(STAGING_DIR);
  await ensureWritableDirectory(ARTIFACTS_DIR);
  await ensureWritableDirectory(path.resolve('uploads/listings'));
  await ensureWritableDirectory(path.resolve('uploads/profiles'));
  pushCheck({
    id: 'filesystem_access',
    label: 'Filesystem access',
    status: 'pass',
    detail: 'The server can write staging files, audit artifacts, and final upload directories.',
  });

  await prisma.$queryRaw`SELECT 1`;
  pushCheck({
    id: 'housing_database',
    label: 'Housing database',
    status: 'pass',
    detail: 'The PostgreSQL housing database is reachable.',
  });

  const mysqlConfig = getMysqlImportConfig();
  await resetTemporaryDrupalDatabase(mysqlConfig);
  pushCheck({
    id: 'temp_mysql_runtime',
    label: 'Temporary Drupal database',
    status: 'pass',
    detail: `The temporary MySQL/MariaDB database ${mysqlConfig.database} can be created and reset automatically.`,
  });

  await importSqlDumpIntoTemporaryDatabase(state.database_dump_path, mysqlConfig);
  pushCheck({
    id: 'sql_restore',
    label: 'SQL restore',
    status: 'pass',
    detail: `Restored ${state.database_dump.filename} into the temporary Drupal database.`,
  });

  const drupalDbUrl = buildDrupalDbUrl(mysqlConfig);
  const inspection = await inspectDrupalSource({
    drupalDbUrl,
    drupalFilesRoot: extractedFilesRoot,
  });

  warnings.push(
    ...inspection.warnings.map((message) => toWarning(message, 'SOURCE_WARNING')),
  );

  if (warnings.length > 0) {
    pushCheck({
      id: 'source_warnings',
      label: 'Source inspection',
      status: 'warn',
      detail: `Preflight found ${warnings.length} warning(s). Review them before you start the migration.`,
    });
  } else {
    pushCheck({
      id: 'source_warnings',
      label: 'Source inspection',
      status: 'pass',
      detail: 'Required Drupal tables were readable and no missing-file mismatches were detected during inspection.',
    });
  }

  const summary: DrupalImportSummary = {
    ...emptySummary(),
    ...inspection.summary,
    warnings_count: warnings.length,
  };

  return {
    checks,
    warnings,
    summary,
    extractedFilesRoot,
    drupalDbUrl,
  };
}

async function cleanupSuccessfulRunArtifacts(status: StoredDrupalImportStatus, mysqlConfig: MysqlImportConfig): Promise<void> {
  await dropTemporaryDrupalDatabase(mysqlConfig);

  if (status.database_dump_path) {
    await fs.rm(status.database_dump_path, { force: true });
  }

  if (status.files_archive_path) {
    await fs.rm(status.files_archive_path, { force: true });
  }

  await fs.rm(EXTRACTED_DIR, { recursive: true, force: true });
  await fs.mkdir(EXTRACTED_DIR, { recursive: true });
}

async function touchRunnerHeartbeat(token: string): Promise<void> {
  await updateStoredStatus((stored) => (
    stored.runner_token === token
      ? {
        ...stored,
        runner_heartbeat_at: new Date().toISOString(),
      }
      : stored
  ));
}

function startRunnerHeartbeat(token: string): () => void {
  const timer = setInterval(() => {
    void touchRunnerHeartbeat(token).catch((error) => {
      console.error('Failed to update Drupal import heartbeat:', error);
    });
  }, RUNNER_HEARTBEAT_INTERVAL_MS);

  timer.unref?.();

  return () => {
    clearInterval(timer);
  };
}

function ensureNotRunning(status: StoredDrupalImportStatus): void {
  if (
    status.status === 'running'
    || status.status === 'cleaning_up'
    || status.runner_kind === 'preflight'
    || (status.runner_token && isRunnerHeartbeatFresh(status))
    || activeRun
    || activePreflight
  ) {
    throw new Error('A Drupal import is already running.');
  }
}

export async function getDrupalImportStatus(): Promise<DrupalImportStatus> {
  return sanitizeStoredDrupalImportStatus(await readStoredStatus());
}

export async function initializeDrupalImportUploadSession(): Promise<DrupalImportStatus> {
  const status = await updateStoredStatus((current) => {
    const hasActiveWork = current.status === 'running'
      || current.status === 'cleaning_up'
      || current.runner_kind === 'preflight'
      || (current.runner_token && isRunnerHeartbeatFresh(current));

    if (hasActiveWork) {
      return current;
    }

    return {
      ...current,
      status: 'idle',
      current_step: 'Upload a Drupal database dump and files archive to begin.',
      detail_message: 'Pantheon exports are accepted directly: *_database.sql.gz and *_files.tar.gz.',
      error_summary: null,
      warnings: [],
      preflight_checks: [],
      preflight_ready_at: null,
    };
  });

  return sanitizeStoredDrupalImportStatus(status);
}

export async function saveDrupalImportUpload(
  kind: UploadedArtifactKind,
  uploadedFile: { path: string; originalname: string; size: number },
): Promise<DrupalImportStatus> {
  const isValid = kind === 'database_dump'
    ? isValidDrupalDatabaseDumpFilename(uploadedFile.originalname)
    : isValidDrupalFilesArchiveFilename(uploadedFile.originalname);

  if (!isValid) {
    try {
      await fs.rm(uploadedFile.path, { force: true });
    } catch {
      // Preserve the original validation error if temp-file cleanup fails.
    }

    throw new Error(
      kind === 'database_dump'
        ? 'Upload a Pantheon Drupal database dump ending in .sql.gz.'
        : 'Upload a Pantheon Drupal files archive ending in .tar.gz.',
    );
  }

  await ensureRuntimeDirs();

  return withStatusLock(async () => {
    const current = await readStoredStatus();
    ensureNotRunning(current);

    const targetName = `${kind}-${Date.now()}-${sanitizeFilename(uploadedFile.originalname)}`;
    const targetPath = path.join(STAGING_DIR, targetName);
    await fs.rename(uploadedFile.path, targetPath);

    if (kind === 'database_dump' && current.database_dump_path) {
      await fs.rm(current.database_dump_path, { force: true });
    }

    if (kind === 'files_archive' && current.files_archive_path) {
      await fs.rm(current.files_archive_path, { force: true });
    }

    const artifact = buildArtifact(targetPath, uploadedFile.originalname, uploadedFile.size);
    const status: StoredDrupalImportStatus = {
      ...current,
      status: 'uploading',
      current_step: kind === 'database_dump' ? 'Database dump uploaded' : 'Files archive uploaded',
      detail_message: 'Run preflight after both Pantheon exports are uploaded.',
      error_summary: null,
      warnings: [],
      preflight_checks: [],
      preflight_ready_at: null,
      summary: {
        ...emptySummary(),
        source_users: current.summary.source_users,
        source_listings: current.summary.source_listings,
        source_listing_photos: current.summary.source_listing_photos,
        source_user_pictures: current.summary.source_user_pictures,
      },
      database_dump: kind === 'database_dump' ? artifact : current.database_dump,
      files_archive: kind === 'files_archive' ? artifact : current.files_archive,
      database_dump_path: kind === 'database_dump' ? targetPath : current.database_dump_path,
      files_archive_path: kind === 'files_archive' ? targetPath : current.files_archive_path,
      extracted_files_root: null,
    };
    await writeStoredStatus(status);
    return sanitizeStoredDrupalImportStatus(status);
  });
}

export async function runDrupalImportPreflight(): Promise<DrupalImportStatus> {
  const preflightState = await withStatusLock(async () => {
    const stored = await readStoredStatus();
    ensureNotRunning(stored);
    const runnerToken = createRunnerToken();
    const next: StoredDrupalImportStatus = {
      ...stored,
      status: 'uploading',
      phase: 'source_analysis',
      progress_percent: 0,
      current_step: 'Running preflight checks',
      detail_message: 'Validating the uploaded Pantheon artifacts before any housing data is changed.',
      error_summary: null,
      runner_token: runnerToken,
      runner_kind: 'preflight',
      runner_heartbeat_at: new Date().toISOString(),
    };

    await writeStoredStatus(next);

    return {
      state: next,
      runnerToken,
    };
  });

  activePreflight = (async () => {
    const stopHeartbeat = startRunnerHeartbeat(preflightState.runnerToken);

    try {
      const preflight = await runPreflightChecks(preflightState.state);
      await updateStoredStatus((stored) => ({
        ...stored,
        status: 'preflight_ready',
        phase: 'source_analysis',
        progress_percent: 0,
        current_step: 'Preflight complete',
        detail_message: 'The Pantheon exports passed preflight. Review the counts and warnings, then start the migration when ready.',
        error_summary: null,
        summary: preflight.summary,
        warnings: preflight.warnings,
        preflight_checks: preflight.checks,
        preflight_ready_at: new Date().toISOString(),
        extracted_files_root: preflight.extractedFilesRoot,
        runner_token: stored.runner_token === preflightState.runnerToken ? null : stored.runner_token,
        runner_kind: stored.runner_token === preflightState.runnerToken ? null : stored.runner_kind,
        runner_heartbeat_at: stored.runner_token === preflightState.runnerToken ? null : stored.runner_heartbeat_at,
      }));
    } catch (error) {
      await updateStoredStatus((stored) => ({
        ...stored,
        status: 'preflight_failed',
        phase: 'source_analysis',
        progress_percent: 0,
        current_step: 'Preflight failed',
        detail_message: 'The uploaded artifacts need attention before the migration can begin.',
        error_summary: error instanceof Error ? error.message : String(error),
        summary: emptySummary(),
        warnings: [],
        preflight_checks: [],
        preflight_ready_at: null,
        extracted_files_root: null,
        runner_token: stored.runner_token === preflightState.runnerToken ? null : stored.runner_token,
        runner_kind: stored.runner_token === preflightState.runnerToken ? null : stored.runner_kind,
        runner_heartbeat_at: stored.runner_token === preflightState.runnerToken ? null : stored.runner_heartbeat_at,
      }));
    } finally {
      stopHeartbeat();
      activePreflight = null;
    }
  })();

  await activePreflight;
  return sanitizeStoredDrupalImportStatus(await readStoredStatus());
}

function applyProgressUpdate(
  current: StoredDrupalImportStatus,
  update: DrupalImportProgressUpdate,
): StoredDrupalImportStatus {
  return {
    ...current,
    phase: update.phase ?? current.phase,
    progress_percent: update.progress_percent ?? current.progress_percent,
    current_step: update.current_step ?? current.current_step,
    detail_message: update.detail_message ?? current.detail_message,
    summary: update.summary ?? current.summary,
  };
}

async function executeDrupalImportRun(): Promise<void> {
  const current = await readStoredStatus();
  const mysqlConfig = getMysqlImportConfig();

  if (!current.database_dump_path || !current.files_archive_path || !current.extracted_files_root) {
    throw new Error('Run preflight successfully before starting the migration.');
  }

  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const logPath = path.join(ARTIFACTS_DIR, `drupal-import-${runId}.log`);
  const auditPath = path.join(ARTIFACTS_DIR, `drupal-import-${runId}.audit.json`);
  const startedAt = new Date().toISOString();

  await updateStoredStatus((stored) => ({
    ...stored,
    status: 'running',
    phase: 'temp_db_preparation',
    progress_percent: 6,
    current_step: 'Preparing temporary Drupal database',
    detail_message: 'Creating a clean temporary MySQL/MariaDB database for the uploaded Drupal dump.',
    started_at: startedAt,
    finished_at: null,
    error_summary: null,
    log_available: false,
    audit_available: false,
    log_path: logPath,
    audit_path: auditPath,
  }));

  await resetTemporaryDrupalDatabase(mysqlConfig);
  await updateStoredStatus((stored) => ({
    ...stored,
    phase: 'sql_restore',
    progress_percent: 18,
    current_step: 'Restoring Drupal database dump',
    detail_message: 'Loading the uploaded Pantheon SQL dump into the temporary Drupal database.',
  }));

  await importSqlDumpIntoTemporaryDatabase(current.database_dump_path, mysqlConfig, async (statementCount) => {
    await updateStoredStatus((stored) => ({
      ...stored,
      detail_message: `Executing Drupal SQL statements in the temporary database (${statementCount} statements applied so far).`,
    }));
  });

  const drupalDbUrl = buildDrupalDbUrl(mysqlConfig);
  const audit = await runDrupalImport({
    drupalDbUrl,
    drupalFilesRoot: current.extracted_files_root,
    logFile: logPath,
    auditFile: auditPath,
    onProgress: async (update) => {
      await updateStoredStatus((stored) => applyProgressUpdate(stored, update));
    },
  });

  const sourceSummary = current.summary;
  await updateStoredStatus((stored) => ({
    ...stored,
    status: 'cleaning_up',
    phase: 'cleanup',
    progress_percent: 97,
    current_step: 'Cleaning up temporary import resources',
    detail_message: 'Removing temporary Drupal database contents and staged upload artifacts after a successful migration.',
    summary: summarizeAudit(audit, sourceSummary),
    log_available: true,
    audit_available: true,
    runner_heartbeat_at: new Date().toISOString(),
  }));

  const afterRun = await readStoredStatus();
  try {
    await cleanupSuccessfulRunArtifacts(afterRun, mysqlConfig);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Drupal import cleanup failed after a successful run:', error);
    try {
      await appendRunLog(afterRun.log_path, `Cleanup warning: ${message}`);
    } catch (logError) {
      console.error('Failed to write Drupal import cleanup warning to the run log:', logError);
    }
  }

  await updateStoredStatus((stored) => ({
    ...stored,
    status: 'succeeded',
    phase: 'completed',
    progress_percent: 100,
    current_step: 'Drupal migration completed successfully',
    detail_message: 'The import finished successfully. Review the summary, audit, and log for full details.',
    finished_at: new Date().toISOString(),
    summary: summarizeAudit(audit, sourceSummary),
    log_available: true,
    audit_available: true,
    database_dump_path: null,
    files_archive_path: null,
    extracted_files_root: null,
    runner_token: null,
    runner_kind: null,
    runner_heartbeat_at: null,
  }));
}

export async function startDrupalImportRun(): Promise<DrupalImportStatus> {
  const status = await withStatusLock(async () => {
    const current = await readStoredStatus();
    ensureNotRunning(current);

    if (current.status !== 'preflight_ready') {
      throw new Error('Run a successful preflight before starting the migration.');
    }

    const runnerToken = createRunnerToken();
    const next: StoredDrupalImportStatus = {
      ...current,
      status: 'running',
      phase: 'temp_db_preparation',
      progress_percent: 2,
      current_step: 'Starting Drupal migration',
      detail_message: 'The migration job has been queued and will begin preparing the temporary Drupal database immediately.',
      started_at: new Date().toISOString(),
      finished_at: null,
      runner_token: runnerToken,
      runner_kind: 'run',
      runner_heartbeat_at: new Date().toISOString(),
    };
    await writeStoredStatus(next);
    return next;
  });

  activeRun = (async () => {
    const stopHeartbeat = status.runner_token ? startRunnerHeartbeat(status.runner_token) : () => {};

    try {
      await executeDrupalImportRun();
    } catch (error) {
      await updateStoredStatus((stored) => ({
        ...stored,
        status: 'failed',
        finished_at: new Date().toISOString(),
        error_summary: error instanceof Error ? error.message : String(error),
        current_step: 'Drupal migration failed',
        detail_message: 'The migration stopped before completion. Review the log and audit output for details.',
        log_available: Boolean(stored.log_path),
        audit_available: Boolean(stored.audit_path),
        runner_token: null,
        runner_kind: null,
        runner_heartbeat_at: null,
      }));
    } finally {
      stopHeartbeat();
      activeRun = null;
    }
  })();

  return sanitizeStoredDrupalImportStatus(status);
}

export async function getDrupalImportLogContent(): Promise<string> {
  const status = await readStoredStatus();
  if (!status.log_path) {
    return '';
  }

  try {
    return await fs.readFile(status.log_path, 'utf8');
  } catch {
    return '';
  }
}

export async function getDrupalImportAuditContent(): Promise<MigrationAudit | null> {
  const status = await readStoredStatus();
  if (!status.audit_path) {
    return null;
  }

  try {
    const content = await fs.readFile(status.audit_path, 'utf8');
    return JSON.parse(content) as MigrationAudit;
  } catch {
    return null;
  }
}

export async function getDrupalImportIncomingDir(): Promise<string> {
  await ensureRuntimeDirs();
  return INCOMING_DIR;
}

export {
  isValidDrupalDatabaseDumpFilename,
  isValidDrupalFilesArchiveFilename,
};
