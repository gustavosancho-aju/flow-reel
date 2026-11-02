import test from "node:test";
import assert from "node:assert/strict";
import { argumentosAutoEditor } from "../scripts/lib/corte.mjs";

test("auto-editor recebe caminhos literais e parâmetros de corte separados", () => {
  const entrada = "visita & depoimento.mp4", saida = "editado final.mp4";
  const args = argumentosAutoEditor(entrada, saida);
  assert.equal(args[0], entrada);
  assert.equal(args.at(-1), saida);
  assert.equal(args[args.indexOf("--margin") + 1], "0.12s");
  assert.equal(args[args.indexOf("--smooth") + 1], "0.35s,0.1s");
  assert.equal(args[args.indexOf("--edit") + 1], "audio:threshold=0.025");
  assert.ok(!args.includes("--resolution"));
});
test("rejeita tempos e limiares inválidos antes de iniciar processo", () => {
  for (const valores of [[-1,0.1,0.025],[0.35,NaN,0.025],[0.35,0.1,0],[0.35,0.1,1.1]]) {
    assert.throws(() => argumentosAutoEditor("a.mp4","b.mp4",...valores), /Corte inválido/);
  }
});
