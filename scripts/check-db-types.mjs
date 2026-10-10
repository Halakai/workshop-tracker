// CI check: are the committed database types (generated from the real project) in sync with the migrations
// (types generated from a local database built from supabase/migrations)?
// The remote and local generators differ in formatting and a few version-specific lines, so both files
// are normalised before comparing.
//   node scripts/check-db-types.mjs <committed.ts> <generated-from-local.ts>
import { readFileSync } from 'node:fs';
import { format } from 'prettier';

async function normalise(path) {
  let src = await format(readFileSync(path, 'utf8'), { parser: 'typescript' });
  // only emitted by the remote generator
  src = src.replace(/^\s*\/\/ Allows to automatically.*\n\s*\/\/ instead of createClient.*\n\s*__InternalSupabase: \{\n[^}]*\};\n/m, '');
  // only emitted by the local generator
  src = src.replace(/^\s*ComputedFields: never;\n/gm, '');
  // the local generator marks NOT NULL json columns, the remote one doesn't
  src = src.replace(/NonNullable<Json>/g, 'Json');
  // functions without arguments: "Args: never" (remote) vs "Args: Record<PropertyKey, never>" (local)
  src = src.replace(/Args: Record<PropertyKey, never>/g, 'Args: never');
  return src.split('\n');
}

const [committedPath, localPath] = process.argv.slice(2);
const committed = await normalise(committedPath);
const local = await normalise(localPath);

const firstDiff = committed.findIndex((line, i) => line !== local[i]);
if (firstDiff === -1 && committed.length === local.length) {
  console.log('Database types are in sync with the migrations.');
} else {
  const at = firstDiff === -1 ? Math.min(committed.length, local.length) : firstDiff;
  console.error(`Database types are out of date (first difference at normalised line ${at + 1}):`);
  console.error(`  committed: ${committed[at] ?? '<end of file>'}`);
  console.error(`  migrations: ${local[at] ?? '<end of file>'}`);
  console.error('Run `npm run db:push` and `npm run db:types`, then commit src/lib/database.types.ts.');
  process.exit(1);
}
