import test from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { configurar } from "../scripts/configurar.mjs";
import { diagnosticar } from "../scripts/diagnostico.mjs";
import { resolverFonte } from "../scripts/lib/fontes.mjs";
import { validarPerfil } from "../scripts/validar-perfil.mjs";

function fixture(t) {
  const raiz = mkdtempSync(join(tmpdir(), "flow-onboarding-test-"));
  t.after(() => rmSync(raiz, { recursive: true, force: true }));
  for (const pasta of ["perfil", "assets/fonts", "scripts"]) mkdirSync(join(raiz, pasta), { recursive: true });
  for (const nome of ["perfil/perfil.exemplo.json", "perfil/estilo.exemplo.json", ".env.exemplo"]) copyFileSync(new URL(`../${nome}`, import.meta.url), join(raiz, nome));
  cpSync(new URL("../assets/fonts/", import.meta.url), join(raiz, "assets/fonts"), { recursive: true });
  for (const nome of ["edicao-template.html", "edicao-camadas.html"]) copyFileSync(new URL(`../assets/${nome}`, import.meta.url), join(raiz, "assets", nome));
  cpSync(new URL("../scripts/", import.meta.url), join(raiz, "scripts"), { recursive: true });
  return raiz;
}
const opcoes = { modo: "gravado", nome: "Ana", nicho: "Imóveis", estiloBasico: true };

test("configuração cria perfil gravado pronto com fontes do próprio clone e sem serviços pagos", (t) => {
  const raiz = fixture(t), r = configurar(opcoes, raiz);
  assert.deepEqual(r.criados, ["perfil/perfil.json", "perfil/estilo.json", ".env.local"]);
  assert.equal(validarPerfil(raiz).pronto, true);
  const perfil = JSON.parse(readFileSync(join(raiz, "perfil/perfil.json")));
  assert.equal(perfil.avatar, undefined); assert.equal(perfil.velocidadeFinal, 1);
  assert.equal(perfil.voz.metodo, "original"); assert.equal(perfil.publicacao.instagram, false);
  const estilo = JSON.parse(readFileSync(join(raiz, "perfil/estilo.json")));
  for (const f of Object.values(estilo.fontes).filter((f) => f?.arquivo)) {
    assert.equal(isAbsolute(f.arquivo), false); assert.ok(resolverFonte(f, raiz).startsWith(raiz));
  }
  assert.equal(estilo.origem.aprovadoSemReferencias, true);
});
test("configuração não sobrescreve perfil, estilo ou credenciais existentes", (t) => {
  const raiz = fixture(t); configurar(opcoes, raiz);
  writeFileSync(join(raiz, ".env.local"), "MINHA_CHAVE=preservar");
  const antes = ["perfil/perfil.json", "perfil/estilo.json", ".env.local"].map((f) => readFileSync(join(raiz, f), "utf8"));
  const r = configurar({ ...opcoes, nome: "Outro Nome" }, raiz);
  assert.deepEqual(r.criados, []); assert.equal(r.preservados.length, 3);
  assert.deepEqual(["perfil/perfil.json", "perfil/estilo.json", ".env.local"].map((f) => readFileSync(join(raiz, f), "utf8")), antes);
});
test("estilo básico exige escolha explícita; avatar ainda exige seus campos", (t) => {
  const raiz = fixture(t); configurar({ ...opcoes, estiloBasico: false }, raiz);
  assert.equal(existsSync(join(raiz, "perfil/estilo.json")), false);
  assert.equal(validarPerfil(raiz).pronto, false);
  assert.throws(() => configurar({ ...opcoes, modo: "avatar" }, raiz), /--avatar/);
});
test("configuração de avatar mantém seus campos e permite voz original para começar", (t) => {
  const raiz = fixture(t);
  configurar({ ...opcoes, modo: "avatar", avatar: "Minha Persona", cenario: "Estúdio", figurino: "Camisa" }, raiz);
  assert.equal(validarPerfil(raiz).pronto, true);
  const perfil = JSON.parse(readFileSync(join(raiz, "perfil/perfil.json")));
  assert.equal(perfil.avatar.nomeNoFlow, "Minha Persona"); assert.equal(perfil.velocidadeFinal, 1.1);
  assert.equal(perfil.voz.metodo, "original");
});
test("CLI configura clone em outra pasta, sem usar cwd para fontes ou .env", (t) => {
  const raiz = fixture(t);
  const r = spawnSync(process.execPath, [join(raiz, "scripts/configurar.mjs"), "--modo", "gravado", "--nome", "Ana", "--nicho", "Imóveis", "--estilo-basico"], { cwd: tmpdir(), encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(validarPerfil(raiz).pronto, true);
  const template = spawnSync(process.execPath, [join(raiz, "scripts/aplicar-estilo-template.mjs"), join(raiz, "edicao/index.html"), "16:9", "gravado"], { cwd: tmpdir(), encoding: "utf8" });
  // A fixture inclui as fontes e copia os templates versionados, sem fonte de sistema.
  assert.equal(template.status, 0, template.stderr);
  assert.ok(readFileSync(join(raiz, "edicao/index.html"), "utf8").includes('data-width="1920" data-height="1080"'));
  assert.ok(existsSync(join(raiz, "edicao/fonts/Poppins-Bold.ttf")));
  assert.ok(existsSync(join(raiz, "edicao/fonts/Poppins-OFL.txt")));
});
test("diagnóstico identifica Node antigo, binários ausentes e módulos opcionais", (t) => {
  const raiz = fixture(t);
  const r = diagnosticar({ raiz, versaoNode: "18.20.0", executar: () => ({ error: { code: "ENOENT" }, status: null }) });
  assert.equal(r.ok, false); assert.ok(r.itens.filter((i) => !i.ok).some((i) => i.nome === "Node.js 22+"));
  assert.ok(r.itens.some((i) => i.nome === "FFmpeg" && !i.ok)); assert.match(r.opcionais, /quando usados/);
});
test("diagnóstico orienta ffmpeg-full quando faltam filtros no macOS", (t) => {
  const raiz = fixture(t);
  const r = diagnosticar({ raiz, plataforma: "darwin", versaoNode: "22.0.0", executar: (_cmd, args) => ({ status: 0,
    stdout: args.includes("-encoders") ? "libx264 aac" : args.includes("-filters") ? "scale trim" : "version test", stderr: "" }) });
  assert.equal(r.ok, false);
  assert.match(r.itens.find((i) => i.nome === "Filtro subtitles").detalhe, /brew install ffmpeg-full/);
});
test("fontes embarcadas correspondem às origens e licenças versionadas", () => {
  const pasta = fileURLToPath(new URL("../assets/fonts/", import.meta.url));
  const origem = JSON.parse(readFileSync(join(pasta, "origem.json")));
  for (const arq of origem.arquivos) assert.equal(createHash("sha256").update(readFileSync(join(pasta, arq.arquivo))).digest("hex"), arq.sha256);
  assert.match(readFileSync(join(pasta, "Poppins-OFL.txt"), "utf8"), /SIL OPEN FONT LICENSE/);
});
