import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { validarPerfil } from "../scripts/validar-perfil.mjs";

function fixture(t, { gravado = false, refs = 4, aprovado = false } = {}) {
  const raiz = mkdtempSync(join(tmpdir(), "flow-perfil-test-"));
  t.after(() => rmSync(raiz, { recursive: true, force: true }));
  mkdirSync(join(raiz, "perfil"));
  const perfil = { nome: "Ana", nicho: "Imóveis" };
  if (!gravado) Object.assign(perfil, { avatar: { nomeNoFlow: "Eu" }, cenario: "Sala", figurino: "Camisa" });
  const estilo = { origem: { videosReferencia: Array.from({ length: refs }, (_, i) => `ref${i}`), aprovadoSemReferencias: aprovado },
    cores: {}, fontes: {}, legenda: {}, layout: {} };
  const salvar = () => {
    writeFileSync(join(raiz, "perfil/perfil.json"), JSON.stringify(perfil));
    writeFileSync(join(raiz, "perfil/estilo.json"), JSON.stringify(estilo));
  };
  return { raiz, perfil, estilo, salvar };
}

test("primeiro uso lista os dois arquivos faltantes", (t) => {
  const { raiz } = fixture(t);
  assert.deepEqual(validarPerfil(raiz), { pronto: false, primeiroUso: true, faltando: ["perfil/perfil.json", "perfil/estilo.json"] });
});
test("avatar configurado fica pronto e placeholder é rejeitado", (t) => {
  const f = fixture(t); f.salvar();
  assert.equal(validarPerfil(f.raiz).pronto, true);
  f.perfil.nome = "Seu Nome"; f.salvar();
  assert.ok(validarPerfil(f.raiz).faltando.includes("perfil.nome"));
});
test("gravado dispensa campos do Flow sem relaxar o avatar", (t) => {
  const f = fixture(t, { gravado: true }); f.salvar();
  assert.equal(validarPerfil(f.raiz, "gravado").pronto, true);
  assert.deepEqual(validarPerfil(f.raiz).faltando, ["perfil.avatar", "perfil.cenario", "perfil.figurino"]);
  assert.throws(() => validarPerfil(f.raiz, "outro"), /Modo inválido/);
});
test("exige quatro referências ou aprovação registrada", (t) => {
  const f = fixture(t, { refs: 2 }); f.salvar();
  assert.match(validarPerfil(f.raiz).faltando[0], /tem 2, precisa de 4/);
  f.estilo.origem.aprovadoSemReferencias = true; f.salvar();
  assert.equal(validarPerfil(f.raiz).pronto, true);
});
test("fonte relativa é validada na raiz do perfil e falta de arquivo é apontada", (t) => {
  const f = fixture(t); f.estilo.fontes.legenda = { arquivo: "perfil/fonte.ttf" }; f.salvar();
  assert.match(validarPerfil(f.raiz).faltando[0], /arquivo não encontrado/);
  writeFileSync(join(f.raiz, "perfil/fonte.ttf"), "fixture");
  assert.equal(validarPerfil(f.raiz).pronto, true);
});
test("JSON inválido vira diagnóstico de configuração", (t) => {
  const f = fixture(t); f.salvar();
  writeFileSync(join(f.raiz, "perfil/perfil.json"), "{");
  assert.ok(validarPerfil(f.raiz).faltando.some((item) => item.includes("JSON inválido")));
});
test("CLI mantém JSON e códigos de saída 0, 2 e 1", (t) => {
  const f = fixture(t);
  mkdirSync(join(f.raiz, "scripts/lib"), { recursive: true });
  for (const nome of ["validar-perfil.mjs", "lib/raiz.mjs"]) {
    copyFileSync(new URL(`../scripts/${nome}`, import.meta.url), join(f.raiz, "scripts", nome));
  }
  const run = (modo = "avatar") => spawnSync(process.execPath, [join(f.raiz, "scripts/validar-perfil.mjs"), modo], { encoding: "utf8", cwd: tmpdir() });
  const primeiro = run(); assert.equal(primeiro.status, 2); assert.equal(JSON.parse(primeiro.stdout).primeiroUso, true);
  f.salvar(); assert.equal(run().status, 0);
  assert.equal(run("outro").status, 1);
});
