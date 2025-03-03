#!/usr/bin/env node
import express from 'express';
import fs from 'fs';
import http from 'http';
import https from 'https';

import { exit } from 'process';
import { v2 as webdav } from 'webdav-server';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

import { createClient } from './api';
import { Executor } from './commands/executor';
import { parser } from './commands/parser';
import { config, createConfig, loadConfig } from './config';
import { BusinessError } from './errors/base';
import { managerServer, startBot } from './server/manager';
import { webdavServer } from './server/webdav';
import { getIPAddress } from './utils/ip-address';
import { Logger } from './utils/logger';

const { argv }: any = yargs(hideBin(process.argv))
  .option('config', {
    alias: 'f',
    describe: 'config file path',
    type: 'string',
    default: './config.yaml',
  })
  .option('webdav', {
    alias: 'w',
    describe: 'start webdav server',
    type: 'boolean',
    default: false,
  })
  .command('cmd *', 'run command', parser);

(async () => {
  let configPath = argv.config;
  if (!fs.existsSync(configPath)) {
    configPath = await createConfig();
  }

  try {
    await loadConfig(configPath);
  } catch (err) {
    Logger.debug(err);
    configPath = await createConfig();
    await loadConfig(configPath);
  }

  const client = await createClient();

  // runSync();

  const startServer = (
    name: string,
    app: (req: any, res: any, next: any) => void,
    host: string,
    port: number,
    path: string,
    httpsConfig?: {
      enabled: boolean;
      cert: string;
      key: string;
    }
  ) => {
    const masterApp = express();
    masterApp.use(path, app);
    
    let server;
    let protocol = 'http';
    
    if (httpsConfig?.enabled) {
      try {
        let certData: string | Buffer = httpsConfig.cert;
        let keyData: string | Buffer = httpsConfig.key;
        
        // Check if the cert/key are file paths or actual PEM content
        if (certData.includes('-----BEGIN CERTIFICATE-----')) {
          // It's PEM content, use directly
          Logger.info(`Using in-memory certificate for ${name}`);
        } else if (fs.existsSync(certData)) {
          // It's a file path, read the file
          certData = fs.readFileSync(certData);
          Logger.info(`Using certificate file for ${name}: ${httpsConfig.cert}`);
        } else {
          throw new Error(`Certificate not found: ${httpsConfig.cert}`);
        }
        
        if (keyData.includes('-----BEGIN PRIVATE KEY-----')) {
          // It's PEM content, use directly
          Logger.info(`Using in-memory private key for ${name}`);
        } else if (fs.existsSync(keyData)) {
          // It's a file path, read the file
          keyData = fs.readFileSync(keyData);
          Logger.info(`Using private key file for ${name}: ${httpsConfig.key}`);
        } else {
          throw new Error(`Private key not found: ${httpsConfig.key}`);
        }
        
        const options = {
          cert: certData,
          key: keyData
        };
        
        server = https.createServer(options, masterApp);
        protocol = 'https';
        Logger.info(`${name} using HTTPS`);
      } catch (error) {
        Logger.error(`Failed to set up HTTPS for ${name}: ${error.message}`);
        Logger.warn(`Falling back to HTTP for ${name}`);
        server = http.createServer(masterApp);
      }
    } else {
      server = http.createServer(masterApp);
    }
    
    server.listen(port, host);

    let addresses = [`${protocol}://${host}:${port}${path}`];

    if (host === '0.0.0.0' || host === '::') {
      addresses = getIPAddress('IPv4').map((ip) => `${protocol}://${ip}:${port}${path}`);
    }
    Logger.info(`${name} is running on ${addresses.join(', ')}`);
  };

  if (argv.webdav) {
    const server = webdavServer(client);
    startServer(
      'WebDAV',
      webdav.extensions.express('/', server),
      config.webdav.host,
      config.webdav.port,
      config.webdav.path,
      config.webdav.https
    );
  } else if (argv._[0] === 'cmd') {
    argv._.shift();
    try {
      const executor = new Executor(client);
      await executor.execute(argv);
    } catch (err) {
      if (err instanceof BusinessError) {
        Logger.error(err);
      } else {
        console.error(`err\n${err.stack}`);
      }
    } finally {
      exit(0);
    }
  }

  startServer(
    'Manager',
    managerServer,
    config.manager.host,
    config.manager.port,
    config.manager.path,
    config.manager.https
  );

  startBot();
})();