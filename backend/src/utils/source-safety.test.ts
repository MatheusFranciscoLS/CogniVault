import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import test from 'node:test';

const sourceRoot = join(process.cwd(), 'src');

function runtimeTypeScriptFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...runtimeTypeScriptFiles(fullPath));
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith('.ts') || entry.name.endsWith('.test.ts')) continue;
    files.push(fullPath);
  }
  return files;
}

test('backend runtime source does not use unsafe raw SQL or disable TLS verification', () => {
  const forbidden: Array<{ label: string; pattern: RegExp }> = [
    { label: 'Prisma $queryRawUnsafe', pattern: /\$queryRawUnsafe\b/ },
    { label: 'Prisma $executeRawUnsafe', pattern: /\$executeRawUnsafe\b/ },
    { label: 'NODE_TLS_REJECT_UNAUTHORIZED override', pattern: /NODE_TLS_REJECT_UNAUTHORIZED/ },
    { label: 'TLS rejectUnauthorized=false', pattern: /rejectUnauthorized\s*:\s*false/ },
  ];

  const violations: string[] = [];
  for (const file of runtimeTypeScriptFiles(sourceRoot)) {
    const source = readFileSync(file, 'utf8');
    for (const rule of forbidden) {
      if (rule.pattern.test(source)) {
        violations.push(`${relative(sourceRoot, file)}: ${rule.label}`);
      }
    }
  }

  assert.deepEqual(violations, [], `Unsafe backend source patterns found:\n${violations.join('\n')}`);
});
