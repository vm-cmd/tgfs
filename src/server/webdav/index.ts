import { SimpleUserManager, v2 as webdav } from 'webdav-server';
import { PhysicalFileSystem } from 'webdav-server/lib/index.v2';

import { loginAsBot } from '../../auth';
import { TGFSFileSystem } from './tgfs-filesystem';

(async () => {
  const server = new webdav.WebDAVServer();

  const client = await loginAsBot();
  await client.init();

  server.httpAuthentication = new webdav.HTTPBasicAuthentication({
    getUserByNamePassword: (username, password, cb) => {
      cb(null, { uid: username, username });
    },
    getDefaultUser(cb) {
      cb(null);
    },
  });
  server.setFileSystemSync('/', new TGFSFileSystem(client));
  // server.setFileSystemSync(
  //   '/',
  //   new PhysicalFileSystem('/home/theodore/repos/tgfs/data'),
  // );
  server.start((httpServer) => {
    console.log(
      'Server started with success on the port : ' +
        (httpServer.address() as any).port,
    );
  });
})();
