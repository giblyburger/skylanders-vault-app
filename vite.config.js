import { cp, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { cloudflare } from '@cloudflare/vite-plugin';
import { defineConfig } from 'vite';

const ROOT = process.cwd();

function preserveStaticVault() {
  return {
    name: 'preserve-static-vault',
    apply: 'build',
    async closeBundle() {
      const client = resolve(ROOT, 'dist', 'client');
      const server = resolve(ROOT, 'dist', 'server');
      const worker = resolve(ROOT, 'dist', 'gibly_skylanders_master_vault', 'index.js');
      await rm(client, { recursive: true, force: true });
      await mkdir(client, { recursive: true });
      for (const directory of ['assets', 'public', 'src']) {
        await cp(resolve(ROOT, directory), resolve(client, directory), { recursive: true });
      }
      for (const file of ['index.html', 'manifest.webmanifest', 'sw.js']) {
        await cp(resolve(ROOT, file), resolve(client, file));
      }
      await mkdir(server, { recursive: true });
      await cp(worker, resolve(server, 'index.js'));
    }
  };
}

export default defineConfig({
  plugins: [cloudflare(), preserveStaticVault()]
});
