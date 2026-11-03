import test from 'node:test';
import assert from 'node:assert/strict';
import { escolherTranscritor, transcreverArquivo, planejarCortes, validarPalavras } from '../scripts/lib/transcricao.mjs';
import { fileURLToPath } from 'node:url';
const arquivo = fileURLToPath(new URL('./transcricao.test.mjs', import.meta.url));
test('seleciona chave disponível, respeita provedor explícito e modo offline', () => {
  assert.equal(escolherTranscritor({}), null);
  assert.equal(escolherTranscritor({ OPENAI_API_KEY: 'a' }).provedor, 'openai');
  assert.equal(escolherTranscritor({ GROQ_API_KEY: 'g', OPENAI_API_KEY: 'a' }).provedor, 'groq');
  assert.equal(escolherTranscritor({ GROQ_API_KEY: 'g' }, 'nenhum'), null);
  assert.throws(() => escolherTranscritor({}, 'openai'), /Falta/);
});
for (const provedor of ['groq','openai']) test(`envia multipart e normaliza timestamps ${provedor}`, async () => {
  const palavras = await transcreverArquivo(arquivo, 3, { provedor, chave: 'segredo' }, async (url, opts) => {
    assert.ok(url.includes(provedor === 'groq' ? 'api.groq.com' : 'api.openai.com'));
    assert.equal(opts.body.get('model'), provedor === 'groq' ? 'whisper-large-v3' : 'whisper-1');
    assert.equal(opts.body.get('timestamp_granularities[]'), 'word');
    assert.equal(opts.headers.Authorization, 'Bearer segredo');
    assert.equal(opts.redirect, 'error');
    return { ok: true, json: async () => ({ words: [{ word: 'Olá', start: 1, end: 1.5 }, { word: 'fim', start: 2, end: 3.1 }, { word: 'fora', start: 4, end: 5 }] }) };
  });
  assert.deepEqual(palavras, [{ texto: 'Olá', inicio: 1, fim: 1.5 }, { texto: 'fim', inicio: 2, fim: 3 }]);
});
test('falha de API é visível, não vaza resposta/chave nem troca provedor', async () => {
  let n = 0;
  await assert.rejects(transcreverArquivo(arquivo, 3, { provedor: 'groq', chave: 'SEGREDO' }, async () => { n++; return { ok: false, status: 401 }; }), /HTTP 401/);
  assert.equal(n, 1);
  assert.throws(() => validarPalavras([{ texto: 'x', inicio: 2, fim: 1 }], 3), /inválidos/);
});
test('cortes mantêm palavras, removem pausas e recalculam legenda na nova linha do tempo', () => {
  const r = planejarCortes([{ texto: 'um', inicio: 1, fim: 2 }, { texto: 'dois', inicio: 4, fim: 5 }], 6, 0.1);
  assert.deepEqual(r.intervalos, [[0.9,2.1],[3.9,5.1]]);
  assert.ok(Math.abs(r.palavras[1].inicio - 1.3) < 0.001);
  assert.ok(Math.abs(r.duracao - 2.4) < 0.001);
  assert.deepEqual(planejarCortes([], 6).intervalos, [[0,6]]);
});
test('palavra com duração zero do Whisper recebe intervalo mínimo sem sumir', () => {
  assert.deepEqual(validarPalavras([{texto:'a',inicio:1,fim:1}],2),[{texto:'a',inicio:1,fim:1.02}]);
});
