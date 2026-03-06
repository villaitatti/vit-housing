export interface ConfigField {
  key: string;
  envVar: string;
  isSecret: boolean;
  label: string;
}

export interface ServiceDefinition {
  label: string;
  configs: ConfigField[];
}

export const SERVICE_DEFINITIONS: Record<string, ServiceDefinition> = {
  auth0: {
    label: 'Auth0 Authentication',
    configs: [
      { key: 'domain', envVar: 'AUTH0_DOMAIN', isSecret: false, label: 'Domain' },
      { key: 'client_id', envVar: 'AUTH0_CLIENT_ID', isSecret: true, label: 'Client ID' },
      { key: 'client_secret', envVar: 'AUTH0_CLIENT_SECRET', isSecret: true, label: 'Client Secret' },
      { key: 'audience', envVar: 'AUTH0_AUDIENCE', isSecret: false, label: 'API Audience' },
    ],
  },
  ses: {
    label: 'AWS SES Email',
    configs: [
      { key: 'region', envVar: 'AWS_REGION', isSecret: false, label: 'Region' },
      { key: 'access_key_id', envVar: 'AWS_ACCESS_KEY_ID', isSecret: true, label: 'Access Key ID' },
      { key: 'secret_access_key', envVar: 'AWS_SECRET_ACCESS_KEY', isSecret: true, label: 'Secret Access Key' },
      { key: 'from_address', envVar: 'SES_FROM_ADDRESS', isSecret: false, label: 'From Address' },
      { key: 'invitation_base_url', envVar: 'INVITATION_BASE_URL', isSecret: false, label: 'Invitation Base URL' },
    ],
  },
  google_maps: {
    label: 'Google Maps',
    configs: [
      { key: 'server_api_key', envVar: 'GOOGLE_MAPS_API_KEY', isSecret: true, label: 'Server API Key' },
      { key: 'client_api_key', envVar: 'VITE_GOOGLE_MAPS_API_KEY', isSecret: true, label: 'Client API Key' },
    ],
  },
};

export const VALID_SERVICES = Object.keys(SERVICE_DEFINITIONS);
