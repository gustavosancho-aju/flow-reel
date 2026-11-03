import test from "node:test";
import assert from "node:assert/strict";
import { argumentosAutoEditor, argumentosFiltroArquivo } from "../scripts/lib/corte.mjs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

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
test("CLI recusa qualquer limiar explícito no motor ffmpeg antes de abrir o vídeo", () => {
  const script = fileURLToPath(new URL("../scripts/cortar-video.mjs", import.meta.url));
  for (const limiar of ["0.025", "0", "abc", ""]) {
    const r = spawnSync(process.execPath, [script, "inexistente.mp4", "saida.mp4", "ffmpeg", "0.35", "0.12", limiar], { encoding: "utf8" });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /limiar só é aceito pelo motor auto-editor/);
    assert.ok(!r.stderr.includes("ffprobe"));
  }
});
test("rejeita tempos e limiares inválidos antes de iniciar processo", () => {
  for (const valores of [[-1,0.1,0.025],[0.35,NaN,0.025],[0.35,0.1,0],[0.35,0.1,1.1]]) {
    assert.throws(() => argumentosAutoEditor("a.mp4","b.mp4",...valores), /Corte inválido/);
  }
});
test("arquivo de filtro é compatível com FFmpeg antigo e FFmpeg 9", () => {
  const caminho = "pasta com espaços/filtro.txt";
  assert.deepEqual(argumentosFiltroArquivo(caminho, "-filter_complex_script <filename> read graph"), ["-filter_complex_script", caminho]);
  assert.deepEqual(argumentosFiltroArquivo(caminho, "-filter_complex <graph> create graph"), ["-/filter_complex", caminho]);
});
