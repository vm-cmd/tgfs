import fs from 'fs';

import input from 'input';
import yaml from 'js-yaml';
import os from 'os';
import path from 'path';
import { KeyVaultClient, getSecretOrDefault } from './utils/key-vault';
import { Logger } from './utils/logger';

export type Config = {
  azure?: {
    key_vault?: {
      url: string;
      enabled: boolean;
      secret_mapping?: {
        api_id?: string;
        api_hash?: string;
        bot_token?: string;
        private_file_channel?: string;
        password?: string;
        jwt_secret?: string;
        https_cert?: string;
        https_key?: string;
      };
    };
  };
  telegram: {
    api_id: number;
    api_hash: string;
    account: {
      session_file: string;
    };
    bot: {
      token: string;
      session_file: string;
    };
    login_timeout: number;
    private_file_channel: string;
    public_file_channel: string;
  };
  tgfs: {
    users: {
      [key: string]: {
        password: string;
      };
    };
    download: {
      chunk_size_kb: number;
    };
  };
  webdav: {
    host: string;
    port: number;
    path: string;
    https?: {
      enabled: boolean;
      cert: string;
      key: string;
    };
  };
  manager: {
    host: string;
    port: number;
    path: string;
    https?: {
      enabled: boolean;
      cert: string;
      key: string;
    };
    bot: {
      token: string;
      chat_id: number;
    };
    jwt: {
      secret: string;
      algorithm: string;
      life: number;
    };
  };
};

export let config: Config;

