import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
test('env.local vazio preserva chaves do env; valor local preenchido tem prioridade', async t => {
  const root=mkdtempSync(join(tmpdir(),'flow-env-')); t.after(()=>rmSync(root,{recursive:true,force:true}));
  mkdirSync(join(root,'scripts/lib'),{recursive:true});mkdirSync(join(root,'perfil'));
  for(const file of ['raiz.mjs','config.mjs']) copyFileSync(new URL(`../scripts/lib/${file}`,import.meta.url),join(root,'scripts/lib',file));
  for(const file of ['perfil','estilo']) writeFileSync(join(root,`perfil/${file}.exemplo.json`),'{}');
  writeFileSync(join(root,'.env'),'GROQ_API_KEY=groq-fixture\nOPENAI_API_KEY=original');
  writeFileSync(join(root,'.env.local'),'GROQ_API_KEY=\nOPENAI_API_KEY=local-fixture');
  const {env}=await import(pathToFileURL(join(root,'scripts/lib/config.mjs')).href);
  assert.equal(env.GROQ_API_KEY,'groq-fixture');assert.equal(env.OPENAI_API_KEY,'local-fixture');
});
