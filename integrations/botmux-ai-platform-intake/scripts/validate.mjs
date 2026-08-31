import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const distRoot = join(packageRoot, 'dist');
function fail(message) { throw new Error(message); }
function assertNoSymlinks(path) {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink()) fail(`plugin dist must not contain symlinks: ${path}`);
  if (stat.isDirectory()) for (const name of readdirSync(path)) assertNoSymlinks(join(path, name));
}
const pkg = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));
if (!pkg.keywords?.includes('botmux-plugin')) fail('package.json must include botmux-plugin keyword');
if (pkg.botmux?.schemaVersion !== 1 || pkg.botmux?.id !== 'ai-platform-intake') fail('invalid BotMux manifest');
if (pkg.botmux?.service?.mode !== 'auto') fail('service mode must be auto');
for (const file of [
  'package.json', 'index.js', 'cli/index.js', 'cli/commands.json', 'service/index.js', 'service/server.js',
  'service/wecom-server.js',
  'wecom.config.example.json',
  'skills/ai-platform-intake/SKILL.md',
]) if (!existsSync(join(distRoot, file))) fail(`missing dist/${file}`);
assertNoSymlinks(distRoot);
await import(`${pathToFileURL(join(distRoot, 'index.js')).href}?t=${Date.now()}`);
const definition = (await import(`${pathToFileURL(join(distRoot, 'service', 'index.js')).href}?t=${Date.now()}`)).default({
  config: { path: '/isolated/plugin/config.json', get: (key) => key === 'servicePort' ? 9471 : undefined },
});
if (definition.mode !== 'auto' || definition.pm2?.script !== './service/server.js') fail('invalid service definition');
if (definition.pm2?.env?.BOTMUX_AI_PLATFORM_INTAKE_CONFIG_PATH !== '/isolated/plugin/config.json') fail('config path not wired');
if (definition.port !== 9471 || definition.pm2?.env?.PORT !== '9471') fail('service port not wired');
const commands = JSON.parse(readFileSync(join(distRoot, 'cli', 'commands.json'), 'utf8'));
const expected = ['ai-platform-intake:config-check', 'ai-platform-intake:configure'];
if (commands.schemaVersion !== 1 || JSON.stringify(commands.commands?.map((item) => item.name)) !== JSON.stringify(expected)) {
  fail('invalid CLI command index');
}
console.log('BotMux ai-platform-intake manifest validation passed');
