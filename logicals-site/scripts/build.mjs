import { build as buildWorker } from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build as buildClient } from 'vite';

const projectRoot = resolve(import.meta.dirname, '..');
const distRoot = resolve(projectRoot, 'dist');

await rm(distRoot, { recursive: true, force: true });
await mkdir(resolve(distRoot, 'server'), { recursive: true });
await mkdir(resolve(distRoot, '.openai'), { recursive: true });

await buildClient({ configFile: resolve(projectRoot, 'vite.config.ts') });
await cp(
  resolve(projectRoot, 'client/playLogic.js'),
  resolve(distRoot, 'client/playLogic.js'),
);
await buildWorker({
  entryPoints: [resolve(projectRoot, 'worker/index.ts')],
  outfile: resolve(distRoot, 'server/index.js'),
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
});

await cp(
  resolve(projectRoot, '.openai/hosting.json'),
  resolve(distRoot, '.openai/hosting.json'),
);

try {
  await cp(resolve(projectRoot, 'drizzle'), resolve(distRoot, '.openai/drizzle'), {
    recursive: true,
  });
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}
