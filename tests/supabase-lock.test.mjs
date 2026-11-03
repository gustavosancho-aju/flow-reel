import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, utimesSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { adquirirTrava } from '../scripts/lib/supabase-auth.mjs';
function fixture(t) { const p=mkdtempSync(join(tmpdir(),'flow-lock-'));t.after(()=>rmSync(p,{recursive:true,force:true}));return join(p,'session.lock'); }
test('recupera trava antiga, inclusive formato legado vazio', t => {
  const p=fixture(t); writeFileSync(p,''); const antigo=new Date(Date.now()-301000);utimesSync(p,antigo,antigo);
  const trava=adquirirTrava(p);assert.equal(trava.conferir(),true);trava.liberar();assert.equal(existsSync(p),false);
});
test('recupera processo morto imediatamente e preserva dono vivo', t => {
  const p=fixture(t);writeFileSync(p,JSON.stringify({pid:12345,id:'morto'}));
  const trava=adquirirTrava(p,{existe:()=>false});
  assert.throws(()=>adquirirTrava(p,{existe:()=>true}),/em andamento/);trava.liberar();
});
test('não apaga trava de outro dono na liberação tardia', t => {
  const p=fixture(t), antiga=adquirirTrava(p);
  writeFileSync(p,JSON.stringify({pid:process.pid,id:'outro'}));
  assert.equal(antiga.conferir(),false);antiga.liberar();
  assert.equal(JSON.parse(readFileSync(p)).id,'outro');
});
test('trava recém-criada incompleta não é considerada abandonada', t => {
  const p=fixture(t);writeFileSync(p,'');assert.throws(()=>adquirirTrava(p),/em andamento/);
});
