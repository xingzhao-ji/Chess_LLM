import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve('dist');
const check = (file, reference) => {
  const resolved = path.resolve(path.dirname(file), reference);
  assert.ok(resolved.startsWith(root + path.sep), `Asset escaped the public root: ${reference}`);
  assert.ok(fs.existsSync(resolved), `Missing asset: ${resolved}`);
};
for (const name of fs.readdirSync(root)) {
  const file = path.join(root, name); if (!fs.statSync(file).isFile()) continue;
  const text = fs.readFileSync(file, 'utf8');
  const refs = [...text.matchAll(/(?:src|href)="(\.\/[^"?#]+)"/g),
    ...text.matchAll(/url\(['"]?(\.\/[^)'"?#]+)['"]?\)/g),
    ...text.matchAll(/from\s+['"](\.\/[^'"]+)['"]/g)];
  for (const match of refs) check(file, match[1]);
}
for (const name of ['vale', 'ivory', 'obsidian']) {
  const bytes = fs.readFileSync(path.join(root, 'assets', name + '.webp'));
  assert.equal(bytes.subarray(0, 4).toString(), 'RIFF');
  assert.equal(bytes.subarray(8, 12).toString(), 'WEBP');
  assert.ok(bytes.length > 10000 && bytes.length < 1500000);
}
const atlas = JSON.parse(fs.readFileSync(path.join(root, 'assets/sprites.json')));
for (const color of ['w', 'b']) for (const type of 'rnbqkp') {
  const p = atlas[color][type];
  assert.ok(p.x >= 0 && p.y >= 0 && p.x + p.w <= 1536 && p.y + p.h <= 1024, `Invalid ${color}${type} crop`);
  assert.ok(p.anchorX > 0 && p.anchorX < p.w && p.baseWidth > 0);
}
console.log('All imports, local assets, image encodings, and 12 sprite bounds validated.');
