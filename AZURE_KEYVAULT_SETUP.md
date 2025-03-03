# Azure Key Vault Integration for TGFS

This document provides instructions for setting up TGFS with Azure Key Vault integration to securely store sensitive configuration values.

## Prerequisites

- An Azure subscription
- An Azure Key Vault
- An Azure VM with a managed identity (for production use)

## Setting Up Azure Key Vault

1. Create an Azure Key Vault in your Azure subscription:

```bash
az keyvault create --name your-keyvault-name --resource-group your-resource-group --location your-location
```

2. Add the required secrets to your Key Vault:

```bash
# Telegram API ID
az keyvault secret set --vault-name your-keyvault-name --name tgfs-api-id --value "your-api-id"

# Telegram API Hash
az keyvault secret set --vault-name your-keyvault-name --name tgfs-api-hash --value "your-api-hash"

# Telegram Bot Token
az keyvault secret set --vault-name your-keyvault-name --name tgfs-bot-token --value "your-bot-token"

# Private File Channel ID
az keyvault secret set --vault-name your-keyvault-name --name tgfs-private-file-channel --value "your-channel-id"

# JWT Secret (for authentication)
az keyvault secret set --vault-name your-keyvault-name --name tgfs-jwt-secret --value "your-jwt-secret"

# User Password (will be suffixed with username)
az keyvault secret set --vault-name your-keyvault-name --name tgfs-user-password-user --value "your-password"
```

## Storing SSL Certificates in Key Vault

For enhanced security, you can store SSL certificates and private keys directly in Azure Key Vault:

1. Prepare your certificate and private key files in PEM format.

2. Store the entire PEM content as secrets in Key Vault:

```bash
# Store SSL certificate (use --file to read from a file)
az keyvault secret set --vault-name your-keyvault-name --name tgfs-https-cert --file /path/to/cert.pem

# Store SSL private key (use --file to read from a file)
az keyvault secret set --vault-name your-keyvault-name --name tgfs-https-key --file /path/to/key.pem
```

Alternatively, you can store the content directly:

```bash
# Store SSL certificate (use multiline string)
az keyvault secret set --vault-name your-keyvault-name --name tgfs-https-cert --value "$(cat /path/to/cert.pem)"

# Store SSL private key (use multiline string)
az keyvault secret set --vault-name your-keyvault-name --name tgfs-https-key --value "$(cat /path/to/key.pem)"
```

3. Configure TGFS to use these secrets by updating your config.yaml:

```yaml
azure:
  key_vault:
    url: https://your-keyvault-name.vault.azure.net/
    enabled: true
    secret_mapping:
      # ... other mappings ...
      https_cert: tgfs-https-cert
      https_key: tgfs-https-key

webdav:
  # ... other settings ...
  https:
    enabled: true
    cert: ""  # Will be loaded from Key Vault
    key: ""   # Will be loaded from Key Vault

manager:
  # ... other settings ...
  https:
    enabled: true
    cert: ""  # Will be loaded from Key Vault
    key: ""   # Will be loaded from Key Vault
```

TGFS will load the certificate and key directly into memory at runtime, without writing them to disk.

1. **For local development**:
   ```bash
   # Login with your Azure account
   az login
   
   # Verify you have access to the Key Vault
   az keyvault list
   ```

2. **For Azure VMs with managed identity**:
   - Ensure the VM has a managed identity assigned
   - Grant the managed identity "Set" permissions for secrets in the Key Vault:
   ```bash
   # Get the VM's managed identity principal ID
   PRINCIPAL_ID=$(az vm identity show --resource-group your-resource-group --name your-vm-name --query principalId -o tsv)
   
   # Grant the managed identity "Set" permissions for secrets in the Key Vault
   az keyvault set-policy --name your-keyvault-name --object-id $PRINCIPAL_ID --secret-permissions get set list
   ```

3. **Using a service principal**:
   ```bash
   # Login with a service principal
   az login --service-principal -u <app-id> -p <password> --tenant <tenant-id>
   ```

## Setting Up Azure VM with Managed Identity

1. Create an Azure VM with a system-assigned managed identity:

```bash
az vm create \
  --resource-group your-resource-group \
  --name your-vm-name \
  --image UbuntuLTS \
  --admin-username azureuser \
  --generate-ssh-keys \
  --assign-identity
```

Or enable managed identity on an existing VM:

```bash
az vm identity assign --resource-group your-resource-group --name your-vm-name
```

2. Grant the VM's managed identity access to your Key Vault:

```bash
# Get the VM's managed identity principal ID
PRINCIPAL_ID=$(az vm identity show --resource-group your-resource-group --name your-vm-name --query principalId -o tsv)

# Grant the managed identity "Get" permissions for secrets in the Key Vault
az keyvault set-policy --name your-keyvault-name --object-id $PRINCIPAL_ID --secret-permissions get
```

## Configuring TGFS

1. Create a configuration file (e.g., `config-azure.yaml`) with Azure Key Vault settings:

```yaml
azure:
  key_vault:
    url: https://your-keyvault-name.vault.azure.net/
    enabled: true
    secret_mapping:
      # These are the names of secrets in Azure Key Vault, not the actual values
      # The actual sensitive values are stored in Key Vault, not in this config file
      api_id: tgfs-api-id
      api_hash: tgfs-api-hash
      bot_token: tgfs-bot-token
      private_file_channel: tgfs-private-file-channel
      password: tgfs-user-password
      jwt_secret: tgfs-jwt-secret  # Server-side secret for JWT token signing, not user-provided

# Rest of your configuration...
```

