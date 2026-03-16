# Drupal Import Deployment Notes

This project now includes a local-first Drupal 7 import workflow in the IT admin UI.

## Local Development Quick Start

The Drupal import preflight restores the uploaded `*_database.sql.gz` dump into a temporary MySQL/MariaDB database before inspecting the source data. Local testing therefore requires a running MySQL-compatible server plus the `DRUPAL_IMPORT_MYSQL_*` environment variables in the app's `.env`.

Example using Docker:

```bash
docker run --name vithousing-drupal-import-mysql \
  -e MARIADB_ROOT_PASSWORD=drupal \
  -p 3306:3306 \
  -d mariadb:11
```

Add these values to `.env` and restart the server:

```dotenv
DRUPAL_IMPORT_MYSQL_HOST=127.0.0.1
DRUPAL_IMPORT_MYSQL_PORT=3306
DRUPAL_IMPORT_MYSQL_USER=root
DRUPAL_IMPORT_MYSQL_PASSWORD=drupal
DRUPAL_IMPORT_MYSQL_DATABASE=drupal_import_temp
```

When we later deploy the housing site on a Linux server with Docker/Compose, remember to add the following for the one-off Drupal migration:

- Provide a temporary MariaDB/MySQL runtime dedicated to Drupal import jobs.
- Mount persistent staging storage for:
  - uploaded `*_database.sql.gz` dumps
  - uploaded `*_files.tar.gz` archives
  - extracted `files_live` content
  - latest migration log and audit artifacts
- Expose the Drupal import MySQL connection settings to the server container:
  - `DRUPAL_IMPORT_MYSQL_HOST`
  - `DRUPAL_IMPORT_MYSQL_PORT`
  - `DRUPAL_IMPORT_MYSQL_USER`
  - `DRUPAL_IMPORT_MYSQL_PASSWORD`
  - `DRUPAL_IMPORT_MYSQL_DATABASE`
- Ensure the app container can write to:
  - `server/.runtime/drupal-import`
  - `uploads/listings`
  - `uploads/profiles`
- Decide production limits for:
  - maximum accepted upload size
  - retention window for staged files
  - retention window for latest log/audit artifacts
- Keep the import runtime easy to disable or remove after the one-off migration is completed successfully.

Operational reminder for production:

1. Upload the Pantheon database dump and files archive through the IT admin UI.
2. Run preflight and review warnings/counts.
3. Before starting the migration, create and verify a full rollback checkpoint of the production housing database and uploaded files:
   - store the backup in an offsite or versioned backup location
   - record the backup identifier in the run notes
   - validate the backup with a checksum or quick restore test
4. Start the migration only after confirming the temporary import database is available.
5. After a successful migration, verify the latest audit and log.
6. Remove or disable the temporary MariaDB/MySQL import runtime when it is no longer needed.
