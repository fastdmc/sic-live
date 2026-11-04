import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { openApiDocument } from '../src/openapi.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(dir, '../openapi.yaml');
writeFileSync(out, YAML.stringify(openApiDocument));
console.log(`Wrote ${out}`);
