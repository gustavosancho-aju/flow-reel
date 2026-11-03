import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
test('modo teste percorre ambas as publicações sem usar fetch real ou credenciais', t => {
  const p=mkdtempSync(join(tmpdir(),'flow-publicacao-')); t.after(()=>rmSync(p,{recursive:true,force:true}));
  const texto=join(p,'post.txt'),video=join(p,'video.mp4'), bloqueio=join(p,'sem-rede.mjs');
  writeFileSync(texto,'Teste local');writeFileSync(video,'fixture de upload');
  writeFileSync(bloqueio,"globalThis.fetch=()=>{throw new Error('REDE PROIBIDA')};");
  for(const rede of ['instagram','linkedin']) {
    const args=rede==='instagram'?['https://example.invalid/video.mp4','https://example.invalid/capa.jpg',texto]:[video,texto,'Teste'];
    const r=spawnSync(process.execPath,['--import',pathToFileURL(bloqueio).href,fileURLToPath(new URL(`../scripts/publicar-${rede}${rede==='linkedin'?'-video':''}.mjs`,import.meta.url)),...args,'--teste'],{encoding:'utf8'});
    assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/SIMULADO/);assert.ok(!r.stdout.includes('PUBLICADO:'));
    const rel=JSON.parse(readFileSync(`${texto}.${rede}-teste.json`));
    assert.equal(rel.publicadoNaRede,false);assert.equal(rel.eventos.length,rede==='instagram'?4:5);
    assert.ok(!JSON.stringify(rel).includes('token-teste'));
  }
});
