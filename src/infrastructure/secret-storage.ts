import { logger } from './logger.js';

export const SERVICE_NAME = 'personal-assistant';

interface KeytarModule {
  setPassword(service: string, account: string, password: string): Promise<void>;
  getPassword(service: string, account: string): Promise<string | null>;
  deletePassword(service: string, account: string): Promise<boolean>;
  findCredentials(service: string): Promise<Array<{ account: string; password: string }>>;
}

let keytarModule: KeytarModule | null = null;

async function loadKeytar(): Promise<KeytarModule | null> {
  if (keytarModule) {
    return keytarModule;
  }

  try {
    keytarModule = await import('keytar') as unknown as KeytarModule;
    return keytarModule;
  } catch {
    logger.warn(
      'keytar is not available — falling back to environment variables for secret storage'
    );
    return null;
  }
}

function getEnvKey(service: string, account: string): string | null {
  const envKey = `${service}_${account}`.toUpperCase().replace(/[^A-Z0-9]/g, '_');
  return process.env[envKey] ?? null;
}

function setEnvKeyFallback(service: string, account: string, _key: string): never {
  const envKey = `${service}_${account}`.toUpperCase().replace(/[^A-Z0-9]/g, '_');
  throw new Error(
    `keytar is not available, so secrets cannot be persisted to the OS keychain. ` +
      `Set the environment variable ${envKey} instead and restart the process, ` +
      `or install keytar (e.g. \`npm install keytar\`) to enable secure storage.`,
  );
}

export class SecretStorage {
  static async storeKey(service: string, account: string, key: string): Promise<void> {
    const kt = await loadKeytar();
    if (kt) {
      await kt.setPassword(service, account, key);
    } else {
      setEnvKeyFallback(service, account, key);
    }
  }

  static async getKey(service: string, account: string): Promise<string | null> {
    const kt = await loadKeytar();
    if (kt) {
      return kt.getPassword(service, account);
    }
    return getEnvKey(service, account);
  }

  static async deleteKey(service: string, account: string): Promise<void> {
    const kt = await loadKeytar();
    if (kt) {
      await kt.deletePassword(service, account);
    }
  }

  static async findCredentials(
    service: string
  ): Promise<Array<{ account: string; password: string }>> {
    const kt = await loadKeytar();
    if (kt) {
      return kt.findCredentials(service);
    }
    return [];
  }

  async storeProviderKey(provider: string, key: string): Promise<void> {
    return SecretStorage.storeKey(SERVICE_NAME, provider, key);
  }

  async getProviderKey(provider: string): Promise<string | null> {
    return SecretStorage.getKey(SERVICE_NAME, provider);
  }

  async deleteProviderKey(provider: string): Promise<void> {
    return SecretStorage.deleteKey(SERVICE_NAME, provider);
  }

  async listProviders(): Promise<string[]> {
    const credentials = await SecretStorage.findCredentials(SERVICE_NAME);
    return credentials.map((c) => c.account);
  }
}