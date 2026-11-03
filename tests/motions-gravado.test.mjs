import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { templateGravado, destaques } from '../scripts/lib/motions-gravado.mjs';
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
  const itens = destaques([{texto:'fim',inicio:5,fim:9}],6);
  assert.equal(itens[0].fim,6);
  const html = templateGravado({formato:'9:16',duracao:1,palavras:[],estilo});
  assert.ok(html.includes("tl.fromTo('#progresso'"));
  assert.ok(!html.includes('class="card"'));
});
