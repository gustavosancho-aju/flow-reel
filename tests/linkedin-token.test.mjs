import test from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

test("LinkedIn exige token próprio e ignora o antigo modo Supabase antes de qualquer conexão", (t) => {
  const raiz = mkdtempSync(join(tmpdir(), "flow-linkedin-test-"));
  t.after(() => rmSync(raiz, { recursive: true, force: true }));
  mkdirSync(join(raiz, "scripts/lib"), { recursive: true }); mkdirSync(join(raiz, "perfil"));
  for (const nome of ["publicar-linkedin-video.mjs", "lib/config.mjs", "lib/raiz.mjs", "lib/publicacao-teste.mjs"]) {
    copyFileSync(new URL(`../scripts/${nome}`, import.meta.url), join(raiz, "scripts", nome));
  }
  for (const nome of ["perfil", "estilo"]) writeFileSync(join(raiz, `perfil/${nome}.exemplo.json`), "{}");
  writeFileSync(join(raiz, ".env.local"), "LINKEDIN_TOKEN_FROM_SUPABASE=true\nNEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co\nSUPABASE_SERVICE_ROLE_KEY=fixture");
  const interceptor = join(raiz, "network.cjs");
  writeFileSync(interceptor, 'globalThis.fetch = () => { console.log("FETCH_WAS_CALLED"); throw new Error("Rede proibida no teste"); };');
  const childEnv = { ...process.env }; delete childEnv.LINKEDIN_ACCESS_TOKEN;
  const r = spawnSync(process.execPath, ["--require", interceptor, join(raiz, "scripts/publicar-linkedin-video.mjs"), "video.mp4", "texto.txt"], { encoding: "utf8", env: childEnv });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Faltam variáveis.*LINKEDIN_ACCESS_TOKEN/);
  assert.ok(!r.stdout.includes("FETCH_WAS_CALLED"));
});
