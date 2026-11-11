import { readFile, access } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
export async function checkRelease(directory) {
  const release = JSON.parse(await readFile(join(directory, 'release.json'), 'utf8'));
  if (release.format !== 'tuxos-release' || release.version !== 1 || release.saveSchema !== 2 || !release.readsSaveSchemas?.includes(2) || release.accountDowngradeProtection !== true) {
    throw new Error('This release cannot safely read and protect continuation saves (schema 2).');
  }
  await access(join(directory,'web/index.html'));
  await access(join(directory,'api/src/server.ts'));
  return release;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { await checkRelease(process.argv[2]); }
  catch (error) { console.error(`Release compatibility check failed: ${error.message}. Keep the current deployment and use a verified schema-2 recovery release.`); process.exitCode=1; }
}
