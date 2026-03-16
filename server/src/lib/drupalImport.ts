import path from 'path';
import fs from 'fs/promises';
import { appendFileSync, writeFileSync } from 'fs';
import { createConnection, type Connection, type RowDataPacket } from 'mysql2/promise';
import { Role } from '../generated/prisma/enums.js';
import { Prisma } from '../generated/prisma/client.js';
import {
  buildDrupalListingSlug,
  buildNewUserMigrationCreate,
  findUnambiguousLegacyListingMatch,
  generateUniqueDrupalListingSlug,
  planExistingUserMigrationUpdate,
  type ProcessedUserPicture,
} from './drupalMigration.js';
import { normalizeEmail } from './email.js';
import { prisma } from './prisma.js';
import {
  deleteLocalFile,
  processAndSaveImage,
  processAndSaveProfilePhoto,
} from '../services/upload.service.js';
import type {
  DrupalImportPhase,
  DrupalImportSummary,
} from '@vithousing/shared';

export interface MigrationAudit {
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

export interface DrupalImportProgressUpdate {
  phase?: DrupalImportPhase;
  progress_percent?: number;
  current_step?: string;
  detail_message?: string;
  summary?: DrupalImportSummary;
}

export interface DrupalImportRunOptions {
  drupalDbUrl: string;
  drupalFilesRoot: string;
  logFile: string;
  auditFile: string;
  disconnectPrismaOnFinish?: boolean;
  onLog?: (line: string) => void;
  onProgress?: (update: DrupalImportProgressUpdate) => void;
}

interface DrupalImportRuntimeContext {
  drupalDbUrl: string;
  drupalFilesRoot: string;
  resolvedDrupalFilesRoot: string;
  logFile: string;
  auditFile: string;
  disconnectPrismaOnFinish: boolean;
  onLog?: (line: string) => void;
  onProgress?: (update: DrupalImportProgressUpdate) => void;
}

const ITATTI_EMAIL_DOMAIN = '@itatti.harvard.edu';
let runtimeContext: DrupalImportRuntimeContext | null = null;

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

function isSlugUniqueConstraintError(err: unknown): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') {
    return false;
  }

  const targets = Array.isArray(err.meta?.target)
    ? err.meta.target
    : err.meta?.target
      ? [err.meta.target]
      : [];

  return targets.some((target) => String(target).includes('slug'));
}

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

interface ProcessedListingPhoto {
  filePath: string;
  url: string;
  sort_order: number;
}

function getRuntimeContext(): DrupalImportRuntimeContext {
  if (!runtimeContext) {
    throw new Error('Drupal import runtime context is not initialized');
  }

  return runtimeContext;
}

export function buildDrupalImportSummary(
  audit: MigrationAudit,
  sourceCounts?: Partial<DrupalImportSummary>,
): DrupalImportSummary {
  return {
    source_users: sourceCounts?.source_users ?? 0,
    source_listings: sourceCounts?.source_listings ?? 0,
    source_listing_photos: sourceCounts?.source_listing_photos ?? 0,
    source_user_pictures: sourceCounts?.source_user_pictures ?? 0,
    imported_users:
      audit.users.imported_external_uids.length + audit.users.imported_itatti_with_listing_uids.length,
    linked_existing_users: audit.users.linked_existing_account_uids.length,
    skipped_users:
      audit.users.skipped_itatti_without_listing_uids.length
      + audit.users.blocked_user_uids.length
      + audit.users.missing_emails.length,
    imported_listings: audit.listings.imported.length,
    linked_existing_listings: audit.listings.linked_existing_listing_nids.length,
    slug_collisions: audit.listings.slug_collisions.length,
    missing_photos: audit.listings.missing_photos.length,
    warnings_count:
      audit.listings.missing_photos.length
      + audit.listings.unmapped_building_types.length
      + audit.listings.unmapped_floors.length
      + audit.listings.unmapped_features.length
      + audit.listings.unmapped_utilities.length
      + audit.users.missing_emails.length,
  };
}

function emitProgress(update: DrupalImportProgressUpdate): void {
  getRuntimeContext().onProgress?.(update);
}

function log(message: string): void {
  const line = `[${new Date().toISOString()}] ${message}`;
  console.log(line);
  const context = getRuntimeContext();
  appendFileSync(context.logFile, `${line}\n`);
  context.onLog?.(line);
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
  return createConnection(getRuntimeContext().drupalDbUrl);
}

async function ensureDrupalFilesRoot(): Promise<void> {
  await fs.access(getRuntimeContext().drupalFilesRoot);
}

function isPathInsideRoot(rootPath: string, candidatePath: string): boolean {
  const relativePath = path.relative(rootPath, candidatePath);
  return relativePath !== '' && !relativePath.startsWith('..') && !path.isAbsolute(relativePath)
    || candidatePath === rootPath;
}

