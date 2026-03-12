import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { getEffectiveConfigValue } from '../services/config.service.js';

let cachedJWKS: { jwks: ReturnType<typeof createRemoteJWKSet>; domain: string } | null = null;

async function getAuth0Config() {
  const domain = (await getEffectiveConfigValue('auth0', 'domain')) || process.env.AUTH0_DOMAIN;
  const audience = (await getEffectiveConfigValue('auth0', 'audience')) || process.env.AUTH0_AUDIENCE;

  if (!domain) {
    throw new Error('Auth0 domain not configured');
  }

  return { domain, audience };
}

function getJWKS(domain: string) {
  if (cachedJWKS && cachedJWKS.domain === domain) {
    return cachedJWKS.jwks;
  }

  const jwks = createRemoteJWKSet(new URL(`https://${domain}/.well-known/jwks.json`));
  cachedJWKS = { jwks, domain };
  return jwks;
}

export interface Auth0VerifiedPayload {
  sub: string;
  email: string;
  email_verified: true;
  given_name?: string;
  family_name?: string;
}

export async function verifyAuth0Token(token: string): Promise<Auth0VerifiedPayload> {
  const { domain, audience } = await getAuth0Config();
  const jwks = getJWKS(domain);

  const verifyOptions: { issuer: string; audience?: string } = {
    issuer: `https://${domain}/`,
  };

  if (audience) {
    verifyOptions.audience = audience;
  }

  const { payload } = await jwtVerify(token, jwks, verifyOptions);

  if (!payload.sub || !payload.email) {
    throw new Error('Token missing required claims (sub, email)');
  }

  if (payload.email_verified !== true) {
    throw new Error('Email address has not been verified');
  }

  return {
    sub: payload.sub,
    email: payload.email as string,
    email_verified: true,
    given_name: (payload as JWTPayload & Record<string, unknown>).given_name as string | undefined,
    family_name: (payload as JWTPayload & Record<string, unknown>).family_name as string | undefined,
  };
}

export function invalidateJWKSCache(): void {
  cachedJWKS = null;
}
