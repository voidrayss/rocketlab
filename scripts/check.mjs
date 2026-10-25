import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
for (const f of readdirSync('scripts').filter(f => /^smoke.*\.mjs$/.test(f))) {
  const r = spawnSync(process.execPath, ['scripts/' + f], {encoding:'utf8'});
  console.log(`${f}: ${r.status === 0 ? 'PASS' : 'FAIL'}`);
  if (r.status !== 0) { console.error(r.stdout, r.stderr); process.exit(1); }
}
for (const dir of ['js', 'js/onshape', 'js/cad'].filter(d => { try { readdirSync(d); return true; } catch { return false; } })) {
  for (const f of readdirSync(dir).filter(f => f.endsWith('.js'))) {
    const r = spawnSync(process.execPath, ['--check', dir + '/' + f], {encoding:'utf8'});
    if (r.status !== 0) { console.error(r.stderr); process.exit(1); }
  }
}
console.log('PASS: JavaScript syntax');
