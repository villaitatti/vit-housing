export function isValidDrupalDatabaseDumpFilename(filename: string): boolean {
  return filename.endsWith('.sql.gz');
}

export function isValidDrupalFilesArchiveFilename(filename: string): boolean {
  return filename.endsWith('.tar.gz');
}
