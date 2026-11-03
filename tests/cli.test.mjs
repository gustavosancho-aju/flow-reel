import test from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

test("CLI reconhece caminho real e link simbólico/junction, mas não executa ao importar", (t) => {
  const temporarios = fileURLToPath(new URL("../test-output/", import.meta.url)); mkdirSync(temporarios, { recursive: true });
  const pasta = mkdtempSync(join(temporarios, "cli-path-"));
  t.after(() => rmSync(pasta, { recursive: true, force: true }));
  const real = join(pasta, "real"); mkdirSync(real);
  copyFileSync(new URL("../scripts/lib/cli.mjs", import.meta.url), join(real, "cli.mjs"));
  writeFileSync(join(real, "main.mjs"), 'import {executadoDiretamente} from "./cli.mjs"; console.log(executadoDiretamente(import.meta.url) ? "direto" : "importado");');
  const atalho = join(pasta, "atalho"); symlinkSync(real, atalho, process.platform === "win32" ? "junction" : "dir");
  for (const base of [real, atalho]) {
    const r = spawnSync(process.execPath, [join(base, "main.mjs")], { encoding: "utf8", cwd: pasta });
    assert.equal(r.status, 0, r.stderr); assert.equal(r.stdout.trim(), "direto");
  }
  const importar = spawnSync(process.execPath, ["--input-type=module", "-e", `await import(${JSON.stringify(pathToFileURL(join(atalho, "main.mjs")).href)})`], { encoding: "utf8" });
  assert.equal(importar.status, 0, importar.stderr); assert.equal(importar.stdout.trim(), "importado");
});
