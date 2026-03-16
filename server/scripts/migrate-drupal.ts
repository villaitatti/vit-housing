import '../src/lib/loadEnv.js';
import path from 'path';
import { runDrupalImport } from '../src/lib/drupalImport.js';

const logFile = path.resolve(process.env.DRUPAL_MIGRATION_LOG_FILE || 'server/scripts/drupal-migration-log.txt');
const auditFile = path.resolve(process.env.DRUPAL_MIGRATION_AUDIT_FILE || 'server/scripts/drupal-migration-audit.json');
const drupalFilesRoot = path.resolve(process.env.DRUPAL_FILES_ROOT || 'drupal7-import/files/files_live');
const drupalDbUrl = process.env.DRUPAL_DB_URL;

if (!drupalDbUrl) {
  throw new Error('DRUPAL_DB_URL is required');
}

runDrupalImport({
  drupalDbUrl,
  drupalFilesRoot,
  logFile,
  auditFile,
  disconnectPrismaOnFinish: true,
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
