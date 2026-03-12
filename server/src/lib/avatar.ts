import crypto from 'crypto';
import { normalizeEmail } from './email.js';

interface AvatarUserShape {
  email: string;
  auth0_user_id: string | null;
  profile_photo_path: string | null;
  profile_photo_url: string | null;
}

export function getUploadedProfilePhotoUrl(user: Pick<AvatarUserShape, 'profile_photo_path' | 'profile_photo_url'>): string | null {
  if (user.profile_photo_url) {
    return user.profile_photo_url;
  }

  if (user.profile_photo_path) {
    return `/uploads/${user.profile_photo_path}`;
  }

  return null;
}

export function getGravatarUrl(email: string): string {
  const hash = crypto.createHash('md5').update(normalizeEmail(email), 'utf8').digest('hex');
  return `https://www.gravatar.com/avatar/${hash}?d=404&s=256`;
}

export function getAvatarUrl(user: AvatarUserShape): string | null {
  const uploadedProfilePhotoUrl = getUploadedProfilePhotoUrl(user);
  if (uploadedProfilePhotoUrl) {
    return uploadedProfilePhotoUrl;
  }

  if (user.auth0_user_id) {
    return getGravatarUrl(user.email);
  }

  return null;
}

export function serializeUserAvatar<T extends AvatarUserShape>(user: T) {
  const uploadedProfilePhotoUrl = getUploadedProfilePhotoUrl(user);
  const safeUser = Object.fromEntries(
    Object.entries(user).filter(([key]) => key !== 'profile_photo_path' && key !== 'profile_photo_url'),
  ) as Omit<T, 'profile_photo_path' | 'profile_photo_url'>;

  return {
    ...safeUser,
    profile_photo_url: uploadedProfilePhotoUrl,
    has_uploaded_profile_photo: Boolean(uploadedProfilePhotoUrl),
    avatar_url: getAvatarUrl(user),
  };
}
