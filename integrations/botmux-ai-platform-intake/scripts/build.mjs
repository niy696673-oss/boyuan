import {
  copyFileSync, cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = dirname(scriptsDir);
const sourceRoot = join(packageRoot, 'src');
const outputRoot = join(packageRoot, 'dist');

function assertNoSymlinks(path) {
  if (!existsSync(path)) return;
  const stat = lstatSync(path);
  if (stat.isSymbolicLink()) throw new Error(`plugin build does not allow symlinks: ${path}`);
  if (stat.isDirectory()) for (const name of readdirSync(path)) assertNoSymlinks(join(path, name));
}

async function bundle(source, output) {
  mkdirSync(dirname(output), { recursive: true });
  await build({
    entryPoints: [source], outfile: output, bundle: true, treeShaking: true,
    platform: 'node', format: 'esm', target: 'node22', packages: 'bundle', logLevel: 'silent',
    banner: { js: "import { createRequire as __boyuanCreateRequire } from 'node:module'; import { fileURLToPath as __boyuanFileURLToPath } from 'node:url'; import { dirname as __boyuanDirname } from 'node:path'; const require = __boyuanCreateRequire(import.meta.url); const __filename = __boyuanFileURLToPath(import.meta.url); const __dirname = __boyuanDirname(__filename);" },
  });
}

rmSync(outputRoot, { recursive: true, force: true });
mkdirSync(outputRoot, { recursive: true });
writeFileSync(join(outputRoot, 'package.json'), `${JSON.stringify({ private: true, type: 'module' }, null, 2)}\n`);
await Promise.all([
  bundle(join(sourceRoot, 'index.ts'), join(outputRoot, 'index.js')),
  bundle(join(sourceRoot, 'cli', 'index.ts'), join(outputRoot, 'cli', 'index.js')),
  bundle(join(sourceRoot, 'service', 'index.ts'), join(outputRoot, 'service', 'index.js')),
  bundle(join(sourceRoot, 'service', 'server.ts'), join(outputRoot, 'service', 'server.js')),
  bundle(join(sourceRoot, 'service', 'wecom-server.ts'), join(outputRoot, 'service', 'wecom-server.js')),
  bundle(join(sourceRoot, 'service', 'wechat-kf-server.ts'), join(outputRoot, 'service', 'wechat-kf-server.js')),
]);
const cliModule = await import(`${pathToFileURL(join(outputRoot, 'cli', 'index.js')).href}?t=${Date.now()}`);
const commands = Object.entries(cliModule.default).map(([name, handler]) => ({
  name,
  ...(typeof handler.description === 'string' ? { description: handler.description } : {}),
})).sort((a, b) => a.name.localeCompare(b.name));
writeFileSync(join(outputRoot, 'cli', 'commands.json'), `${JSON.stringify({ schemaVersion: 1, commands }, null, 2)}\n`);
copyFileSync(join(packageRoot, 'README.md'), join(outputRoot, 'README.md'));
copyFileSync(join(packageRoot, 'wecom.config.example.json'), join(outputRoot, 'wecom.config.example.json'));
copyFileSync(join(packageRoot, 'wechat-kf.config.example.json'), join(outputRoot, 'wechat-kf.config.example.json'));
cpSync(join(packageRoot, 'skills'), join(outputRoot, 'skills'), { recursive: true });
const rootPackage = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));
writeFileSync(join(outputRoot, 'manifest-snapshot.json'), `${JSON.stringify({
  name: rootPackage.name, version: rootPackage.version, botmux: rootPackage.botmux,
}, null, 2)}\n`);
assertNoSymlinks(outputRoot);