export const loadConfig = async (configPath: string): Promise<Config> => {
  const file = fs.readFileSync(configPath, 'utf8');
  const cfg = yaml.load(file);

  const getSessionFilePath = (session_file: string) => {
    if (session_file[0] === '~') {
      session_file = path.join(os.homedir(), session_file.slice(1));
    }
    if (!fs.existsSync(session_file)) {
      const dir = path.dirname(session_file);
      fs.mkdirSync(dir, { recursive: true });
    }

    return session_file;
  };

  // Initialize Key Vault client if enabled
  let keyVaultClient: KeyVaultClient | null = null;
  const azureConfig = cfg['azure']?.['key_vault'];
  const useKeyVault = azureConfig?.enabled === true && azureConfig?.url;
  
  if (useKeyVault) {
    Logger.info('Azure Key Vault integration enabled, initializing client...');
    keyVaultClient = KeyVaultClient.getInstance(azureConfig.url);
    if (!keyVaultClient.isInitialized()) {
      Logger.warn('Failed to initialize Azure Key Vault client, falling back to file-based configuration');
    }
  }

  // Load secrets from Key Vault or config file
  const secretMapping = azureConfig?.secret_mapping || {};
  
  // Load API ID (convert to number)
  const apiIdSecret = useKeyVault && secretMapping.api_id 
    ? await getSecretOrDefault(keyVaultClient, secretMapping.api_id, cfg['telegram']['api_id'])
    : cfg['telegram']['api_id'];
  
  // Load API Hash
  const apiHashSecret = useKeyVault && secretMapping.api_hash
    ? await getSecretOrDefault(keyVaultClient, secretMapping.api_hash, cfg['telegram']['api_hash'])
    : cfg['telegram']['api_hash'];
  
  // Load Bot Token
  const botTokenSecret = useKeyVault && secretMapping.bot_token
    ? await getSecretOrDefault(keyVaultClient, secretMapping.bot_token, cfg['telegram']['bot']['token'])
    : cfg['telegram']['bot']['token'];
  
  // Load Private File Channel
  const privateFileChannelSecret = useKeyVault && secretMapping.private_file_channel
    ? await getSecretOrDefault(keyVaultClient, secretMapping.private_file_channel, cfg['telegram']['private_file_channel'])
    : cfg['telegram']['private_file_channel'];
  
  // Load JWT Secret
  const jwtSecretSecret = useKeyVault && secretMapping.jwt_secret
    ? await getSecretOrDefault(keyVaultClient, secretMapping.jwt_secret, cfg['manager']['jwt']['secret'])
    : cfg['manager']['jwt']['secret'];

  // Load SSL Certificate and Key if HTTPS is enabled
  let httpsCertSecret = '';
  let httpsKeySecret = '';
  
  // Check if HTTPS is enabled for either WebDAV or Manager
  const webdavHttpsEnabled = cfg['webdav']?.['https']?.['enabled'] === true;
  const managerHttpsEnabled = cfg['manager']?.['https']?.['enabled'] === true;
  
  if ((webdavHttpsEnabled || managerHttpsEnabled) && useKeyVault) {
    // Load certificate from Key Vault if configured
    if (secretMapping.https_cert) {
      httpsCertSecret = await getSecretOrDefault(
        keyVaultClient,
        secretMapping.https_cert,
        webdavHttpsEnabled ? cfg['webdav']['https']['cert'] : (managerHttpsEnabled ? cfg['manager']['https']['cert'] : '')
      );
      
      // Don't write to disk, just log that we retrieved it
      if (httpsCertSecret && httpsCertSecret.includes('-----BEGIN CERTIFICATE-----')) {
        Logger.info(`Retrieved certificate from Key Vault (${secretMapping.https_cert})`);
      }
    }
    
    // Load private key from Key Vault if configured
    if (secretMapping.https_key) {
      httpsKeySecret = await getSecretOrDefault(
        keyVaultClient,
        secretMapping.https_key,
        webdavHttpsEnabled ? cfg['webdav']['https']['key'] : (managerHttpsEnabled ? cfg['manager']['https']['key'] : '')
      );
      
      // Don't write to disk, just log that we retrieved it
      if (httpsKeySecret && httpsKeySecret.includes('-----BEGIN PRIVATE KEY-----')) {
        Logger.info(`Retrieved private key from Key Vault (${secretMapping.https_key})`);
      }
    }
  }

  // Load user passwords
  const users = cfg['tgfs']['users'] || {};
  if (useKeyVault && secretMapping.password) {
    for (const username in users) {
      const passwordKey = `${secretMapping.password}-${username}`;
      users[username].password = await getSecretOrDefault(
        keyVaultClient, 
        passwordKey, 
        users[username].password
      );
    }
  }

  config = {
    azure: cfg['azure'],
    telegram: {
      api_id: Number(apiIdSecret),
      api_hash: apiHashSecret,
      account: {
        session_file: getSessionFilePath(
          cfg['telegram']['account']['session_file'],
        ),
      },
      bot: {
        token: botTokenSecret,
        session_file: getSessionFilePath(
          cfg['telegram']['bot']['session_file'],
        ),
      },
      login_timeout: cfg['telegram']['login_timeout'] ?? 300000,
      private_file_channel: `-100${privateFileChannelSecret}`,
      public_file_channel: cfg['telegram']['public_file_channel'],
    },
    tgfs: {
      users: users,
      download: {
        chunk_size_kb: cfg['tgfs']['download']['chunk_size_kb'] ?? 1024,
      },
    },
    webdav: {
      host: cfg['webdav']['host'] ?? '0.0.0.0',
      port: cfg['webdav']['port'] ?? 1900,
      path: cfg['webdav']['path'] ?? '/',
      https: {
        ...cfg['webdav']['https'],
        cert: httpsCertSecret || cfg['webdav']['https']?.['cert'] || '',
        key: httpsKeySecret || cfg['webdav']['https']?.['key'] || '',
      },
    },
    manager: {
      host: cfg['manager']['host'] ?? '0.0.0.0',
      port: cfg['manager']['port'] ?? 1901,
      path: cfg['manager']['path'] ?? '/',
      https: {
        ...cfg['manager']['https'],
        cert: httpsCertSecret || cfg['manager']['https']?.['cert'] || '',
        key: httpsKeySecret || cfg['manager']['https']?.['key'] || '',
      },
      bot: {
        token: cfg['manager']['bot']['token'],
        chat_id: cfg['manager']['bot']['chat_id'],
      },
      jwt: {
        secret: jwtSecretSecret,
        algorithm: cfg['manager']['jwt']['algorithm'] ?? 'HS256',
        life: cfg['manager']['jwt']['life'],
      },
    },
  };
  return config;
};

