import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import YAML from 'yaml';
import { openApiDocument } from './openapi.js';

const dir = path.dirname(fileURLToPath(import.meta.url));

describe('openapi.yaml freshness', () => {
  it('matches openApiDocument', () => {
    const onDisk = YAML.parse(readFileSync(path.join(dir, '../openapi.yaml'), 'utf8'));
    expect(onDisk).toEqual(openApiDocument);
  });
});
