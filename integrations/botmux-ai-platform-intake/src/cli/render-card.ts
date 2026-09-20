import { readFileSync } from 'node:fs';
import { renderApiResult } from '../render-card.js';

try {
  process.stdout.write(`${JSON.stringify(renderApiResult(JSON.parse(readFileSync(0, 'utf8'))))}\n`);
} catch {
  process.stderr.write('Cannot render card: invalid kind or incomplete platform result.\n');
  process.exitCode = 1;
}
