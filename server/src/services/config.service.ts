import { prisma } from '../lib/prisma.js';
import { encrypt, decrypt } from '../lib/encryption.js';
import { SERVICE_DEFINITIONS } from '../config/service-definitions.js';

export interface ConfigEntry {
  key: string;
  label: string;
  value: string;
  isSet: boolean;
  isSecret: boolean;
  source: 'database' | 'environment' | 'not_set';
}

export interface ServiceConfigGroup {
  service: string;
  label: string;
  configs: ConfigEntry[];
}

function maskSecret(value: string): string {
  if (!value) return '';
  if (value.length <= 8) return '****';
  return value.substring(0, 4) + '****' + value.substring(value.length - 4);
}

export async function getServiceConfigs(): Promise<ServiceConfigGroup[]> {
  const dbConfigs = await prisma.serviceConfig.findMany();
  const dbMap = new Map(dbConfigs.map((c) => [`${c.service}:${c.key}`, c]));

  const groups: ServiceConfigGroup[] = [];

  for (const [serviceName, def] of Object.entries(SERVICE_DEFINITIONS)) {
    const configs: ConfigEntry[] = [];

    for (const field of def.configs) {
      const dbKey = `${serviceName}:${field.key}`;
      const dbConfig = dbMap.get(dbKey);

      let value = '';
      let source: ConfigEntry['source'] = 'not_set';
      let isSet = false;

      if (dbConfig) {
        // DB value takes precedence
        const rawValue = dbConfig.is_secret ? decrypt(dbConfig.value) : dbConfig.value;
        value = field.isSecret ? maskSecret(rawValue) : rawValue;
        source = 'database';
        isSet = true;
      } else {
        // Fall back to env var
        const envValue = process.env[field.envVar];
        if (envValue) {
          value = field.isSecret ? maskSecret(envValue) : envValue;
          source = 'environment';
          isSet = true;
        }
      }

      configs.push({
        key: field.key,
        label: field.label,
        value,
        isSet,
        isSecret: field.isSecret,
        source,
      });
    }

    groups.push({ service: serviceName, label: def.label, configs });
  }

  return groups;
}

export async function getEffectiveConfigValue(service: string, key: string): Promise<string | undefined> {
  const dbConfig = await prisma.serviceConfig.findUnique({
    where: { service_key: { service, key } },
  });

  if (dbConfig) {
    return dbConfig.is_secret ? decrypt(dbConfig.value) : dbConfig.value;
  }

  // Fall back to env var
  const def = SERVICE_DEFINITIONS[service];
  if (!def) return undefined;

  const field = def.configs.find((c) => c.key === key);
  if (!field) return undefined;

  return process.env[field.envVar];
}

export async function upsertServiceConfigs(
  service: string,
  configs: { key: string; value: string }[],
  userId: number,
): Promise<void> {
  const def = SERVICE_DEFINITIONS[service];
  if (!def) throw new Error(`Unknown service: ${service}`);

  const operations = configs.map((config) => {
    const field = def.configs.find((c) => c.key === config.key);
    if (!field) throw new Error(`Unknown config key: ${config.key} for service: ${service}`);

    const value = field.isSecret ? encrypt(config.value) : config.value;

    return prisma.serviceConfig.upsert({
      where: { service_key: { service, key: config.key } },
      update: { value, is_secret: field.isSecret, updated_by: userId },
      create: { service, key: config.key, value, is_secret: field.isSecret, updated_by: userId },
    });
  });

  await prisma.$transaction(operations);
}

export async function getServiceConfigForService(service: string): Promise<ConfigEntry[]> {
  const groups = await getServiceConfigs();
  const group = groups.find((g) => g.service === service);
  return group?.configs ?? [];
}
