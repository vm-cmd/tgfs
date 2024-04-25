import * as fs from 'fs';

import yargs from 'yargs/yargs';

import { Client } from 'src/api';
import { createDir, list, uploadFromBytes } from 'src/api/ops';
import { Executor } from 'src/commands/executor';
import { parser } from 'src/commands/parser';
import { TGFSDirectory } from 'src/model/directory';

import { createMockClient } from '../utils/mock-tg-client';

const parse = () => {
  const argv = parser(yargs(process.argv)).argv;
  return argv;
};

const getExecutor = (client: Client) => {
  return new Executor(client);
};

describe('commands', () => {
  beforeAll(() => {
    console.log = jest.fn();
    console.info = jest.fn();
  });

  describe('ls', () => {
    it('should list files and directories', async () => {
      const client = await createMockClient();
      const executor = getExecutor(client);

      await uploadFromBytes(client)(Buffer.from(''), '/f1');
      await createDir(client)('/d1', false);

      jest.replaceProperty(process, 'argv', ['ls', '/']);
      await executor.execute(parse());
      expect(console.log).toHaveBeenCalledWith('d1  f1');
    });

    it('should display file info', async () => {
      const client = await createMockClient();
      const executor = getExecutor(client);

      await uploadFromBytes(client)(Buffer.from(''), '/f1');
      jest.replaceProperty(process, 'argv', ['ls', '/f1']);
      await executor.execute(parse());

      const fr = client.getRootDirectory().findFiles(['f1'])[0];
      const fd = await client.getFileDesc(fr);

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining(fd.latestVersionId),
      );
    });

    it('should throw an error if path does not exist', async () => {
      const client = await createMockClient();
      const executor = getExecutor(client);

      jest.replaceProperty(process, 'argv', ['ls', '/not-exist']);
      expect(executor.execute(parse())).rejects.toThrow();
    });
  });

  describe('mkdir', () => {
    it('should create a directory', async () => {
      const client = await createMockClient();
      const executor = getExecutor(client);

      jest.replaceProperty(process, 'argv', ['mkdir', '/d1']);
      await executor.execute(parse());

      const d1 = (await list(client)('/'))[0];
      expect(d1.name).toEqual('d1');
    });

    it('should create a directory recursively', async () => {
      const client = await createMockClient();
      const executor = getExecutor(client);

      jest.replaceProperty(process, 'argv', ['mkdir', '/d1/d2/d3', '-p']);
      await executor.execute(parse());

      const d3 = ((await list(client)('/d1/d2')) as Array<TGFSDirectory>)[0];

      expect(d3.name).toEqual('d3');
    });

    it('should create a directory recursively under an existing path', async () => {
      const client = await createMockClient();
      const executor = getExecutor(client);

      jest.replaceProperty(process, 'argv', ['mkdir', '/d1/d2', '-p']);
      await executor.execute(parse());

      jest.replaceProperty(process, 'argv', ['mkdir', '/d1/d2/d3', '-p']);
      await executor.execute(parse());

      const d3 = ((await list(client)('/d1/d2')) as Array<TGFSDirectory>)[0];

      expect(d3.name).toEqual('d3');
    });

    it('should throw an error if path already exists', async () => {
      const client = await createMockClient();
      const executor = getExecutor(client);

      jest.replaceProperty(process, 'argv', ['mkdir', '/d1']);
      await executor.execute(parse());

      jest.replaceProperty(process, 'argv', ['mkdir', '/d1']);
      await expect(executor.execute(parse())).rejects.toThrow();
    });

    it('should throw an error if the path does not start with /', async () => {
      const client = await createMockClient();
      const executor = getExecutor(client);

      jest.replaceProperty(process, 'argv', ['mkdir', 'd1']);
      await expect(executor.execute(parse())).rejects.toThrow();
    });
  });

  describe('cp', () => {
    it('should upload a file from local', async () => {
      const client = await createMockClient();
      const executor = getExecutor(client);

      const fileName = `${Math.random()}.txt`;

      fs.writeFileSync(fileName, 'mock-file-content');
      jest.replaceProperty(process, 'argv', ['cp', fileName, '/f1']);
      await executor.execute(parse());

      const f1 = client.getRootDirectory().findFiles(['f1'])[0];
      expect(f1.name).toEqual('f1');

      fs.rmSync(fileName);
    });

    it('should throw an error if file does not exist', async () => {
      const client = await createMockClient();
      const executor = getExecutor(client);

      jest.replaceProperty(process, 'argv', ['cp', 'not-exist', '/f1']);
      expect(executor.execute(parse())).rejects.toThrow();
    });
  });

  describe('rm', () => {
    it('should remove a file', async () => {
      const client = await createMockClient();
      const executor = getExecutor(client);

      await client.uploadFile(
        { under: client.getRootDirectory() },
        { name: 'f1', buffer: Buffer.from('content') },
      );

      jest.replaceProperty(process, 'argv', ['rm', '/f1']);
      await executor.execute(parse());

      expect(client.getRootDirectory().findFiles(['f1']).length).toEqual(0);
    });

    it('should remove a directory', async () => {
      const client = await createMockClient();
      const executor = getExecutor(client);

      await client.createDirectory({
        name: 'd1',
        under: client.getRootDirectory(),
      });

      jest.replaceProperty(process, 'argv', ['rm', '/d1']);
      await executor.execute(parse());

      expect(client.getRootDirectory().findChildren(['d1']).length).toEqual(0);
    });

    it('should throw an error if path does not exist', async () => {
      const client = await createMockClient();
      const executor = getExecutor(client);

      jest.replaceProperty(process, 'argv', ['rm', '/not-exist']);
      expect(executor.execute(parse())).rejects.toThrowError();
    });

    it('should throw an error if trying to remove a directory that is not empty', async () => {
      const client = await createMockClient();
      const executor = getExecutor(client);

      const d1 = await client.createDirectory({
        name: 'd1',
        under: client.getRootDirectory(),
      });
      await client.uploadFile(
        { under: d1 },
        { name: 'f1', buffer: Buffer.from('content') },
      );

      jest.replaceProperty(process, 'argv', ['rm', '/d1']);
      expect(executor.execute(parse())).rejects.toThrowError();
    });

    it('should remove a directory recursively', async () => {
      const client = await createMockClient();
      const executor = getExecutor(client);

      jest.replaceProperty(process, 'argv', ['mkdir', '/d1/d2/d3', '-p']);
      await executor.execute(parse());

      jest.replaceProperty(process, 'argv', ['rm', '/d1', '-r']);
      await executor.execute(parse());

      expect(client.getRootDirectory().findChildren(['d1']).length).toEqual(0);
    });
  });

  describe('touch', () => {
    it('should create a file', async () => {
      const client = await createMockClient();
      const executor = getExecutor(client);

      jest.replaceProperty(process, 'argv', ['touch', '/f1']);
      await executor.execute(parse());

      const f1 = client.getRootDirectory().findFiles(['f1'])[0];
      expect(f1.name).toEqual('f1');
    });
  });
});
