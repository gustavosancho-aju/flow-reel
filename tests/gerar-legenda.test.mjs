import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { gerarLegenda, normalizar, agruparPalavras } from "../scripts/gerar-legenda.mjs";

const estilo = { cores: { texto: "#FFFFFF", destaque: "#00FF66" }, fontes: { legenda: { familia: "Arial", tamanho: 32 } }, legenda: { palavrasPorCartela: 3 } };
const p = (texto, inicio, fim) => ({ texto, inicio, fim });
const eventos = (ass) => ass.split("\n").filter((l) => l.startsWith("Dialogue:"));

test("normaliza em ordem falada sem sobreposição nem duração zero", () => {
  const resultado = normalizar([p("que", 1, 1.3), p("você", 0.9, 1), p("está", 1.31, 1.31)]);
  assert.deepEqual(resultado.map((w) => w.texto), ["que", "você", "está"]);
  assert.equal(resultado[1].inicio, resultado[0].fim);
  assert.ok(resultado.every((w) => w.fim > w.inicio));
  assert.throws(() => normalizar([p("erro", NaN, 1)]), /tempos/);
});
test("agrupa por quantidade, pontuação e pausa", () => {
  const palavras = [p("A",0,0.1),p("B",0.1,0.2),p("C",0.2,0.3),p("D.",0.3,0.4),p("E",0.4,0.5),p("F",1,1.1)];
  assert.deepEqual(agruparPalavras(palavras).map((g) => g.map((w) => w.texto)), [["A","B","C"],["D."],["E"],["F"]]);
  assert.throws(() => agruparPalavras(palavras, 0), /inteiro positivo/);
});
test("ASS vertical mantém fonte, caixa alta e correções existentes", () => {
  const ass = gerarLegenda([p("Olá,",0,0.2),p("cloud!",0.2,0.4)], estilo);
  assert.match(ass, /PlayResX: 720\nPlayResY: 1280/);
  assert.match(ass, /Style: Reels,Arial,32/);
  assert.ok(eventos(ass)[0].endsWith("OLÁ CLAUDE"));
});
test("ASS horizontal respeita dimensão e caixa normal configurada", () => {
  const ass = gerarLegenda([p("Olá!",0,0.2)], { ...estilo, legenda: { caixaAlta: false } }, { formato: "16:9" });
  assert.match(ass, /PlayResX: 1280\nPlayResY: 720/);
  assert.ok(eventos(ass)[0].endsWith("Olá"));
  assert.throws(() => gerarLegenda([], estilo, { formato: "4:3" }), /Formato inválido/);
});
test("suprime legendas sob motion e aceita entrada vazia", () => {
  const ass = gerarLegenda([p("oculta",0,0.2),p("visível",1,1.2)], estilo, { suprimir: [[0,0.5]] });
  assert.equal(eventos(ass).length, 1); assert.ok(ass.includes("VISÍVEL")); assert.ok(!ass.includes("OCULTA"));
  assert.equal(eventos(gerarLegenda([], estilo)).length, 0);
});
test("tempos ASS arredondam para o segundo/minuto seguinte sem .100", () => {
  const ass = gerarLegenda([p("agora",59.999,60.1)], estilo);
  assert.match(ass, /Dialogue: 0,0:01:00.00,/);
  assert.ok(!ass.includes(".100"));
});
test("cartelas não invadem o início da próxima", () => {
  const ass = gerarLegenda([p("uma",0,0.2),p("duas",0.2,0.4)], { ...estilo, legenda: { palavrasPorCartela: 1 } });
  const linhas = eventos(ass);
  assert.match(linhas[0], /0:00:00.00,0:00:00.18/);
  assert.match(linhas[1], /0:00:00.20,0:00:00.52/);
});
test("exportação com duração conhecida não deixa legenda além do vídeo", () => {
  const ass = gerarLegenda([p("fim",0.5,0.99)], estilo, { duracao: 1 });
  assert.match(eventos(ass)[0], /0:00:00.50,0:00:01.00/);
  assert.throws(() => gerarLegenda([], estilo, { duracao: 0 }), /Duração/);
});
test("CLI gera ASS a partir de arquivo, inclusive SUPRIMIR", (t) => {
  const temp = mkdtempSync(join(tmpdir(), "flow-legenda-test-"));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  const entrada = join(temp, "palavras.json"), saida = join(temp, "legenda.ass");
  writeFileSync(entrada, JSON.stringify([p("olá",0,0.2),p("mundo",1,1.2)]));
  const r = spawnSync(process.execPath, [fileURLToPath(new URL("../scripts/gerar-legenda.mjs", import.meta.url)), entrada, saida, "16:9"],
    { cwd: temp, encoding: "utf8", env: { ...process.env, SUPRIMIR: "[[0,0.5]]" } });
  assert.equal(r.status, 0, r.stderr);
  const ass = readFileSync(saida, "utf8"); assert.match(ass, /PlayResY: 720/); assert.equal(eventos(ass).length, 1);
});
