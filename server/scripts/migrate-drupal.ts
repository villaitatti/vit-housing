import '../src/lib/loadEnv.js';
import path from 'path';
import fs from 'fs/promises';
import { appendFileSync, writeFileSync } from 'fs';
import { createConnection, type Connection, type RowDataPacket } from 'mysql2/promise';
import { Role } from '../src/generated/prisma/enums.js';
import {
  buildDrupalListingSlug,
  buildNewUserMigrationCreate,
  findUnambiguousLegacyListingMatch,
  generateUniqueDrupalListingSlug,
  planExistingUserMigrationUpdate,
  type ExistingDrupalUser,
  type ProcessedUserPicture,
} from '../src/lib/drupalMigration.js';
import { normalizeEmail } from '../src/lib/email.js';
import { prisma } from '../src/lib/prisma.js';
import {
  deleteLocalFile,
  processAndSaveImage,
  processAndSaveProfilePhoto,
} from '../src/services/upload.service.js';

const LOG_FILE = path.resolve('server/scripts/drupal-migration-log.txt');
const AUDIT_FILE = path.resolve('server/scripts/drupal-migration-audit.json');

const ITATTI_EMAIL_DOMAIN = '@itatti.harvard.edu';
const DRUPAL_FILES_ROOT = path.resolve(process.env.DRUPAL_FILES_ROOT || 'drupal7-import/files/files_live');
const RESOLVED_DRUPAL_FILES_ROOT = path.resolve(DRUPAL_FILES_ROOT);

const DRUPAL_ROLE_MAP: Record<number, Role> = {
  3: Role.HOUSE_ADMIN,
  4: Role.HOUSE_LANDLORD,
  5: Role.HOUSE_USER,
};

const BUILDING_TYPE_MAP: Record<string, string> = {
  Apartment: 'apartment',
  House: 'house',
  Studio: 'studio',
  Room: 'room',
};

const FLOOR_MAP: Record<string, string> = {
  '-1': 'basement',
  '0': 'ground',
  '1': '1',
  '2': '2',
  '3': '3',
  '4': '4',
  '5': '5',
  '6': '6',
};

const FEATURE_MAP: Record<string, keyof ListingFeatureState> = {
  'Storage Room': 'feature_storage_room',
  Basement: 'feature_basement',
  Garden: 'feature_garden',
  'Balcony / Terrace': 'feature_balcony',
  'Air Conditioning': 'feature_air_con',
  'Washing Machine': 'feature_washing_machine',
  Dryer: 'feature_dryer',
  Fireplace: 'feature_fireplace',
  Dishwasher: 'feature_dishwasher',
  Elevator: 'feature_elevator',
  TV: 'feature_tv',
  Telephone: 'feature_telephone',
  'WiFi internet': 'feature_wifi',
  'Wired internet': 'feature_wired_internet',
  Parking: 'feature_parking',
  'Pets allowed': 'feature_pets_allowed',
};

const UTILITY_MAP: Record<string, keyof ListingUtilityState> = {
  Electricity: 'utility_electricity',
  Gas: 'utility_gas',
  Water: 'utility_water',
  Telephone: 'utility_telephone',
  Internet: 'utility_internet',
};

interface DrupalUserRow extends RowDataPacket {
  uid: number;
  name: string;
  mail: string;
  pass: string;
  created: number;
  login: number;
  status: number;
  language: string;
  picture: number;
  phone_number: string | null;
  mobile_number: string | null;
}

interface DrupalRoleRow extends RowDataPacket {
  uid: number;
  rid: number;
}

interface DrupalListingRow extends RowDataPacket {
  nid: number;
  title: string;
  uid: number;
  status: number;
  created: number;
  changed: number;
  language: string;
  description: string | null;
}

interface DrupalAliasRow extends RowDataPacket {
  source: string;
  alias: string;
  language: string;
}

interface DrupalValueRow<T> extends RowDataPacket {
  entity_id: number;
  value: T;
}

interface DrupalAvailabilityRow extends RowDataPacket {
  entity_id: number;
  delta: number;
  available_from: Date | string | null;
  available_to: Date | string | null;
}

interface DrupalPhotoRow extends RowDataPacket {
  entity_id: number;
  delta: number;
  fid: number | null;
  alt: string | null;
  title: string | null;
  width: number | null;
  height: number | null;
  uri: string | null;
  filename: string | null;
}

interface DrupalAddressRow extends RowDataPacket {
  entity_id: number;
  country: string | null;
  administrative_area: string | null;
  locality: string | null;
  postal_code: string | null;
  thoroughfare: string | null;
  premise: string | null;
  sub_premise: string | null;
}