export const createConfig = async (): Promise<string> => {
  const createNow = await input.confirm(
    'The config file is malformed or not found. Create a config file now?',
  );

  if (!createNow) {
    process.exit(0);
  }

  const validateNotEmpty = (answer: string) => {
    if (answer.trim().length > 0) {
      return true;
    } else {
      return 'This field is mandatory!';
    }
  };

  const configPath = await input.text(
    'Where do you want to save this config file',
    { default: path.join(process.cwd(), 'config.yaml') },
  );

  const generateRandomSecret = () => {
    const chars =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let secret = '';
    for (let i = 0; i < 64; i++) {
      secret += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return secret;
  };

  const useAzureKeyVault = await input.confirm(
    'Do you want to use Azure Key Vault for secrets? (Recommended for security)',
    { default: true }
  );

  const useHttps = await input.confirm(
    'Do you want to enable HTTPS for WebDAV and manager servers? (Recommended for security)',
    { default: false }
  );

  let httpsCert = '';
  let httpsKey = '';

  if (useHttps) {
    httpsCert = await input.text(
      'Path to SSL certificate file (.pem)',
      { validate: validateNotEmpty }
    );
    
    httpsKey = await input.text(
      'Path to SSL private key file (.pem)',
      { validate: validateNotEmpty }
    );
  }

  // Collect all sensitive information
  const apiId = await input.text(
    'Visit https://my.telegram.org/apps, create an app and paste the app_id, app_token here\nApp api_id',
    {
      validate: (value) => {
        if (!validateNotEmpty(value)) {
          return 'This field is mandatory!';
        }
        if (isNaN(Number(value))) {
          return 'API ID must be a number';
        }
        return true;
      },
    },
  );
  
  const apiHash = await input.text('App api_hash', {
    validate: validateNotEmpty,
  });
  
  const botToken = await input.text(
    'Create a bot from https://t.me/botfather and paste the bot token here\nBot token',
    {
      validate: validateNotEmpty,
    },
  );
  
  const privateFileChannel = await input.text(
    'Create a PRIVATE channel and paste the channel id here\nChannel to store the files',
    {
      validate: validateNotEmpty,
    },
  );
  
  // Get session file paths (needed regardless of Key Vault usage)
  const accountSessionFile = await input.text(
    'Where do you want to save the account session',
    { default: '~/.tgfs/account.session' },
  );
  
  const botSessionFile = await input.text(
    'Where do you want to save the bot session',
    { default: '~/.tgfs/bot.session' },
  );
  
  const jwtSecret = generateRandomSecret();
  let userPassword = 'password'; // Default password for the 'user' account

  // If not using Key Vault, ask for a password directly
  if (!useAzureKeyVault) {
    userPassword = await input.text(
      'Enter a password for the default user account',
      { 
        default: 'password',
        validate: (value) => {
          if (value.length < 6) {
            return 'Password must be at least 6 characters long';
          }
          return true;
        }
      }
    );
  }

  let azureConfig = undefined;
  let keyVaultClient = null;
  let secretMapping: {
    api_id: string;
    api_hash: string;
    bot_token: string;
    private_file_channel: string;
    password: string;
    jwt_secret: string;
    https_cert?: string;
    https_key?: string;
  } = {
    api_id: '',
    api_hash: '',
    bot_token: '',
    private_file_channel: '',
    password: '',
    jwt_secret: ''
  };
  let secretsUploaded = false;

  if (useAzureKeyVault) {
    const keyVaultUrl = await input.text(
      'Enter your Azure Key Vault URL (e.g., https://your-vault.vault.azure.net/)',
      { validate: validateNotEmpty }
    );

    secretMapping = {
      api_id: await input.text('Secret name for api_id in Key Vault', { default: 'tgfs-api-id' }),
      api_hash: await input.text('Secret name for api_hash in Key Vault', { default: 'tgfs-api-hash' }),
      bot_token: await input.text('Secret name for bot token in Key Vault', { default: 'tgfs-bot-token' }),
      private_file_channel: await input.text('Secret name for private_file_channel in Key Vault', { default: 'tgfs-private-file-channel' }),
      password: await input.text('Base secret name for user passwords in Key Vault (will be suffixed with username)', { default: 'tgfs-user-password' }),
      jwt_secret: await input.text('Secret name for JWT secret in Key Vault (server-side secret, automatically generated)', { default: 'tgfs-jwt-secret' }),
      https_cert: await input.text('Secret name for SSL certificate in Key Vault', { default: 'tgfs-https-cert' }),
      https_key: await input.text('Secret name for SSL private key in Key Vault', { default: 'tgfs-https-key' }),
    };

    // Ask for the user password even when using Key Vault
    userPassword = await input.text(
      'Enter a password for the default user account (will be stored in Key Vault)',
      { 
        default: 'password',
        validate: (value) => {
          if (value.length < 6) {
            return 'Password must be at least 6 characters long';
          }
          return true;
        }
      }
    );

    azureConfig = {
      key_vault: {
        url: keyVaultUrl,
        enabled: true,
        secret_mapping: secretMapping
      }
    };

    // Try to initialize Key Vault client and upload secrets
    try {
      Logger.info('Attempting to initialize Azure Key Vault client...');
      keyVaultClient = KeyVaultClient.getInstance(keyVaultUrl);
      
      if (keyVaultClient.isInitialized()) {
        const uploadSecrets = await input.confirm(
          'Would you like to automatically upload secrets to Azure Key Vault now?',
          { default: true }
        );
        
        if (uploadSecrets) {
          Logger.info('Uploading secrets to Azure Key Vault...');
          
          try {
            // Test authentication by trying to set a single secret first
            const testResult = await keyVaultClient.setSecret('tgfs-test-secret', 'test-value');
            if (!testResult) {
              throw new Error('Authentication test failed');
            }
            
            const uploadPromises = [
              keyVaultClient.setSecret(secretMapping.api_id, apiId),
              keyVaultClient.setSecret(secretMapping.api_hash, apiHash),
              keyVaultClient.setSecret(secretMapping.bot_token, botToken),
              keyVaultClient.setSecret(secretMapping.private_file_channel, privateFileChannel),
              keyVaultClient.setSecret(secretMapping.jwt_secret, jwtSecret),
              keyVaultClient.setSecret(secretMapping.https_cert, httpsCert),
              keyVaultClient.setSecret(secretMapping.https_key, httpsKey),
              keyVaultClient.setSecret(`${secretMapping.password}-user`, userPassword)
            ];
            
            const results = await Promise.all(uploadPromises);
            secretsUploaded = results.every(result => result === true);
            
            if (secretsUploaded) {
              Logger.info('All secrets successfully uploaded to Azure Key Vault');
            } else {
              Logger.warn('Some secrets could not be uploaded to Azure Key Vault');
              Logger.warn('You will need to manually upload the secrets using the Azure CLI or Portal');
              Logger.warn('See AZURE_KEYVAULT_SETUP.md for instructions');
            }
          } catch (uploadError) {
            Logger.error(`Failed to upload secrets to Azure Key Vault: ${uploadError.message}`);
            Logger.warn('This is likely due to authentication issues with Azure Key Vault.');
            Logger.warn('Make sure you have the necessary permissions and are authenticated with Azure.');
            Logger.warn('For local development, run "az login" before running this script.');
            Logger.warn('For Azure VMs, ensure the VM has a managed identity with "Set" permissions on the Key Vault.');
            Logger.warn('You will need to manually upload the secrets using the Azure CLI or Portal');
            Logger.warn('See AZURE_KEYVAULT_SETUP.md for instructions');
          }
        }
      } else {
        Logger.warn('Azure Key Vault client initialization failed.');
        Logger.warn('You will need to manually upload the secrets using the Azure CLI or Portal');
        Logger.warn('See AZURE_KEYVAULT_SETUP.md for instructions');
      }
    } catch (error) {
      Logger.error(`Failed to initialize Azure Key Vault client: ${error.message}`);
      Logger.warn('You will need to manually upload the secrets using the Azure CLI or Portal');
      Logger.warn('See AZURE_KEYVAULT_SETUP.md for instructions');
    }
  }

  // Create the configuration object with appropriate values based on Key Vault usage
  const res: Config = {
    azure: azureConfig,
    telegram: {
      api_id: useAzureKeyVault ? 0 : Number(apiId),
      api_hash: useAzureKeyVault ? '' : apiHash,
      account: {
        session_file: path.join(os.homedir(), '.tgfs', 'account.session'),
      },
      bot: {
        token: useAzureKeyVault ? '' : botToken,
        session_file: path.join(os.homedir(), '.tgfs', 'bot.session'),
      },
      login_timeout: 300000,
      private_file_channel: useAzureKeyVault ? '' : privateFileChannel,
      public_file_channel: '0',
    },
    tgfs: {
      users: {
        user: {
          password: useAzureKeyVault ? '' : userPassword,
        },
      },
      download: {
        chunk_size_kb: 1024,
      },
    },
    webdav: {
      host: '0.0.0.0',
      port: 1900,
      path: '/',
      https: {
        enabled: useHttps,
        cert: httpsCert,
        key: httpsKey,
      },
    },
    manager: {
      host: '0.0.0.0',
      port: 1901,
      path: '/',
      https: {
        enabled: useHttps,
        cert: httpsCert,
        key: httpsKey,
      },
      bot: {
        token: '',
        chat_id: 0,
      },
      jwt: {
        secret: useAzureKeyVault ? "" : jwtSecret, // Use placeholder for Key Vault
        algorithm: 'HS256',
        life: 3600 * 24 * 7,
      },
    },
  };

  // Generate YAML with comments
  let yamlString = yaml.dump(res);
  
  // Add helpful comments if using Key Vault
  if (useAzureKeyVault) {
    yamlString = `# TGFS Configuration with Azure Key Vault integration
# Sensitive information is stored in Azure Key Vault: ${azureConfig.key_vault.url}
# 
# Secret mappings:
# - Telegram API ID: ${secretMapping.api_id}
# - Telegram API Hash: ${secretMapping.api_hash}
# - Bot Token: ${secretMapping.bot_token}
# - Private File Channel: ${secretMapping.private_file_channel}
# - JWT Secret: ${secretMapping.jwt_secret}
# - SSL Certificate: ${secretMapping.https_cert}
# - SSL Private Key: ${secretMapping.https_key}
# - User Passwords: ${secretMapping.password}-{username}
#` + 
(secretsUploaded ? 
`
# Secrets have been automatically uploaded to Azure Key Vault.
` : 
`
# IMPORTANT: Secrets have NOT been uploaded to Azure Key Vault. Please upload them manually using:
# az keyvault secret set --vault-name your-vault-name --name secret-name --value secret-value
#`) + 
`

${yamlString}`;
  } else {
    yamlString = `# TGFS Configuration
# WARNING: This configuration contains sensitive information in plaintext.
# Consider using Azure Key Vault integration for better security.

${yamlString}`;
  }

  fs.writeFileSync(configPath, yamlString);
  
  // Set appropriate file permissions
  try {
    fs.chmodSync(configPath, 0o600); // Read/write for owner only
    Logger.info(`Set restrictive permissions on config file: ${configPath}`);
  } catch (error) {
    Logger.warn(`Could not set restrictive permissions on config file: ${error.message}`);
  }
  
  return configPath;
};