When using Azure Key Vault integration:
- The config file contains only the names of secrets in Key Vault, not the actual sensitive values
- At runtime, TGFS will retrieve the actual values from Key Vault using these secret names
- For example, if `api_id` is mapped to `tgfs-api-id`, TGFS will look for a secret named `tgfs-api-id` in Key Vault

2. Run TGFS with the configuration file:

```bash
tgfs -f config-azure.yaml
```

## Running in Docker

1. Build the Docker image:

```bash
docker build -t tgfs .
```

2. Run the Docker container with the configuration file:

```bash
docker run -v /path/to/config-azure.yaml:/config.yaml -p 1900:1900 -p 1901:1901 tgfs -f /config.yaml
```

## Troubleshooting

If you encounter issues with Azure Key Vault integration, follow these steps to diagnose and resolve the problems:

### Authentication Issues

The most common problem is authentication with Azure Key Vault. Here's how to troubleshoot:

1. **Check your authentication status**:
   ```bash
   # For user authentication
   az account show
   
   # For managed identity (on Azure VM)
   az login --identity
   az account show
   ```

2. **Verify Key Vault access**:
   ```bash
   # List Key Vaults you have access to
   az keyvault list
   
   # List secrets in your Key Vault (to test read access)
   az keyvault secret list --vault-name your-keyvault-name
   
   # Try to set a test secret (to test write access)
   az keyvault secret set --vault-name your-keyvault-name --name test-secret --value test-value
   ```

3. **Check Key Vault permissions**:
   ```bash
   # Get your current user's Object ID
   USER_OBJECT_ID=$(az ad signed-in-user show --query id -o tsv)
   
   # For managed identity, get the VM's Object ID
   VM_OBJECT_ID=$(az vm identity show --resource-group your-resource-group --name your-vm-name --query principalId -o tsv)
   
   # Check access policies
   az keyvault show --name your-keyvault-name --query properties.accessPolicies
   ```

4. **Grant necessary permissions**:
   ```bash
   # For your user account
   az keyvault set-policy --name your-keyvault-name --object-id $USER_OBJECT_ID --secret-permissions get set list
   
   # For managed identity
   az keyvault set-policy --name your-keyvault-name --object-id $VM_OBJECT_ID --secret-permissions get set list
   ```

### Configuration Issues

If authentication is working but you're still having issues:

1. **Enable Azure debugging**:
   ```bash
   export AZURE_DEBUG=true
   ```

2. **Verify secret names**:
   - Make sure the secret names in your `secret_mapping` match exactly with the names in Azure Key Vault
   - Secret names are case-sensitive

3. **Check Key Vault URL**:
   - Ensure the Key Vault URL is correct and includes the protocol (https://)
   - The format should be: `https://your-keyvault-name.vault.azure.net/`

4. **Verify secret values**:
   - Check that the secrets exist in Key Vault with the expected names
   ```bash
   az keyvault secret show --vault-name your-keyvault-name --name tgfs-api-id
   ```

### Docker-specific Issues

When running in Docker:

1. **Mount Azure credentials**:
   ```bash
   # Create Azure credentials file
   az login
   
   # Mount the credentials into the container
   docker run -v ~/.azure:/root/.azure -v /path/to/config-azure.yaml:/config.yaml -p 1900:1900 -p 1901:1901 tgfs -f /config.yaml
   ```

2. **Use environment variables**:
   ```bash
   docker run -e AZURE_CLIENT_ID=your-client-id -e AZURE_CLIENT_SECRET=your-client-secret -e AZURE_TENANT_ID=your-tenant-id -v /path/to/config-azure.yaml:/config.yaml -p 1900:1900 -p 1901:1901 tgfs -f /config.yaml
   ```

## Local Development

For local development or when running outside of Azure:

1. Set `azure.key_vault.enabled` to `false` to use values directly from the config file, or
2. Use Azure CLI to authenticate (`az login`) before running TGFS, or
3. Use environment variables for Azure authentication:

```bash
export AZURE_CLIENT_ID=your-client-id
export AZURE_CLIENT_SECRET=your-client-secret
export AZURE_TENANT_ID=your-tenant-id
```

## Common Error Messages and Solutions

Here are some common error messages you might encounter and how to resolve them:

### "Failed to initialize Azure Key Vault client"

This usually means there's an issue with authentication or the Key Vault URL.

**Solutions**:
- Verify the Key Vault URL is correct
- Check that you're authenticated with Azure (`az login`)
- Ensure you have the necessary permissions on the Key Vault

### "Failed to upload secrets to Azure Key Vault: Unauthorized"

This means your account doesn't have permission to set secrets in the Key Vault.

**Solutions**:
- Grant your account "Set" permissions on the Key Vault:
  ```bash
  USER_OBJECT_ID=$(az ad signed-in-user show --query id -o tsv)
  az keyvault set-policy --name your-keyvault-name --object-id $USER_OBJECT_ID --secret-permissions get set list
  ```

### "Failed to retrieve secret: Secret not found"

This means the secret with the specified name doesn't exist in the Key Vault.

**Solutions**:
- Verify the secret exists in the Key Vault:
  ```bash
  az keyvault secret list --vault-name your-keyvault-name
  ```
- Create the missing secret:
  ```bash
  az keyvault secret set --vault-name your-keyvault-name --name missing-secret-name --value "secret-value"
  ```

### "DefaultAzureCredential authentication failed"

This means none of the authentication methods in the DefaultAzureCredential chain succeeded.

**Solutions**:
- For local development, run `az login`
- For Azure VMs, ensure the VM has a managed identity
- Set environment variables for service principal authentication:
  ```bash
  export AZURE_CLIENT_ID=your-client-id
  export AZURE_CLIENT_SECRET=your-client-secret
  export AZURE_TENANT_ID=your-tenant-id
  ```