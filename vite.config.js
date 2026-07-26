import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { cloudflare } from '@cloudflare/vite-plugin';
import { defineConfig, transformWithOxc } from 'vite';

const ROOT = process.cwd();

async function transpileForOlderSafari(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  await Promise.all(entries.map(async (entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return transpileForOlderSafari(path);
    if (!entry.name.endsWith('.js')) return;
    const source = await readFile(path, 'utf8');
    const result = await transformWithOxc(source, path, {
      loader: 'js',
      format: 'esm',
      target: 'safari12',
      minify: false
    });
    await writeFile(path, result.code);
  }));
}

function preserveStaticVault() {
  return {
    name: 'preserve-static-vault',
    apply: 'build',
    async closeBundle() {
      const dist = resolve(ROOT, 'dist');
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
      await transpileForOlderSafari(resolve(client, 'src'));
      await mkdir(server, { recursive: true });
      await cp(worker, resolve(server, 'index.js'));
      await mkdir(resolve(dist, '.openai'), { recursive: true });
      await cp(resolve(ROOT, '.openai', 'hosting.json'), resolve(dist, '.openai', 'hosting.json'));
    }
  };
}

export default defineConfig({
  plugins: [cloudflare(), preserveStaticVault()]
});
