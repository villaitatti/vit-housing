# Drupal Import Deployment Notes

This project now includes a local-first Drupal 7 import workflow in the IT admin UI.

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
3. Start the migration only after confirming the temporary import database is available.
4. After a successful migration, verify the latest audit and log.
5. Remove or disable the temporary MariaDB/MySQL import runtime when it is no longer needed.