interface DrupalLatLonRow extends RowDataPacket {
  entity_id: number;
  latitude: string | null;
  longitude: string | null;
}

interface DrupalUserPictureRow extends RowDataPacket {
  uid: number;
  email: string;
  fid: number;
  uri: string;
}

interface ListingFeatureState {
  feature_storage_room: boolean;
  feature_basement: boolean;
  feature_garden: boolean;
  feature_balcony: boolean;
  feature_air_con: boolean;
  feature_washing_machine: boolean;
  feature_dryer: boolean;
  feature_fireplace: boolean;
  feature_dishwasher: boolean;
  feature_elevator: boolean;
  feature_tv: boolean;
  feature_telephone: boolean;
  feature_wifi: boolean;
  feature_wired_internet: boolean;
  feature_parking: boolean;
  feature_pets_allowed: boolean;
}

interface ListingUtilityState {
  utility_electricity: boolean;
  utility_gas: boolean;
  utility_water: boolean;
  utility_telephone: boolean;
  utility_internet: boolean;
}

interface MigrationAudit {
  started_at: string;
  files_root: string;
  users: {
    imported_external_uids: number[];
    imported_itatti_with_listing_uids: number[];
    skipped_itatti_without_listing_uids: number[];
    external_without_listing_uids: number[];
    linked_existing_account_uids: number[];
    preserved_local_state_uids: number[];
    blocked_user_uids: number[];
    legacy_hash_uids: number[];
    missing_emails: number[];
  };
  listings: {
    imported: Array<{ nid: number; slug: string }>;
    missing_owners: Array<{ nid: number; owner_uid: number | null }>;
    linked_existing_listing_nids: number[];
    missing_aliases: Array<{ nid: number; fallback_slug: string }>;
    slug_collisions: Array<{ nid: number; preferred_slug: string; resolved_slug: string }>;
    listing_languages: Array<{ nid: number; language: string }>;
    unmapped_listing_types: Array<{ nid: number; value: number }>;
    missing_photos: Array<{ nid: number; fid: number | null }>;
    unmapped_building_types: Array<{ nid: number; value: string }>;
    unmapped_floors: Array<{ nid: number; value: number }>;
    unmapped_features: Array<{ nid: number; value: string }>;
    unmapped_utilities: Array<{ nid: number; value: string }>;
  };
  user_pictures: Array<{ uid: number; fid: number }>;
}

interface ProcessedListingPhoto {
  filePath: string;
  url: string;
  sort_order: number;
}

function log(message: string): void {
  const line = `[${new Date().toISOString()}] ${message}`;
  console.log(line);
  appendFileSync(LOG_FILE, `${line}\n`);
}

function isItattiEmail(email: string): boolean {
  return normalizeEmail(email).endsWith(ITATTI_EMAIL_DOMAIN);
}

function mapDrupalUserRoles(roleIds: number[]): Role[] {
  const mapped = roleIds
    .map((roleId) => DRUPAL_ROLE_MAP[roleId])
    .filter((role): role is Role => Boolean(role));

  if (mapped.length === 0) {
    return [Role.HOUSE_USER];
  }

  return [...new Set(mapped)];
}

function splitName(fullName: string): { first_name: string; last_name: string } {
  const trimmed = fullName.trim();
  if (!trimmed) {
    return { first_name: 'Unknown', last_name: 'User' };
  }

  const parts = trimmed.split(/\s+/);
  return {
    first_name: parts[0] || 'Unknown',
    last_name: parts.slice(1).join(' ') || 'User',
  };
}

function parseDrupalLanguage(language: string): 'EN' | 'IT' {
  return language?.toLowerCase() === 'it' ? 'IT' : 'EN';
}

function makeDefaultFeatureState(): ListingFeatureState {
  return {
    feature_storage_room: false,
    feature_basement: false,
    feature_garden: false,
    feature_balcony: false,
    feature_air_con: false,
    feature_washing_machine: false,
    feature_dryer: false,
    feature_fireplace: false,
    feature_dishwasher: false,
    feature_elevator: false,
    feature_tv: false,
    feature_telephone: false,
    feature_wifi: false,
    feature_wired_internet: false,
    feature_parking: false,
    feature_pets_allowed: false,
  };
}

function makeDefaultUtilityState(): ListingUtilityState {
  return {
    utility_electricity: false,
    utility_gas: false,
    utility_water: false,
    utility_telephone: false,
    utility_internet: false,
  };
}

function toNullableDate(value: Date | string | null): Date | null {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value : new Date(value);
}