function resolveDrupalPublicFilePath(uri: string): string {
  const relativeFilePath = uri.replace(/^public:\/\//, '');
  const { resolvedDrupalFilesRoot } = getRuntimeContext();
  const absoluteDrupalFilePath = path.resolve(resolvedDrupalFilesRoot, relativeFilePath);

  if (!isPathInsideRoot(resolvedDrupalFilesRoot, absoluteDrupalFilePath)) {
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
  sourceSummary: Partial<DrupalImportSummary>,
): Promise<Map<number, number>> {
  log('Migrating users');
  emitProgress({
    phase: 'user_import',
    progress_percent: 56,
    current_step: 'Importing Drupal users',
    detail_message: `Processing ${data.users.length} user records and reconciling them with existing housing accounts.`,
    summary: buildDrupalImportSummary(audit, sourceSummary),
  });

  const existingUserSelect = {
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
  } as const;

  const listingOwnerUids = new Set(data.listings.map((listing) => listing.uid));
  const userPictureByUid = new Map(data.userPictures.map((picture) => [picture.uid, picture]));
  const roleIdsByUser = data.userRoles.reduce((map, row) => {
    const current = map.get(row.uid) || [];
    current.push(row.rid);
    map.set(row.uid, current);
    return map;
  }, new Map<number, number[]>());

  const importedUserIdsByDrupalUid = new Map<number, number>();
  let processedUsers = 0;

  for (const user of data.users) {
    processedUsers += 1;
    const normalizedEmail = normalizeEmail(user.mail || '');
    const roles = mapDrupalUserRoles(roleIdsByUser.get(user.uid) || []);
    const ownsListing = listingOwnerUids.has(user.uid);

    if (!normalizedEmail) {
      audit.users.missing_emails.push(user.uid);
      emitProgress({
        detail_message: `Scanning Drupal user records (${processedUsers}/${data.users.length}) and collecting warnings.`,
        summary: buildDrupalImportSummary(audit, sourceSummary),
      });
      continue;
    }

    if (user.status !== 1) {
      audit.users.blocked_user_uids.push(user.uid);
      emitProgress({
        detail_message: `Scanning Drupal user records (${processedUsers}/${data.users.length}) and collecting warnings.`,
        summary: buildDrupalImportSummary(audit, sourceSummary),
      });
      continue;
    }

    if (isItattiEmail(normalizedEmail) && !ownsListing) {
      audit.users.skipped_itatti_without_listing_uids.push(user.uid);
      emitProgress({
        detail_message: `Scanning Drupal user records (${processedUsers}/${data.users.length}) and collecting warnings.`,
        summary: buildDrupalImportSummary(audit, sourceSummary),
      });
      continue;
    }

    const name = splitName(user.name);
    const shouldKeepDrupalPassword = !isItattiEmail(normalizedEmail);
    let existingUser = await prisma.user.findUnique({
      where: { legacy_drupal_uid: user.uid },
      select: existingUserSelect,
    });
    let linkedExistingAccountByEmail = false;

    if (!existingUser) {
      existingUser = await prisma.user.findUnique({
        where: { email: normalizedEmail },
        select: existingUserSelect,
      });
      linkedExistingAccountByEmail = Boolean(existingUser);
    }

    const drupalLastLogin = user.login > 0 ? new Date(user.login * 1000) : null;
    const importedUserProfile: {
      uid: number;
      first_name: string;
      last_name: string;
      roles: Role[];
      preferred_language: ReturnType<typeof parseDrupalLanguage>;
      phone_number: string | null;
      mobile_number: string | null;
      password: string | null;
      shouldKeepDrupalPassword: boolean;
      last_login: Date | null;
      processedUserPicture: ProcessedUserPicture | null;
    } = {
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

      let migratedUser: { id: number; email: string };
      let migrationPlan: ReturnType<typeof planExistingUserMigrationUpdate> | null = null;

      if (existingUser) {
        migrationPlan = planExistingUserMigrationUpdate(existingUser, importedUserProfile);
        migratedUser = await prisma.user.update({
          where: { id: existingUser.id },
          data: migrationPlan.data,
          select: {
            id: true,
            email: true,
          },
        });
      } else {
        migratedUser = await prisma.user.create({
          data: buildNewUserMigrationCreate(normalizedEmail, importedUserProfile, new Date(user.created * 1000)),
          select: {
            id: true,
            email: true,
          },
        });
      }

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

    if (processedUsers === data.users.length || processedUsers % 10 === 0) {
      emitProgress({
        detail_message: `Processed ${processedUsers} of ${data.users.length} Drupal users.`,
        summary: buildDrupalImportSummary(audit, sourceSummary),
      });
    }
  }

  return importedUserIdsByDrupalUid;
}

async function migrateListings(
  data: Awaited<ReturnType<typeof readDrupalSourceData>>,
  importedUserIdsByDrupalUid: Map<number, number>,
  audit: MigrationAudit,
  sourceSummary: Partial<DrupalImportSummary>,
): Promise<void> {
  log('Migrating listings');
  emitProgress({
    phase: 'listing_import',
    progress_percent: 74,
    current_step: 'Importing Drupal listings',
    detail_message: `Processing ${data.listings.length} listing records and matching them to housing listings.`,
    summary: buildDrupalImportSummary(audit, sourceSummary),
  });
  let processedListings = 0;
  let photoPhaseEmitted = false;

  for (const listing of data.listings) {
    processedListings += 1;
    const ownerId = importedUserIdsByDrupalUid.get(listing.uid);

    if (!ownerId) {
      audit.listings.missing_owners.push({ nid: listing.nid, owner_uid: listing.uid || null });
      emitProgress({
        detail_message: `Processed ${processedListings} of ${data.listings.length} Drupal listings.`,
        summary: buildDrupalImportSummary(audit, sourceSummary),
      });
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
      latitude: toNullableNumber(latLon?.latitude ?? null) ?? null,
      longitude: toNullableNumber(latLon?.longitude ?? null) ?? null,
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
          legacy_drupal_nid: null,
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

    let upsertedListing: { id: number; slug: string } | null = null;
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
      const maxCreateAttempts = 5;

      for (let attempt = 1; attempt <= maxCreateAttempts; attempt += 1) {
        const { slug, collided } = await generateUniqueDrupalListingSlug(prisma, preferredSlug);
        if (collided) {
          audit.listings.slug_collisions.push({
            nid: listing.nid,
            preferred_slug: preferredSlug,
            resolved_slug: slug,
          });
        }

        try {
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
          break;
        } catch (err) {
          if (!isSlugUniqueConstraintError(err) || attempt === maxCreateAttempts) {
            throw err;
          }
        }
      }
    }

    if (!upsertedListing) {
      throw new Error(`Failed to create or update Drupal listing nid=${listing.nid}`);
    }

    const existingPhotos = await prisma.listingPhoto.findMany({
      where: { listing_id: upsertedListing.id },
      select: { file_path: true },
    });

    const photoRows = data.photosByListingId.get(listing.nid) || [];
    const processedPhotos: ProcessedListingPhoto[] = [];
    let photoFailures = 0;

    if (!photoPhaseEmitted && photoRows.length > 0) {
      photoPhaseEmitted = true;
      emitProgress({
        phase: 'photo_import',
        progress_percent: 86,
        current_step: 'Importing listing photos',
        detail_message: 'Copying referenced Drupal listing photos into the housing uploads area.',
        summary: buildDrupalImportSummary(audit, sourceSummary),
      });
    }

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

    if (processedListings === data.listings.length || processedListings % 5 === 0) {
      emitProgress({
        detail_message: `Processed ${processedListings} of ${data.listings.length} Drupal listings.`,
        summary: buildDrupalImportSummary(audit, sourceSummary),
      });
    }
  }
}

function createEmptyAudit(filesRoot: string): MigrationAudit {
  return {
    started_at: new Date().toISOString(),
    files_root: filesRoot,
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
}

export async function inspectDrupalSource(options: {
  drupalDbUrl: string;
  drupalFilesRoot: string;
}): Promise<{
  summary: Pick<DrupalImportSummary, 'source_users' | 'source_listings' | 'source_listing_photos' | 'source_user_pictures'>;
  warnings: string[];
}> {
  runtimeContext = {
    drupalDbUrl: options.drupalDbUrl,
    drupalFilesRoot: path.resolve(options.drupalFilesRoot),
    resolvedDrupalFilesRoot: path.resolve(options.drupalFilesRoot),
    logFile: path.resolve('server/.runtime/drupal-import/preflight-inspection.log'),
    auditFile: path.resolve('server/.runtime/drupal-import/preflight-inspection-audit.json'),
    disconnectPrismaOnFinish: false,
  };

  try {
    await ensureDrupalFilesRoot();
    const connection = await connectDrupal();
    try {
      const drupalData = await readDrupalSourceData(connection);
      const warnings: string[] = [];

      for (const photo of drupalData.photosByListingId.values()) {
        for (const row of photo) {
          if (!row.uri) {
            warnings.push(`Listing photo fid=${row.fid ?? 'unknown'} is missing its Drupal file URI.`);
            continue;
          }

          try {
            await fs.access(resolveDrupalPublicFilePath(row.uri));
          } catch {
            warnings.push(`Listing photo ${row.uri} was referenced in Drupal but not found in the uploaded files archive.`);
          }
        }
      }

      for (const picture of drupalData.userPictures) {
        try {
          await fs.access(resolveDrupalPublicFilePath(picture.uri));
        } catch {
          warnings.push(`User picture ${picture.uri} was referenced in Drupal but not found in the uploaded files archive.`);
        }
      }

      return {
        summary: {
          source_users: drupalData.users.length,
          source_listings: drupalData.listings.length,
          source_listing_photos: Array.from(drupalData.photosByListingId.values()).reduce((count, rows) => count + rows.length, 0),
          source_user_pictures: drupalData.userPictures.length,
        },
        warnings,
      };
    } finally {
      await connection.end();
    }
  } finally {
    runtimeContext = null;
  }
}

export async function runDrupalImport(options: DrupalImportRunOptions): Promise<MigrationAudit> {
  runtimeContext = {
    drupalDbUrl: options.drupalDbUrl,
    drupalFilesRoot: path.resolve(options.drupalFilesRoot),
    resolvedDrupalFilesRoot: path.resolve(options.drupalFilesRoot),
    logFile: path.resolve(options.logFile),
    auditFile: path.resolve(options.auditFile),
    disconnectPrismaOnFinish: options.disconnectPrismaOnFinish ?? false,
    onLog: options.onLog,
    onProgress: options.onProgress,
  };

  const context = getRuntimeContext();
  try {
    await fs.mkdir(path.dirname(context.logFile), { recursive: true });
    await fs.mkdir(path.dirname(context.auditFile), { recursive: true });
    writeFileSync(context.logFile, `Drupal migration started at ${new Date().toISOString()}\n`);
    emitProgress({
      phase: 'source_analysis',
      progress_percent: 42,
      current_step: 'Analyzing Drupal source data',
      detail_message: 'Connecting to the temporary Drupal database and reading source records.',
    });
    await ensureDrupalFilesRoot();

    const audit = createEmptyAudit(context.drupalFilesRoot);
    const connection = await connectDrupal();
    log('Connected to Drupal database');

    try {
      const drupalData = await readDrupalSourceData(connection);
      const sourceSummary = {
        source_users: drupalData.users.length,
        source_listings: drupalData.listings.length,
        source_listing_photos: Array.from(drupalData.photosByListingId.values()).reduce((count, rows) => count + rows.length, 0),
        source_user_pictures: drupalData.userPictures.length,
      } satisfies Partial<DrupalImportSummary>;
      audit.user_pictures = drupalData.userPictures.map((picture) => ({
        uid: picture.uid,
        fid: picture.fid,
      }));

      emitProgress({
        phase: 'source_analysis',
        progress_percent: 48,
        current_step: 'Drupal source analysis complete',
        detail_message: `Found ${sourceSummary.source_users} users, ${sourceSummary.source_listings} listings, ${sourceSummary.source_listing_photos} listing photos, and ${sourceSummary.source_user_pictures} user pictures.`,
        summary: buildDrupalImportSummary(audit, sourceSummary),
      });

      const importedUserIdsByDrupalUid = await migrateUsers(drupalData, audit, sourceSummary);
      await migrateListings(drupalData, importedUserIdsByDrupalUid, audit, sourceSummary);
    } finally {
      await connection.end();
      if (context.disconnectPrismaOnFinish) {
        await prisma.$disconnect();
      }
    }

    emitProgress({
      phase: 'audit_write',
      progress_percent: 94,
      current_step: 'Writing migration audit',
      detail_message: 'Persisting the migration audit report and final summary statistics.',
      summary: buildDrupalImportSummary(audit),
    });
    writeFileSync(context.auditFile, `${JSON.stringify(audit, null, 2)}\n`);

    log(`Imported ${audit.users.imported_external_uids.length} external users`);
    log(`Imported ${audit.users.imported_itatti_with_listing_uids.length} @itatti.harvard.edu users with listings`);
    log(`Skipped ${audit.users.skipped_itatti_without_listing_uids.length} @itatti.harvard.edu users without listings`);
    log(`Linked ${audit.users.linked_existing_account_uids.length} existing users by email`);
    log(`Preserved local state for ${audit.users.preserved_local_state_uids.length} existing users`);
    log(`Imported ${audit.listings.imported.length} listings`);
    log(`Linked ${audit.listings.linked_existing_listing_nids.length} existing listings by legacy match`);
    log(`Resolved ${audit.listings.slug_collisions.length} listing slug collisions`);
    log(`Recorded ${audit.listings.missing_photos.length} missing listing photos`);
    log(`Audit written to ${context.auditFile}`);
    emitProgress({
      phase: 'completed',
      progress_percent: 100,
      current_step: 'Drupal migration completed',
      detail_message: 'The Drupal import finished and the latest audit report is available for review.',
      summary: buildDrupalImportSummary(audit),
    });

    return audit;
  } finally {
    runtimeContext = null;
  }
}
