import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { templateGravado, destaques, renderizarMotions } from '../scripts/lib/motions-gravado.mjs';
const estilo = JSON.parse(readFileSync(new URL('../perfil/estilo.exemplo.json',import.meta.url)));
for (const formato of ['9:16','16:9']) test(`motions ${formato}: duração real, mídia local, texto seguro e timeline animada`, () => {
  const html = templateGravado({ formato, duracao:7.25, palavras:[{texto:'</script><img>',inicio:1,fim:2}], estilo });
  assert.ok(html.includes('data-duration="7.25"'));
  assert.ok(html.includes(formato==='9:16' ? 'data-width="1080" data-height="1920"' : 'data-width="1920" data-height="1080"'));
  assert.ok(html.includes('&lt;/script&gt;&lt;img&gt;'));
  assert.ok(html.includes("tl.fromTo('#card-0'"));
  assert.ok(html.includes('assets/rosto.mp4'));
  assert.ok(!html.includes('29.35')); assert.ok(!html.includes('https://'));
});
test('destaques nunca ultrapassam duração e vídeo sem fala mantém progresso', () => {
  const itens = destaques([{texto:'fim',inicio:3,fim:9}],6);
  assert.equal(itens[0].fim,6);
  const html = templateGravado({formato:'9:16',duracao:1,palavras:[],estilo});
  assert.ok(html.includes("tl.fromTo('#progresso'"));
  assert.ok(!html.includes('class="card"'));
});
test('check falhando impede render e render sem arquivo não é aceito como sucesso', t => {
  const dir=mkdtempSync(join(tmpdir(),'flow-render-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const saida=join(dir,'motion.mp4');let chamadas=[];
  assert.throws(()=>renderizarMotions(dir,saida,(_cmd,args)=>{chamadas.push(args);throw new Error('check inválido');}),/check inválido/);
  assert.equal(chamadas.length,1);
  assert.throws(()=>renderizarMotions(dir,saida,()=>{}),/não gerou/);
  chamadas=[];
  renderizarMotions(dir,saida,(_cmd,args,opts)=>{chamadas.push(args);assert.equal(opts.cwd,dir);if(args[1]==='render') writeFileSync(saida,'fixture');});
  assert.deepEqual(chamadas.map(args=>args[1]),['check','render']);
});
