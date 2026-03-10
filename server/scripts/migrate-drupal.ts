/**
 * Drupal 7 to Villa I Tatti Housing Migration Script
 *
 * Migrates users, listings, and photos from a legacy Drupal 7 MySQL database
 * to the new PostgreSQL database via Prisma.
 *
 * Usage: npx tsx server/scripts/migrate-drupal.ts
 *
 * Requirements:
 * - DRUPAL_DB_URL must be set in server/.env
 * - DATABASE_URL must be set for Prisma
 * - server/uploads/listings/ directory will be created for photo storage
 *
 * This script is idempotent — safe to run multiple times.
 */

import { PrismaClient, Role } from '@prisma/client';
import { createConnection, Connection } from 'mysql2/promise';
import { writeFileSync, appendFileSync, mkdirSync } from 'fs';
import { processAndSaveImage } from '../src/services/upload.service.js';
import { generateUniqueListingSlug } from '../src/services/listingSlug.service.js';

const prisma = new PrismaClient();
const LOG_FILE = 'server/scripts/migration-log.txt';

// ---- CONFIGURATION ----
// Map Drupal role IDs to new roles
// TODO: Verify these role ID mappings against your Drupal database
const DRUPAL_ROLE_MAP: Record<number, Role> = {
  // 1: anonymous — skip
  // 2: authenticated — map to HOUSE_USER
  2: 'HOUSE_USER',
  // TODO: Add actual Drupal role IDs for landlord/admin
  // 3: 'HOUSE_LANDLORD',
  // 4: 'HOUSE_ADMIN',
};

// Skip these Drupal user IDs
const SKIP_UIDS = [0, 1]; // anonymous + superuser

// Drupal public files base path (for downloading images)
// TODO: Set this to the correct Drupal public files URL
const DRUPAL_FILES_BASE_URL = 'https://old-site.example.com/sites/default/files';

