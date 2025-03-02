<p align="center">
  <img src="https://raw.githubusercontent.com/TheodoreKrypton/tgfs/master/tgfs.png" alt="logo" width="100"/>
</p>

# tgfs

Use telegram as file storage, with a command line tool and WebDAV server. Refer to the [wiki page](https://github.com/TheodoreKrypton/tgfs/wiki/TGFS-Wiki) for more detail.

[![Test](https://github.com/TheodoreKrypton/tgfs/actions/workflows/test.yml/badge.svg)](https://github.com/TheodoreKrypton/tgfs/actions/workflows/test.yml) [![codecov](https://codecov.io/gh/TheodoreKrypton/tgfs/branch/master/graph/badge.svg?token=CM6TF4C9B9)](https://codecov.io/gh/TheodoreKrypton/tgfs) [![npm version](https://badge.fury.io/js/tgfs.svg)](https://www.npmjs.com/package/tgfs)

Tested on Windows, Ubuntu, MacOS

## Installation

### Through NPM

```bash
$ npm install tgfs
```

### Through Git

```bash
$ yarn install && yarn build
$ alias tgfs="yarn start:prod"
```

## Use it as a WebDAV server

```
$ tgfs -w
```

or

```
$ tgfs --webdav
```

Tested WebDAV Clients:

- [Cyberduck](https://cyberduck.io/)
- [Mountain Duck](https://mountainduck.io/)
- [File Stash](https://www.filestash.app/)
- [WinSCP](https://winscp.net/eng/index.php)
- [WebDAV Sync](http://www.re.be/webdav_sync/index.xhtml)
- [Joplin](https://joplinapp.org/)

## cmd usage

- ls

  ```bash
  $ tgfs cmd ls /
  ```

- mkdir

  ```bash
  $ tgfs cmd mkdir /documents
  ```

  ```bash
  $ tgfs cmd mkdir -p /documents/pictures
  ```

- cp

  ```bash
  $ tgfs cmd cp ~/some-file /
  ```

- rm

  ```bash
  $ tgfs cmd rm /some-file
  ```

  ```bash
  $ tgfs cmd rm -r /some-folder
  ```

## Step by Step Guide to Set up config

> For feature development purpose, any configuration is **unstable** at the current stage. You may need to reconfigure following any update.

### Automatically:

A config file will be auto-generated when you run the program for the first time. Just follow the instructions to create a Telegram app and a private channel to store the files.

### Manually:

#### Preparation

1. Duplicate the `example-config.yaml` file and name it `config.yaml`

#### Set up account details ([why do I need this?](#FAQ))

1. Go to [Here](https://my.telegram.org/apps), login with your phone number and create a Telegram app.
2. Copy the `api_id` and `api_hash` from the Telegram app page (step 2) to the config file (`telegram -> account -> api_id / api_hash`)

#### Set up the channel to store files

1. Create a new Telegram private channel (New Channel in the menu on the left)
2. There should be a message like "Channel created". Right click the message and copy the post link.
3. The format of the link should be like `https://t.me/c/1234567/1`, where `1234567` is the channel id. Copy the channel id to the config file (`telegram -> private_file_channel`)

#### Set up a Telegram bot ([why do I need this?](#FAQ))

1. Go to [BotFather](https://telegram.me/BotFather), send `/newbot`, and follow the steps to create a bot.
2. Paste the bot token given by BotFater to the config file (`telegram -> bot -> token`)
3. Go to your file channel (created in the previous step), add your bot to subscriber, and promote it to admin, with permission to send/edit/delete messages.

## Config fields explanation

- azure
  - key_vault
    - url: The URL of your Azure Key Vault (e.g., https://your-vault.vault.azure.net/)
    - enabled: Whether to use Azure Key Vault for secrets
    - secret_mapping: Mapping of TGFS config keys to Azure Key Vault secret names
      - api_id: Secret name for the Telegram API ID
      - api_hash: Secret name for the Telegram API Hash
      - bot_token: Secret name for the Telegram Bot Token
      - private_file_channel: Secret name for the Private File Channel ID
      - password: Base secret name for user passwords (will be suffixed with username)
      - jwt_secret: Secret name for the JWT Secret

- telegram

  - account/bot:
    - session_file: The file path to store the session data. If you want to use multiple accounts, you can set different session files for each account.
  - login_timeout: Time to wait before login attempt aborts (in milliseconds).

- tgfs

  - users: the users authenticated by tgfs, used by both webdav authentication and monitor
  - download
    - chunk_size_kb: The chunk size in KB when downloading files. Bigger chunk size means less requests.

- webdav
  - host: The host of the WebDAV server listening on.
  - port: The port of the WebDAV server listening on.
  - path: The root path for the WebDAV server. For example, setting this value to /webdav makes the WebDAV link `http://[host]:[port]/webdav`.

## FAQ

**Q: Why do I need a bot when my account is also able to send messages?**

Frequently sending messages may get your account banned, so using a bot is the best way to manage the risk. You can create another bot when it is banned.

**Q: Why do I need an account API then?**

The functionality of bot API is limited. For example, a bot can neither read history messages, nor send files exceeding 50MB. The account API is used when a bot cannot do the job.

## Azure Key Vault Integration

TGFS supports storing sensitive configuration values in Azure Key Vault. This is particularly useful when running in Azure environments with managed identities.

### Setting up Azure Key Vault Integration

1. Create an Azure Key Vault in your Azure subscription
2. Create secrets in the Key Vault for each sensitive value (api_id, api_hash, bot_token, etc.)
3. If running on an Azure VM, ensure the VM has a managed identity assigned
4. Grant the managed identity "Get" permissions for secrets in the Key Vault
5. Configure TGFS to use Azure Key Vault by setting the appropriate values in the config file

### How Secret Mappings Work

When using Azure Key Vault integration, the configuration file contains mappings between TGFS configuration keys and Azure Key Vault secret names:

```yaml
azure:
  key_vault:
    url: https://your-keyvault-name.vault.azure.net/
    enabled: true
    secret_mapping:
      # These are the names of secrets in Azure Key Vault, not the actual values
      api_id: tgfs-api-id
      api_hash: tgfs-api-hash
      bot_token: tgfs-bot-token
      private_file_channel: tgfs-private-file-channel
      password: tgfs-user-password
      jwt_secret: tgfs-jwt-secret
```

Important notes about secret mappings:
- The values in the `secret_mapping` section are the **names** of secrets in Azure Key Vault, not the actual sensitive values
- At runtime, TGFS will retrieve the actual values from Key Vault using these secret names
- For example, if `api_id` is mapped to `tgfs-api-id`, TGFS will look for a secret named `tgfs-api-id` in Key Vault
- When using Key Vault, you should use placeholder values (or empty values) in the main configuration sections

### Example Configuration

See `example-config-azure.yaml` for a complete example of how to configure Azure Key Vault integration.

### Understanding JWT Secret Configuration

The JWT secret is a server-side configuration value used for signing and verifying JSON Web Tokens. It is:
- Automatically generated during initial setup
- Not something users need to provide during login
- Used by the server to authenticate users after they've logged in with their username/password
- Stored securely in Azure Key Vault when Key Vault integration is enabled

Users authenticate with their username and password, and the server uses the JWT secret to generate a token that the client can use for subsequent requests.

### Local Development

For local development or when running outside of Azure, you can:
1. Set `azure.key_vault.enabled` to `false` to use values directly from the config file
2. Use Azure CLI to authenticate (`az login`) before running TGFS
3. Use environment variables for Azure authentication
