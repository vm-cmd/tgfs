import { PathLike, existsSync } from 'fs';

import { Client } from '../client';
import { navigateToDir } from './navigate-to-dir';
import { splitPath } from './utils';

export const createEmptyFile = (client: Client) => async (path: PathLike) => {
  let [basePath, name] = splitPath(path);

  const dir = await navigateToDir(client)(basePath);

  if (!existsSync(path)) {
    return await client.putFileUnder(name, dir, Buffer.from(''));
  }
};
