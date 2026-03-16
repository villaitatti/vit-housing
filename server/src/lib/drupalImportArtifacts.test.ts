import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidDrupalDatabaseDumpFilename,
  isValidDrupalFilesArchiveFilename,
} from './drupalImportArtifacts.js';

test('accepts Pantheon-style Drupal database dump filenames', () => {
  assert.equal(
    isValidDrupalDatabaseDumpFilename('itattihousing_live_2026-03-10T18-07-07_UTC_database.sql.gz'),
    true,
  );
});

test('rejects non-gzip database dump filenames', () => {
  assert.equal(isValidDrupalDatabaseDumpFilename('itattihousing_database.sql'), false);
  assert.equal(isValidDrupalDatabaseDumpFilename('itattihousing_database.zip'), false);
  assert.equal(isValidDrupalDatabaseDumpFilename('../itattihousing_database.sql.gz'), false);
  assert.equal(isValidDrupalDatabaseDumpFilename('.hidden.sql.gz'), false);
});

test('accepts Pantheon-style Drupal files archive filenames', () => {
  assert.equal(
    isValidDrupalFilesArchiveFilename('itattihousing_live_2026-03-10T18-07-29_UTC_files.tar.gz'),
    true,
  );
});

test('rejects non tar.gz files archives', () => {
  assert.equal(isValidDrupalFilesArchiveFilename('files_live.zip'), false);
  assert.equal(isValidDrupalFilesArchiveFilename('files_live.tar'), false);
  assert.equal(isValidDrupalFilesArchiveFilename('nested/files_live.tar.gz'), false);
  assert.equal(isValidDrupalFilesArchiveFilename(' files_live.tar.gz'), false);
});
