import { v2 as webdav } from 'webdav-server';

import { Client } from '../../api';
import { config } from '../../config';
import { TGFSFileSystem } from './tgfs-filesystem';

export const runWebDAVServer = async (
  client: Client,
  options?: webdav.WebDAVServerOptions,
) => {
  const server = new webdav.WebDAVServer(options);

  server.httpAuthentication = new webdav.HTTPBasicAuthentication({
    getUserByNamePassword: (username, password, cb) => {
      const user = config.webdav.users[username];
      if (user && user.password === password) {
        cb(null, { uid: username, username });
      } else {
        cb(webdav.Errors.UserNotFound);
      }
    },
    getDefaultUser(cb) {
      cb(null);
    },
  });
  server.setFileSystemSync('/', new TGFSFileSystem(client));
  server.start((httpServer) => {
    const address = httpServer.address() as any;
    console.info(
      `WebDAV server is running on ${address.address}:${address.port}`,
    );
  });
};
