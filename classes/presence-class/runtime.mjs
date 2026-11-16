import assert from 'node:assert/strict';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { registerHooks } from 'node:module';

// Stylesheets are evaluated by the browser; local checks exercise the exported models.
registerHooks({ load(url, context, next) {
  if (url.endsWith('.css')) return { format: 'module', source: 'export {};', shortCircuit: true };
  return next(url, context);
} });

export { assert };
export const manifest = JSON.parse(readFileSync(process.env.AEPM_CANDIDATE_MANIFEST, 'utf8'));
const root = realpathSync(process.env.AEPM_CANDIDATE_ROOT);
const modules = JSON.parse(process.env.AEPM_MODULE_MAP);
assert.match(process.env.AEPM_CANDIDATE_DIGEST, /^[a-f0-9]{64}$/);
assert.match(process.env.AEPM_CLASS_DIGEST, /^[a-f0-9]{64}$/);
const prefix = `components/${manifest.identity.name.split('/')[1]}/`;
export function source(path) {
  const candidate = modules[prefix + path];
  assert.equal(typeof candidate, 'string', `missing installed module ${path}`);
  const actual = realpathSync(candidate);
  assert.ok(actual.startsWith(root + sep), `module outside candidate: ${path}`);
  assert.ok(statSync(actual).isFile());
  return actual;
}
export const load = async (path) => import(pathToFileURL(source(path)).href);
export const data = (path) => JSON.parse(readFileSync(source(path), 'utf8'));
