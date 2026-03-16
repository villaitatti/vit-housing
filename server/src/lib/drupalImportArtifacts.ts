import path from 'path';

const SAFE_ARCHIVE_BASENAME = /^(?![.\s])[A-Za-z0-9._-]+$/;

function isSafeArchiveBasename(filename: string): boolean {
  return path.basename(filename) === filename
    && filename.length > 0
    && SAFE_ARCHIVE_BASENAME.test(filename);
}

export function isValidDrupalDatabaseDumpFilename(filename: string): boolean {
  return isSafeArchiveBasename(filename) && filename.endsWith('.sql.gz');
}

export function isValidDrupalFilesArchiveFilename(filename: string): boolean {
  return isSafeArchiveBasename(filename) && filename.endsWith('.tar.gz');
}
