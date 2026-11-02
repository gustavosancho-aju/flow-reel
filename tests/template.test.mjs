import test from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { Script } from "node:vm";

function fixture(t) {
  const raiz = mkdtempSync(join(tmpdir(), "flow-template-test-"));
  t.after(() => rmSync(raiz, { recursive: true, force: true }));
  for (const pasta of ["scripts/lib", "assets", "perfil"]) mkdirSync(join(raiz, pasta), { recursive: true });
  for (const nome of ["aplicar-estilo-template.mjs", "lib/config.mjs", "lib/raiz.mjs", "lib/formato.mjs", "lib/midia.mjs"]) {
    copyFileSync(new URL(`../scripts/${nome}`, import.meta.url), join(raiz, "scripts", nome));
  }
  for (const nome of ["edicao-template.html", "edicao-camadas.html"]) {
    copyFileSync(new URL(`../assets/${nome}`, import.meta.url), join(raiz, "assets", nome));
  }
  const fonte = { familia: "Fonte Teste", arquivo: join(raiz, "perfil/fonte.ttf") };
  writeFileSync(fonte.arquivo, "fonte de teste; não usada para render");
  writeFileSync(join(raiz, "perfil/perfil.exemplo.json"), "{}");
  writeFileSync(join(raiz, "perfil/estilo.exemplo.json"), JSON.stringify({
    cores: { fundo: "#000000", destaque: "#00FF66", texto: "#FFFFFF" },
    fontes: { titulo: fonte, corpo: fonte, legenda: fonte },
  }));
  const saida = join(raiz, "edicao/index.html");
  const run = (...args) => spawnSync(process.execPath, [join(raiz, "scripts/aplicar-estilo-template.mjs"), saida, ...args], { encoding: "utf8", cwd: tmpdir() });
  return { saida, run };
}

test("CLI de template preserva avatar padrão e comando legado camadas", (t) => {
  const f = fixture(t);
  for (const opcoes of [[], ["dividido"], ["camadas"]]) {
    const r = f.run(...opcoes); assert.equal(r.status, 0, r.stderr);
    const html = readFileSync(f.saida, "utf8");
    assert.match(html, /data-width="1080" data-height="1920"/);
    assert.ok(!/\{\{[A-Z_]+\}\}/.test(html));
    for (const script of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) new Script(script[1]);
    if (opcoes.includes("camadas")) assert.ok(html.includes("pessoa.webm"));
  }
});
test("gravado mantém 9:16 e 16:9 e aceita argumentos em ordens diferentes", (t) => {
  const f = fixture(t);
  for (const [opcoes, largura, altura] of [
    [["9:16", "gravado"], 1080, 1920],
    [["16:9", "gravado"], 1920, 1080],
    [["dividido", "gravado", "16:9"], 1920, 1080],
  ]) {
    const r = f.run(...opcoes); assert.equal(r.status, 0, r.stderr);
    const html = readFileSync(f.saida, "utf8");
    assert.ok(html.includes(`data-width="${largura}" data-height="${altura}"`));
    assert.match(html, /object-fit: contain/);
    assert.ok(!/\{\{[A-Z_]+\}\}/.test(html));
    for (const script of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) new Script(script[1]);
  }
});
test("template rejeita opções inválidas ou combinações incompatíveis antes de escrever", (t) => {
  const f = fixture(t);
  for (const opcoes of [["4:3"], ["9:16", "16:9"], ["camadas", "gravado"], ["camadas", "16:9"]]) {
    assert.notEqual(f.run(...opcoes).status, 0);
  }
});
