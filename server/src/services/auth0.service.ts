import { getEffectiveConfigValue } from './config.service.js';

interface Auth0Role {
  id: string;
  name: string;
  description: string;
}

let managementToken: { token: string; expiresAt: number } | null = null;

async function getManagementToken(): Promise<string> {
  // Return cached token if still valid (with 5 min buffer)
  if (managementToken && Date.now() < managementToken.expiresAt - 5 * 60 * 1000) {
    return managementToken.token;
  }

  const domain = await getEffectiveConfigValue('auth0', 'domain') || process.env.AUTH0_DOMAIN;
  const clientId = await getEffectiveConfigValue('auth0', 'client_id') || process.env.AUTH0_CLIENT_ID;
  const clientSecret = await getEffectiveConfigValue('auth0', 'client_secret') || process.env.AUTH0_CLIENT_SECRET;
  const audience = `https://${domain}/api/v2/`;

  if (!domain || !clientId || !clientSecret) {
    throw new Error('Auth0 Management API credentials not configured (domain, client_id, client_secret required)');
  }

  const response = await fetch(`https://${domain}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      audience,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Failed to get Auth0 management token: ${response.status} ${errorBody}`);
  }

  const data = await response.json() as { access_token: string; expires_in: number };
  managementToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  return managementToken.token;
}

export async function listAuth0Roles(): Promise<Auth0Role[]> {
  const domain = await getEffectiveConfigValue('auth0', 'domain') || process.env.AUTH0_DOMAIN;
  const token = await getManagementToken();

  const response = await fetch(`https://${domain}/api/v2/roles`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error(`Failed to list Auth0 roles: ${response.status}`);
  }

  const roles = await response.json() as Auth0Role[];
  return roles.map((r) => ({ id: r.id, name: r.name, description: r.description || '' }));
}

export async function getUserAuth0Roles(auth0UserId: string): Promise<Auth0Role[]> {
  const domain = await getEffectiveConfigValue('auth0', 'domain') || process.env.AUTH0_DOMAIN;
  const token = await getManagementToken();

  const response = await fetch(`https://${domain}/api/v2/users/${encodeURIComponent(auth0UserId)}/roles`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    console.warn(`Failed to get Auth0 roles for user ${auth0UserId}: ${response.status}`);
    return [];
  }

  const roles = await response.json() as Auth0Role[];
  return roles.map((r) => ({ id: r.id, name: r.name, description: r.description || '' }));
}

// Invalidate cached token when Auth0 config changes
export function invalidateAuth0Token(): void {
  managementToken = null;
}
