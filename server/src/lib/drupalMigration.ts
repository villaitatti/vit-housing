import { Role } from '../generated/prisma/enums.js';
import {
  buildListingSlugCandidate,
  normalizeListingTitleToSlug,
  type ListingSlugLookupClient,
} from '../services/listingSlug.service.js';

export interface ProcessedUserPicture {
  filePath: string;
  url: string;
}

export interface DrupalImportedUserProfile {
  uid: number;
  first_name: string;
  last_name: string;
  roles: Role[];
  preferred_language: 'EN' | 'IT';
  phone_number: string | null;
  mobile_number: string | null;
  password: string | null;
  shouldKeepDrupalPassword: boolean;
  last_login: Date | null;
  processedUserPicture: ProcessedUserPicture | null;
}

export interface ExistingDrupalUser {
  id: number;
  email: string;
  legacy_drupal_uid: number | null;
  password: string | null;
  last_login: Date | null;
  profile_photo_path: string | null;
  profile_photo_url: string | null;
  first_name: string;
  last_name: string;
  roles: Role[];
  preferred_language: 'EN' | 'IT';
  phone_number: string | null;
  mobile_number: string | null;
}

export interface LegacyListingMatchCandidate {
  id: number;
  slug: string;
  owner_id: number;
  created_at: Date;
  legacy_drupal_nid: number | null;
}

export type ExistingUserMigrationResolution =
  | {
      mode: 'alias';
      canonicalDrupalUid: number;
    }
  | {
      mode: 'update';
      plan: ReturnType<typeof planExistingUserMigrationUpdate>;
    };

function sameRoleSet(left: Role[], right: Role[]): boolean {
  const leftSet = new Set(left);
  const rightSet = new Set(right);

  if (leftSet.size !== rightSet.size) {
    return false;
  }

  return [...leftSet].every((role) => rightSet.has(role));
}

export function buildFallbackListingSlug(title: string, nid: number): string {
  const slugBase = normalizeListingTitleToSlug(title);
  return `${slugBase === 'listing' ? 'listing' : slugBase}-${nid}`;
}

export function buildDrupalListingSlug(alias: string | null | undefined, title: string, nid: number): string {
  if (!alias) {
    return buildFallbackListingSlug(title, nid);
  }

  const withoutPrefix = alias.startsWith('listing/') ? alias.slice('listing/'.length) : alias;
  const slug = normalizeListingTitleToSlug(withoutPrefix);
  return slug === 'listing' ? buildFallbackListingSlug(title, nid) : slug;
}

export function planExistingUserMigrationUpdate(existingUser: ExistingDrupalUser, importedUser: DrupalImportedUserProfile) {
  if (existingUser.legacy_drupal_uid !== null && existingUser.legacy_drupal_uid !== importedUser.uid) {
    throw new Error(
      `User ${existingUser.id} is already linked to Drupal uid=${existingUser.legacy_drupal_uid}, cannot relink to uid=${importedUser.uid}`,
    );
  }

  const preservedLocalState =
    existingUser.first_name !== importedUser.first_name ||
    existingUser.last_name !== importedUser.last_name ||
    !sameRoleSet(existingUser.roles, importedUser.roles) ||
    existingUser.preferred_language !== importedUser.preferred_language ||
    existingUser.phone_number !== importedUser.phone_number ||
    existingUser.mobile_number !== importedUser.mobile_number;

  return {
    data: {
      legacy_drupal_uid: importedUser.uid,
      ...(!existingUser.last_login && importedUser.last_login ? { last_login: importedUser.last_login } : {}),
      ...(importedUser.shouldKeepDrupalPassword && importedUser.password && !existingUser.password
        ? { password: importedUser.password }
        : {}),
      ...(importedUser.processedUserPicture &&
      !existingUser.profile_photo_path &&
      !existingUser.profile_photo_url
        ? {
            profile_photo_path: importedUser.processedUserPicture.filePath,
            profile_photo_url: importedUser.processedUserPicture.url,
          }
        : {}),
    },
    preservedLocalState,
  };
}

export function resolveExistingUserMigration(
  existingUser: ExistingDrupalUser,
  importedUser: DrupalImportedUserProfile,
  linkedExistingAccountByEmail: boolean,
): ExistingUserMigrationResolution {
  if (
    linkedExistingAccountByEmail &&
    existingUser.legacy_drupal_uid !== null &&
    existingUser.legacy_drupal_uid !== importedUser.uid
  ) {
    return {
      mode: 'alias',
      canonicalDrupalUid: existingUser.legacy_drupal_uid,
    };
  }

  return {
    mode: 'update',
    plan: planExistingUserMigrationUpdate(existingUser, importedUser),
  };
}

export function buildNewUserMigrationCreate(email: string, importedUser: DrupalImportedUserProfile, created_at: Date) {
  return {
    email,
    legacy_drupal_uid: importedUser.uid,
    first_name: importedUser.first_name,
    last_name: importedUser.last_name,
    roles: importedUser.roles,
    preferred_language: importedUser.preferred_language,
    phone_number: importedUser.phone_number,
    mobile_number: importedUser.mobile_number,
    ...(importedUser.shouldKeepDrupalPassword && importedUser.password ? { password: importedUser.password } : {}),
    ...(importedUser.processedUserPicture
      ? {
          profile_photo_path: importedUser.processedUserPicture.filePath,
          profile_photo_url: importedUser.processedUserPicture.url,
        }
      : {}),
    created_at,
    last_login: importedUser.last_login,
  };
}

export function findUnambiguousLegacyListingMatch(
  candidates: LegacyListingMatchCandidate[],
  preferredSlug: string,
  ownerId: number,
  createdAt: Date,
): LegacyListingMatchCandidate | null {
  const createdAtTime = createdAt.getTime();
  const matches = candidates.filter(
    (candidate) =>
      candidate.legacy_drupal_nid === null &&
      candidate.slug === preferredSlug &&
      candidate.owner_id === ownerId &&
      candidate.created_at.getTime() === createdAtTime,
  );

  return matches.length === 1 ? matches[0] : null;
}

export async function generateUniqueDrupalListingSlug(
  client: ListingSlugLookupClient,
  preferredSlug: string,
): Promise<{ slug: string; collided: boolean }> {
  for (let suffix = 1; suffix < 10_000; suffix += 1) {
    const candidate = buildListingSlugCandidate(preferredSlug, suffix === 1 ? undefined : suffix);
    const existing = await client.listing.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });

    if (!existing) {
      return {
        slug: candidate,
        collided: candidate !== preferredSlug,
      };
    }
  }

  throw new Error(`Unable to generate a unique Drupal listing slug for ${preferredSlug}`);
}