function log(message: string) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${message}`;
  console.log(line);
  appendFileSync(LOG_FILE, line + '\n');
}

async function connectDrupal(): Promise<Connection> {
  const url = process.env.DRUPAL_DB_URL;
  if (!url) {
    throw new Error('DRUPAL_DB_URL environment variable is not set');
  }
  return createConnection(url);
}

async function migrateUsers(drupal: Connection) {
  log('--- Starting user migration ---');

  const [rows] = await drupal.query(`
    SELECT u.uid, u.name, u.mail, u.created, u.login,
           GROUP_CONCAT(ur.rid) as role_ids
    FROM users u
    LEFT JOIN users_roles ur ON u.uid = ur.uid
    WHERE u.uid NOT IN (${SKIP_UIDS.join(',')})
    GROUP BY u.uid
  `) as any;

  let migrated = 0;
  let skipped = 0;

  for (const row of rows) {
    try {
      if (!row.mail) {
        log(`SKIP user uid=${row.uid} (no email)`);
        skipped++;
        continue;
      }

      // Determine roles from Drupal role IDs
      const roleIds = row.role_ids ? row.role_ids.split(',').map(Number) : [2];
      const unmappedRids = roleIds.filter((rid: number) => rid !== 1 && !(rid in DRUPAL_ROLE_MAP));
      if (unmappedRids.length > 0) {
        log(`SKIP user uid=${row.uid} email=${row.mail} — unmapped Drupal RIDs: ${unmappedRids.join(',')}`);
        skipped++;
        continue;
      }
      const mappedRoles = [...new Set(
        roleIds.map((rid: number) => DRUPAL_ROLE_MAP[rid]).filter(Boolean),
      )] as Role[];
      const roles: Role[] = mappedRoles.length > 0 ? mappedRoles : ['HOUSE_USER'];

      // TODO: Split Drupal username into first/last name if possible
      // For now, use the username as first name
      const nameParts = (row.name || 'Unknown').split(' ');
      const firstName = nameParts[0] || 'Unknown';
      const lastName = nameParts.slice(1).join(' ') || '';

      await prisma.user.upsert({
        where: { email: row.mail },
        update: {
          first_name: firstName,
          last_name: lastName,
        },
        create: {
          email: row.mail,
          first_name: firstName,
          last_name: lastName,
          roles,
          // No password — users will authenticate via Auth0 or invitation
          created_at: new Date(row.created * 1000),
          last_login: row.login > 0 ? new Date(row.login * 1000) : null,
        },
      });

      log(`OK user uid=${row.uid} email=${row.mail} roles=${roles.join(',')}`);
      migrated++;
    } catch (err) {
      log(`ERROR user uid=${row.uid}: ${err}`);
    }
  }

  log(`Users: ${migrated} migrated, ${skipped} skipped`);
}

async function migrateListings(drupal: Connection) {
  log('--- Starting listing migration ---');

  // TODO: Adjust these field names to match your Drupal field table structure
  const [rows] = await drupal.query(`
    SELECT n.nid, n.title, n.uid, n.created, n.changed,
           b.body_value as description
    FROM node n
    LEFT JOIN field_data_body b ON n.nid = b.entity_id AND b.entity_type = 'node'
    WHERE n.type = 'listing' AND n.status = 1
  `) as any;

  let migrated = 0;

  for (const row of rows) {
    try {
      // Find the owner by looking up the Drupal user's email
      const [userRows] = await drupal.query(
        'SELECT mail FROM users WHERE uid = ?',
        [row.uid],
      ) as any;

      if (!userRows.length || !userRows[0].mail) {
        log(`SKIP listing nid=${row.nid} (owner uid=${row.uid} not found)`);
        continue;
      }

      const owner = await prisma.user.findUnique({
        where: { email: userRows[0].mail },
      });

      if (!owner) {
        log(`SKIP listing nid=${row.nid} (owner ${userRows[0].mail} not in new DB)`);
        continue;
      }

      // TODO: Map these Drupal field tables to the actual field names in your DB
      // The field names below are placeholders — adjust to your Drupal schema
      await prisma.listing.upsert({
        where: { id: row.nid },
        update: {
          title: row.title || 'Untitled',
          description: row.description || '',
          updated_at: new Date(row.changed * 1000),
        },
        create: {
          id: row.nid,
          title: row.title || 'Untitled',
          slug: await generateUniqueListingSlug(prisma, row.title || 'Untitled'),
          description: row.description || '',
          address_1: '', // TODO: Map from field_data_field_address
          postal_code: '', // TODO: Map from field_data_field_address
          city: '', // TODO: Map from field_data_field_address
          province: 'Firenze', // TODO: Map from field_data_field_address
          monthly_rent: 0, // TODO: Map from field_data_field_rent
          accommodation_type: 'apartment', // TODO: Map from field_data_field_type
          floor: 'ground', // TODO: Map from field_data_field_floor
          bathrooms: 1, // TODO: Map from field_data_field_bathrooms
          bedrooms: 1, // TODO: Map from field_data_field_bedrooms
          owner_id: owner.id,
          created_at: new Date(row.created * 1000),
        },
      });

      log(`OK listing nid=${row.nid} title="${row.title}"`);
      migrated++;
    } catch (err) {
      log(`ERROR listing nid=${row.nid}: ${err}`);
    }
  }

  log(`Listings: ${migrated} migrated`);
}

async function migratePhotos(drupal: Connection) {
  log('--- Starting photo migration ---');

  mkdirSync('uploads/listings', { recursive: true });

  // TODO: Adjust the query to match your Drupal file field structure
  const [rows] = await drupal.query(`
    SELECT fi.entity_id as nid, fm.uri, fm.filename, fm.filemime,
           fi.delta as sort_order
    FROM field_data_field_images fi
    JOIN file_managed fm ON fi.field_images_fid = fm.fid
    WHERE fi.entity_type = 'node'
    ORDER BY fi.entity_id, fi.delta
  `) as any;

  let migrated = 0;

  for (const row of rows) {
    try {
      // Check if listing exists in new DB
      const listing = await prisma.listing.findUnique({ where: { id: row.nid } });
      if (!listing) {
        log(`SKIP photo for nid=${row.nid} (listing not in new DB)`);
        continue;
      }

      // Download from Drupal
      const drupalPath = (row.uri || '').replace('public://', '');
      const downloadUrl = `${DRUPAL_FILES_BASE_URL}/${drupalPath}`;

      const response = await fetch(downloadUrl);
      if (!response.ok) {
        log(`SKIP photo ${row.filename} (download failed: ${response.status})`);
        continue;
      }

      const buffer = Buffer.from(await response.arrayBuffer());

      // Process and save locally
      const { filePath, url } = await processAndSaveImage(buffer);

      // Create ListingPhoto record
      await prisma.listingPhoto.create({
        data: {
          listing_id: row.nid,
          file_path: filePath,
          url,
          sort_order: row.sort_order || 0,
        },
      });

      log(`OK photo ${row.filename} -> ${filePath}`);
      migrated++;
    } catch (err) {
      log(`ERROR photo ${row.filename} for nid=${row.nid}: ${err}`);
    }
  }

  log(`Photos: ${migrated} migrated`);
}

async function main() {
  // Initialize log file
  writeFileSync(LOG_FILE, `Migration started at ${new Date().toISOString()}\n`);

  const drupal = await connectDrupal();
  log('Connected to Drupal MySQL database');

  try {
    await migrateUsers(drupal);
    await migrateListings(drupal);
    await migratePhotos(drupal);
  } finally {
    await drupal.end();
    await prisma.$disconnect();
  }

  log('Migration complete!');
}

main().catch((err) => {
  log(`FATAL: ${err}`);
  process.exit(1);
});