function toNullableNumber(value: string | number | null): number | null {
  if (value === null || value === '') {
    return null;
  }

  const numberValue = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

async function connectDrupal(): Promise<Connection> {
  if (!process.env.DRUPAL_DB_URL) {
    throw new Error('DRUPAL_DB_URL is required');
  }

  return createConnection(process.env.DRUPAL_DB_URL);
}

async function ensureDrupalFilesRoot(): Promise<void> {
  await fs.access(DRUPAL_FILES_ROOT);
}

function isPathInsideRoot(rootPath: string, candidatePath: string): boolean {
  const relativePath = path.relative(rootPath, candidatePath);
  return relativePath !== '' && !relativePath.startsWith('..') && !path.isAbsolute(relativePath)
    || candidatePath === rootPath;
}

function resolveDrupalPublicFilePath(uri: string): string {
  const relativeFilePath = uri.replace(/^public:\/\//, '');
  const absoluteDrupalFilePath = path.resolve(RESOLVED_DRUPAL_FILES_ROOT, relativeFilePath);

  if (!isPathInsideRoot(RESOLVED_DRUPAL_FILES_ROOT, absoluteDrupalFilePath)) {
    throw new Error(`Path escapes Drupal files root: ${uri}`);
  }

  return absoluteDrupalFilePath;
}

async function processDrupalUserPicture(
  picture: DrupalUserPictureRow | undefined,
): Promise<ProcessedUserPicture | null> {
  if (!picture?.uri) {
    return null;
  }

  try {
    const absoluteDrupalPhotoPath = resolveDrupalPublicFilePath(picture.uri);
    const fileBuffer = await fs.readFile(absoluteDrupalPhotoPath);
    const savedPhoto = await processAndSaveProfilePhoto(fileBuffer);

    return {
      filePath: savedPhoto.filePath,
      url: savedPhoto.url,
    };
  } catch (err) {
    log(`Skipping Drupal user picture uid=${picture.uid} fid=${picture.fid}: ${err instanceof Error ? err.message : 'Unknown error'}`);
    return null;
  }
}

async function fetchRows<T extends RowDataPacket>(connection: Connection, query: string): Promise<T[]> {
  const [rows] = await connection.query<T[]>(query);
  return rows;
}

function groupValues<T>(rows: Array<{ entity_id: number; value: T }>): Map<number, T[]> {
  const result = new Map<number, T[]>();

  for (const row of rows) {
    const current = result.get(row.entity_id) || [];
    current.push(row.value);
    result.set(row.entity_id, current);
  }

  return result;
}

function indexByEntityId<T extends { entity_id: number }>(rows: T[]): Map<number, T> {
  return new Map(rows.map((row) => [row.entity_id, row]));
}

async function readDrupalSourceData(connection: Connection) {
  const [
    users,
    userRoles,
    listings,
    aliases,
    addresses,
    latLons,
    prices,
    deposits,
    condominiumExpenses,
    buildingTypes,
    floors,
    bathrooms,
    bedrooms,
    floorSpaces,
    listingTypes,
    features,
    utilities,
    availability,
    photos,
    userPictures,
  ] = await Promise.all([
    fetchRows<DrupalUserRow>(
      connection,
      `
        SELECT
          u.uid,
          u.name,
          u.mail,
          u.pass,
          u.created,
          u.login,
          u.status,
          u.language,
          u.picture,
          phone.field_phone_value AS phone_number,
          mobile.field_mobile_value AS mobile_number
        FROM users u
        LEFT JOIN field_data_field_phone phone
          ON phone.entity_id = u.uid
         AND phone.entity_type = 'user'
         AND phone.deleted = 0
        LEFT JOIN field_data_field_mobile mobile
          ON mobile.entity_id = u.uid
         AND mobile.entity_type = 'user'
         AND mobile.deleted = 0
      `,
    ),
    fetchRows<DrupalRoleRow>(connection, 'SELECT uid, rid FROM users_roles'),
    fetchRows<DrupalListingRow>(
      connection,
      `
        SELECT
          n.nid,
          n.title,
          n.uid,
          n.status,
          n.created,
          n.changed,
          n.language,
          body.body_value AS description
        FROM node n
        LEFT JOIN field_data_body body
          ON body.entity_id = n.nid
         AND body.entity_type = 'node'
         AND body.deleted = 0
        WHERE n.type = 'listing'
      `,
    ),
    fetchRows<DrupalAliasRow>(
      connection,
      `
        SELECT source, alias, language
        FROM url_alias
        WHERE source LIKE 'node/%'
          AND alias LIKE 'listing/%'
      `,
    ),
    fetchRows<DrupalAddressRow>(
      connection,
      `
        SELECT
          entity_id,
          field_address_country AS country,
          field_address_administrative_area AS administrative_area,
          field_address_locality AS locality,
          field_address_postal_code AS postal_code,
          field_address_thoroughfare AS thoroughfare,
          field_address_premise AS premise,
          field_address_sub_premise AS sub_premise
        FROM field_data_field_address
        WHERE entity_type = 'node'
          AND bundle = 'listing'
          AND deleted = 0
      `,
    ),
    fetchRows<DrupalLatLonRow>(
      connection,
      `
        SELECT
          entity_id,
          field_latlon_lat AS latitude,
          field_latlon_lon AS longitude
        FROM field_data_field_latlon
        WHERE entity_type = 'node'
          AND bundle = 'listing'
          AND deleted = 0
      `,
    ),
    fetchRows<DrupalValueRow<number>>(
      connection,
      `
        SELECT entity_id, field_price_value AS value
        FROM field_data_field_price
        WHERE entity_type = 'node'
          AND bundle = 'listing'
          AND deleted = 0
      `,
    ),
    fetchRows<DrupalValueRow<number>>(
      connection,
      `
        SELECT entity_id, field_deposit_value AS value
        FROM field_data_field_deposit
        WHERE entity_type = 'node'
          AND bundle = 'listing'
          AND deleted = 0
      `,
    ),
    fetchRows<DrupalValueRow<number>>(
      connection,
      `
        SELECT entity_id, field_condominium_expenses_value AS value
        FROM field_data_field_condominium_expenses
        WHERE entity_type = 'node'
          AND bundle = 'listing'
          AND deleted = 0
      `,
    ),
    fetchRows<DrupalValueRow<string>>(
      connection,
      `
        SELECT entity_id, field_building_type_value AS value
        FROM field_data_field_building_type
        WHERE entity_type = 'node'
          AND bundle = 'listing'
          AND deleted = 0
      `,
    ),
    fetchRows<DrupalValueRow<number>>(
      connection,
      `
        SELECT entity_id, field_floor_value AS value
        FROM field_data_field_floor
        WHERE entity_type = 'node'
          AND bundle = 'listing'
          AND deleted = 0
      `,
    ),
    fetchRows<DrupalValueRow<number>>(
      connection,
      `
        SELECT entity_id, field_bathrooms_value AS value
        FROM field_data_field_bathrooms
        WHERE entity_type = 'node'
          AND bundle = 'listing'
          AND deleted = 0
      `,
    ),
    fetchRows<DrupalValueRow<number>>(
      connection,
      `
        SELECT entity_id, field_bedrooms_value AS value
        FROM field_data_field_bedrooms
        WHERE entity_type = 'node'
          AND bundle = 'listing'
          AND deleted = 0
      `,
    ),
    fetchRows<DrupalValueRow<number>>(
      connection,
      `
        SELECT entity_id, field_floor_space_value AS value
        FROM field_data_field_floor_space
        WHERE entity_type = 'node'
          AND bundle = 'listing'
          AND deleted = 0
      `,
    ),
    fetchRows<DrupalValueRow<number>>(
      connection,
      `
        SELECT entity_id, field_listing_type_value AS value
        FROM field_data_field_listing_type
        WHERE entity_type = 'node'
          AND bundle = 'listing'
          AND deleted = 0
      `,
    ),
    fetchRows<DrupalValueRow<string>>(
      connection,
      `
        SELECT entity_id, field_features_value AS value
        FROM field_data_field_features
        WHERE entity_type = 'node'
          AND bundle = 'listing'
          AND deleted = 0
      `,
    ),
    fetchRows<DrupalValueRow<string>>(
      connection,
      `
        SELECT entity_id, field_utilities_included_value AS value
        FROM field_data_field_utilities_included
        WHERE entity_type = 'node'
          AND bundle = 'listing'
          AND deleted = 0
      `,
    ),
    fetchRows<DrupalAvailabilityRow>(
      connection,
      `
        SELECT
          entity_id,
          delta,
          field_available_from_value AS available_from,
          field_available_from_value2 AS available_to
        FROM field_data_field_available_from
        WHERE entity_type = 'node'
          AND bundle = 'listing'
          AND deleted = 0
        ORDER BY entity_id, delta
      `,
    ),
    fetchRows<DrupalPhotoRow>(
      connection,
      `
        SELECT
          photos.entity_id,
          photos.delta,
          photos.field_photos_fid AS fid,
          photos.field_photos_alt AS alt,
          photos.field_photos_title AS title,
          photos.field_photos_width AS width,
          photos.field_photos_height AS height,
          files.uri,
          files.filename
        FROM field_data_field_photos photos
        LEFT JOIN file_managed files
          ON files.fid = photos.field_photos_fid
        WHERE photos.entity_type = 'node'
          AND photos.bundle = 'listing'
          AND photos.deleted = 0
        ORDER BY photos.entity_id, photos.delta
      `,
    ),
    fetchRows<DrupalUserPictureRow>(
      connection,
      `
        SELECT
          u.uid,
          u.mail AS email,
          fm.fid,
          fm.uri
        FROM users u
        JOIN file_managed fm
          ON fm.fid = u.picture
        WHERE u.picture > 0
      `,
    ),
  ]);

  return {
    users,
    userRoles,
    listings,
    aliasBySource: new Map(aliases.map((alias) => [alias.source, alias.alias])),
    addressByListingId: indexByEntityId(addresses),
    latLonByListingId: indexByEntityId(latLons),
    priceByListingId: new Map(prices.map((row) => [row.entity_id, row.value])),
    depositByListingId: new Map(deposits.map((row) => [row.entity_id, row.value])),
    condominiumExpensesByListingId: new Map(condominiumExpenses.map((row) => [row.entity_id, row.value])),
    buildingTypeByListingId: new Map(buildingTypes.map((row) => [row.entity_id, row.value])),
    floorByListingId: new Map(floors.map((row) => [row.entity_id, row.value])),
    bathroomsByListingId: new Map(bathrooms.map((row) => [row.entity_id, row.value])),
    bedroomsByListingId: new Map(bedrooms.map((row) => [row.entity_id, row.value])),
    floorSpaceByListingId: new Map(floorSpaces.map((row) => [row.entity_id, row.value])),
    listingTypeByListingId: new Map(listingTypes.map((row) => [row.entity_id, row.value])),
    featuresByListingId: groupValues(features),
    utilitiesByListingId: groupValues(utilities),
    availabilityByListingId: availability.reduce((map, row) => {
      const current = map.get(row.entity_id) || [];
      current.push(row);
      map.set(row.entity_id, current);
      return map;
    }, new Map<number, DrupalAvailabilityRow[]>()),
    photosByListingId: photos.reduce((map, row) => {
      const current = map.get(row.entity_id) || [];
      current.push(row);
      map.set(row.entity_id, current);
      return map;
    }, new Map<number, DrupalPhotoRow[]>()),
    userPictures,
  };
}

async function migrateUsers(
  data: Awaited<ReturnType<typeof readDrupalSourceData>>,
  audit: MigrationAudit,
): Promise<Map<number, number>> {
  log('Migrating users');

  const listingOwnerUids = new Set(data.listings.map((listing) => listing.uid));
  const userPictureByUid = new Map(data.userPictures.map((picture) => [picture.uid, picture]));
  const roleIdsByUser = data.userRoles.reduce((map, row) => {
    const current = map.get(row.uid) || [];
    current.push(row.rid);
    map.set(row.uid, current);
    return map;
  }, new Map<number, number[]>());

  const importedUserIdsByDrupalUid = new Map<number, number>();

  for (const user of data.users) {
    const normalizedEmail = normalizeEmail(user.mail || '');
    const roles = mapDrupalUserRoles(roleIdsByUser.get(user.uid) || []);
    const ownsListing = listingOwnerUids.has(user.uid);

    if (!normalizedEmail) {
      audit.users.missing_emails.push(user.uid);
      continue;
    }

    if (user.status !== 1) {
      audit.users.blocked_user_uids.push(user.uid);
      continue;
    }

    if (isItattiEmail(normalizedEmail) && !ownsListing) {
      audit.users.skipped_itatti_without_listing_uids.push(user.uid);
      continue;
    }

    const name = splitName(user.name);
    const shouldKeepDrupalPassword = !isItattiEmail(normalizedEmail);
    let existingUser = await prisma.user.findUnique({
      where: { legacy_drupal_uid: user.uid },
      select: {
        id: true,
        email: true,
        legacy_drupal_uid: true,
        password: true,
        last_login: true,
        profile_photo_path: true,
        profile_photo_url: true,
        first_name: true,
        last_name: true,
        roles: true,
        preferred_language: true,
        phone_number: true,
        mobile_number: true,
      },
    });
    let linkedExistingAccountByEmail = false;

    if (!existingUser) {
      existingUser = await prisma.user.findUnique({
        where: { email: normalizedEmail },
        select: {
          id: true,
          email: true,
          legacy_drupal_uid: true,
          password: true,
          last_login: true,
          profile_photo_path: true,
          profile_photo_url: true,
          first_name: true,
          last_name: true,
          roles: true,
          preferred_language: true,
          phone_number: true,
          mobile_number: true,
        },
      });
      linkedExistingAccountByEmail = Boolean(existingUser);
    }

    const drupalLastLogin = user.login > 0 ? new Date(user.login * 1000) : null;
    const importedUserProfile = {
      uid: user.uid,
      first_name: name.first_name,
      last_name: name.last_name,
      roles,
      preferred_language: parseDrupalLanguage(user.language),
      phone_number: user.phone_number || null,
      mobile_number: user.mobile_number || null,
      password: user.pass || null,
      shouldKeepDrupalPassword,
      last_login: drupalLastLogin,
      processedUserPicture: null,
    };

    const shouldBackfillProfilePhoto =
      !existingUser || (!existingUser.profile_photo_path && !existingUser.profile_photo_url);
    let processedUserPicture: ProcessedUserPicture | null = null;

    try {
      if (shouldBackfillProfilePhoto) {
        processedUserPicture = await processDrupalUserPicture(userPictureByUid.get(user.uid));
      }

      importedUserProfile.processedUserPicture = processedUserPicture;

      const migrationPlan = existingUser
        ? planExistingUserMigrationUpdate(existingUser as ExistingDrupalUser, importedUserProfile)
        : null;

      const migratedUser = existingUser
        ? await prisma.user.update({
            where: { id: existingUser.id },
            data: migrationPlan!.data,
            select: {
              id: true,
              email: true,
            },
          })
        : await prisma.user.create({
            data: buildNewUserMigrationCreate(normalizedEmail, importedUserProfile, new Date(user.created * 1000)),
            select: {
              id: true,
              email: true,
            },
          });

      importedUserIdsByDrupalUid.set(user.uid, migratedUser.id);

      if (linkedExistingAccountByEmail) {
        audit.users.linked_existing_account_uids.push(user.uid);
      }

      if (migrationPlan?.preservedLocalState) {
        audit.users.preserved_local_state_uids.push(user.uid);
      }

      if (shouldKeepDrupalPassword && user.pass?.startsWith('$S$')) {
        audit.users.legacy_hash_uids.push(user.uid);
      }

      if (isItattiEmail(normalizedEmail)) {
        audit.users.imported_itatti_with_listing_uids.push(user.uid);
      } else {
        audit.users.imported_external_uids.push(user.uid);
        if (!ownsListing) {
          audit.users.external_without_listing_uids.push(user.uid);
        }
      }
    } catch (err) {
      if (processedUserPicture) {
        await deleteLocalFile(processedUserPicture.filePath);
      }
      throw err;
    }
  }

  return importedUserIdsByDrupalUid;
}

async function migrateListings(
  data: Awaited<ReturnType<typeof readDrupalSourceData>>,
  importedUserIdsByDrupalUid: Map<number, number>,
  audit: MigrationAudit,
): Promise<void> {
  log('Migrating listings');

  for (const listing of data.listings) {
    const ownerId = importedUserIdsByDrupalUid.get(listing.uid);

    if (!ownerId) {
      audit.listings.missing_owners.push({ nid: listing.nid, owner_uid: listing.uid || null });
      continue;
    }

    const alias = data.aliasBySource.get(`node/${listing.nid}`) || null;
    const preferredSlug = buildDrupalListingSlug(alias, listing.title, listing.nid);
    if (!alias) {
      audit.listings.missing_aliases.push({ nid: listing.nid, fallback_slug: preferredSlug });
    }
    const createdAt = new Date(listing.created * 1000);

    if (listing.language) {
      audit.listings.listing_languages.push({ nid: listing.nid, language: listing.language });
    }

    const buildingTypeValue = data.buildingTypeByListingId.get(listing.nid) || '';
    const accommodationType = BUILDING_TYPE_MAP[buildingTypeValue];
    if (!accommodationType) {
      audit.listings.unmapped_building_types.push({ nid: listing.nid, value: buildingTypeValue });
    }

    const floorValue = data.floorByListingId.get(listing.nid);
    const floor = floorValue !== undefined ? FLOOR_MAP[String(floorValue)] : undefined;
    if (!floor && floorValue !== undefined) {
      audit.listings.unmapped_floors.push({ nid: listing.nid, value: floorValue });
    }

    const listingTypeValue = data.listingTypeByListingId.get(listing.nid);
    if (listingTypeValue !== undefined && listingTypeValue !== 2) {
      audit.listings.unmapped_listing_types.push({ nid: listing.nid, value: listingTypeValue });
    }

    const featureState = makeDefaultFeatureState();
    for (const feature of data.featuresByListingId.get(listing.nid) || []) {
      const featureKey = FEATURE_MAP[feature];
      if (!featureKey) {
        audit.listings.unmapped_features.push({ nid: listing.nid, value: feature });
        continue;
      }
      featureState[featureKey] = true;
    }

    const utilityState = makeDefaultUtilityState();
    for (const utility of data.utilitiesByListingId.get(listing.nid) || []) {
      const utilityKey = UTILITY_MAP[utility];
      if (!utilityKey) {
        audit.listings.unmapped_utilities.push({ nid: listing.nid, value: utility });
        continue;
      }
      utilityState[utilityKey] = true;
    }

    const address = data.addressByListingId.get(listing.nid);
    const latLon = data.latLonByListingId.get(listing.nid);

    const listingData = {
      legacy_drupal_nid: listing.nid,
      title: listing.title || `Listing ${listing.nid}`,
      description: listing.description || '',
      address_1: address?.thoroughfare || 'Unknown address',
      address_2: [address?.premise, address?.sub_premise].filter(Boolean).join(', ') || null,
      postal_code: address?.postal_code || '',
      city: address?.locality || '',
      province: address?.administrative_area || '',
      latitude: toNullableNumber(latLon?.latitude) ?? null,
      longitude: toNullableNumber(latLon?.longitude) ?? null,
      monthly_rent: data.priceByListingId.get(listing.nid) ?? 0,
      deposit: data.depositByListingId.get(listing.nid) ?? null,
      condominium_expenses: data.condominiumExpensesByListingId.get(listing.nid) ?? null,
      accommodation_type: accommodationType || 'apartment',
      floor: floor || 'ground',
      bathrooms: data.bathroomsByListingId.get(listing.nid) ?? 1,
      bedrooms: data.bedroomsByListingId.get(listing.nid) ?? 1,
      floor_space: data.floorSpaceByListingId.get(listing.nid) ?? null,
      published: listing.status === 1,
      owner_id: ownerId,
      ...featureState,
      ...utilityState,
    };

    let targetListing = await prisma.listing.findUnique({
      where: { legacy_drupal_nid: listing.nid },
      select: {
        id: true,
        slug: true,
        owner_id: true,
        created_at: true,
        legacy_drupal_nid: true,
      },
    });

    if (!targetListing) {
      const candidates = await prisma.listing.findMany({
        where: {
          slug: preferredSlug,
          owner_id: ownerId,
          created_at: createdAt,
        },
        select: {
          id: true,
          slug: true,
          owner_id: true,
          created_at: true,
          legacy_drupal_nid: true,
        },
      });
      targetListing = findUnambiguousLegacyListingMatch(candidates, preferredSlug, ownerId, createdAt);
      if (targetListing) {
        audit.listings.linked_existing_listing_nids.push(listing.nid);
      }
    }

    let upsertedListing: { id: number; slug: string };
    if (targetListing) {
      upsertedListing = await prisma.listing.update({
        where: { id: targetListing.id },
        data: listingData,
        select: {
          id: true,
          slug: true,
        },
      });
    } else {
      const { slug, collided } = await generateUniqueDrupalListingSlug(prisma, preferredSlug);
      if (collided) {
        audit.listings.slug_collisions.push({
          nid: listing.nid,
          preferred_slug: preferredSlug,
          resolved_slug: slug,
        });
      }
      upsertedListing = await prisma.listing.create({
        data: {
          ...listingData,
          slug,
          created_at: createdAt,
        },
        select: {
          id: true,
          slug: true,
        },
      });
    }

    const existingPhotos = await prisma.listingPhoto.findMany({
      where: { listing_id: upsertedListing.id },
      select: { file_path: true },
    });

    const photoRows = data.photosByListingId.get(listing.nid) || [];
    const processedPhotos: ProcessedListingPhoto[] = [];
    let photoFailures = 0;

    try {
      for (const photo of photoRows) {
        if (!photo.uri) {
          audit.listings.missing_photos.push({ nid: listing.nid, fid: photo.fid });
          photoFailures += 1;
          continue;
        }

        try {
          const absoluteDrupalPhotoPath = resolveDrupalPublicFilePath(photo.uri);
          const fileBuffer = await fs.readFile(absoluteDrupalPhotoPath);
          const savedPhoto = await processAndSaveImage(fileBuffer);

          processedPhotos.push({
            filePath: savedPhoto.filePath,
            url: savedPhoto.url,
            sort_order: photo.delta,
          });
        } catch {
          audit.listings.missing_photos.push({ nid: listing.nid, fid: photo.fid });
          photoFailures += 1;
        }
      }

      const availabilityRows = data.availabilityByListingId.get(listing.nid) || [];
      const shouldReplacePhotos = photoFailures === 0;
      await prisma.$transaction(async (tx) => {
        await tx.availableDate.deleteMany({ where: { listing_id: upsertedListing.id } });

        if (availabilityRows.length > 0) {
          await tx.availableDate.createMany({
            data: availabilityRows.map((row) => ({
              listing_id: upsertedListing.id,
              available_from: toNullableDate(row.available_from) || new Date(listing.created * 1000),
              available_to: toNullableDate(row.available_to),
            })),
          });
        }

        if (shouldReplacePhotos) {
          await tx.listingPhoto.deleteMany({ where: { listing_id: upsertedListing.id } });

          if (processedPhotos.length > 0) {
            await tx.listingPhoto.createMany({
              data: processedPhotos.map((photo) => ({
                listing_id: upsertedListing.id,
                file_path: photo.filePath,
                url: photo.url,
                sort_order: photo.sort_order,
              })),
            });
          }
        }
      });

      if (shouldReplacePhotos) {
        await Promise.all(existingPhotos.map(async (photo) => {
          try {
            await deleteLocalFile(photo.file_path);
          } catch {
            // Ignore old-file cleanup failures after the DB swap succeeds.
          }
        }));
      } else {
        log(`Skipped photo replacement for listing nid=${listing.nid} due to ${photoFailures} source photo failure(s)`);
        await Promise.all(processedPhotos.map((photo) => deleteLocalFile(photo.filePath)));
      }
    } catch (err) {
      await Promise.all(processedPhotos.map((photo) => deleteLocalFile(photo.filePath)));
      throw err;
    }

    audit.listings.imported.push({ nid: listing.nid, slug: upsertedListing.slug });
  }
}

async function main(): Promise<void> {
  writeFileSync(LOG_FILE, `Drupal migration started at ${new Date().toISOString()}\n`);
  await ensureDrupalFilesRoot();

  const audit: MigrationAudit = {
    started_at: new Date().toISOString(),
    files_root: DRUPAL_FILES_ROOT,
    users: {
      imported_external_uids: [],
      imported_itatti_with_listing_uids: [],
      skipped_itatti_without_listing_uids: [],
      external_without_listing_uids: [],
      linked_existing_account_uids: [],
      preserved_local_state_uids: [],
      blocked_user_uids: [],
      legacy_hash_uids: [],
      missing_emails: [],
    },
    listings: {
      imported: [],
      missing_owners: [],
      linked_existing_listing_nids: [],
      missing_aliases: [],
      slug_collisions: [],
      listing_languages: [],
      unmapped_listing_types: [],
      missing_photos: [],
      unmapped_building_types: [],
      unmapped_floors: [],
      unmapped_features: [],
      unmapped_utilities: [],
    },
    user_pictures: [],
  };

  const connection = await connectDrupal();
  log('Connected to Drupal database');

  try {
    const drupalData = await readDrupalSourceData(connection);
    audit.user_pictures = drupalData.userPictures.map((picture) => ({
      uid: picture.uid,
      fid: picture.fid,
    }));

    const importedUserIdsByDrupalUid = await migrateUsers(drupalData, audit);
    await migrateListings(drupalData, importedUserIdsByDrupalUid, audit);
  } finally {
    await connection.end();
    await prisma.$disconnect();
  }

  writeFileSync(AUDIT_FILE, `${JSON.stringify(audit, null, 2)}\n`);

  log(`Imported ${audit.users.imported_external_uids.length} external users`);
  log(`Imported ${audit.users.imported_itatti_with_listing_uids.length} @itatti.harvard.edu users with listings`);
  log(`Skipped ${audit.users.skipped_itatti_without_listing_uids.length} @itatti.harvard.edu users without listings`);
  log(`Linked ${audit.users.linked_existing_account_uids.length} existing users by email`);
  log(`Preserved local state for ${audit.users.preserved_local_state_uids.length} existing users`);
  log(`Imported ${audit.listings.imported.length} listings`);
  log(`Linked ${audit.listings.linked_existing_listing_nids.length} existing listings by legacy match`);
  log(`Resolved ${audit.listings.slug_collisions.length} listing slug collisions`);
  log(`Recorded ${audit.listings.missing_photos.length} missing listing photos`);
  log(`Audit written to ${AUDIT_FILE}`);
}

main().catch((error) => {
  log(`FATAL ${error instanceof Error ? error.stack || error.message : String(error)}`);
  process.exit(1);
});
