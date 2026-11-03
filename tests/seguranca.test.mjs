import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { configurarUpload, uploadSupabase } from "../scripts/upload-supabase.mjs";

const futuro = Math.floor(Date.now() / 1000) + 3600;
const jwt = (role) => `e30.${Buffer.from(JSON.stringify({ role, sub: "upload-user", exp: futuro })).toString("base64url")}.fixture`;
const config = { SUPABASE_URL: "https://example.supabase.co", SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture",
  SUPABASE_STORAGE_ACCESS_TOKEN: jwt("authenticated"), SUPABASE_STORAGE_REFRESH_TOKEN: "refresh-inicial" };
const temp = (t) => {
  const temporarios = fileURLToPath(new URL("../test-output/", import.meta.url));
  mkdirSync(temporarios, { recursive: true });
  const dir = mkdtempSync(join(temporarios, "flow-security-test-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
};
test("upload rejeita chaves administrativas, JWT privilegiado e bucket diferente", () => {
  for (const key of ["sb_secret_fixture", jwt("service_role")]) {
    assert.throws(() => configurarUpload({ ...config, SUPABASE_PUBLISHABLE_KEY: key }), /administrativos/);
  }
  assert.throws(() => configurarUpload({ ...config, SUPABASE_STORAGE_ACCESS_TOKEN: jwt("service_role") }), /RLS/);
  assert.throws(() => configurarUpload(config, "outro-bucket"), /dedicado/);
  assert.throws(() => configurarUpload({ ...config, SUPABASE_SIGNED_URL_TTL: "0" }), /segundos/);
  assert.throws(() => configurarUpload({ ...config, SUPABASE_URL: "http://example.com" }), /HTTPS/);
});
test("upload usa INSERT sem upsert, codifica caminho e devolve URL assinada", async (t) => {
  const arquivo = join(temp(t), "video.mp4"); writeFileSync(arquivo, "fixture");
  const arquivoSessao = join(temp(t), "sessao.json");
  const chamadas = [];
  const request = async (url, options) => {
    chamadas.push({ url, options });
    if (url.includes("/auth/v1/")) return { ok: true, json: async () => ({ access_token: jwt("authenticated"), refresh_token: "refresh-rotacionado", user: { id: "upload-user" } }) };
    return { ok: true, json: async () => ({ signedURL: "/object/sign/flow-reel-media/reels/v.mp4?token=fixture" }) };
  };
  const url = await uploadSupabase(arquivo, "reels/visita á.mp4", "video/mp4", config, undefined, request, { arquivoSessao });
  assert.equal(chamadas.length, 3);
  assert.ok(chamadas[0].url.endsWith("/auth/v1/token?grant_type=refresh_token"));
  assert.match(chamadas[1].url, /visita%20%C3%A1.mp4$/);
  assert.equal(chamadas[1].options.headers["x-upsert"], "false");
  assert.equal(chamadas[1].options.headers.Authorization, `Bearer ${config.SUPABASE_STORAGE_ACCESS_TOKEN}`);
  assert.deepEqual(JSON.parse(chamadas[2].options.body), { expiresIn: 21600 });
  assert.equal(url, "https://example.supabase.co/storage/v1/object/sign/flow-reel-media/reels/v.mp4?token=fixture");
});
test("erro de upload não assina URL nem expõe resposta remota", async (t) => {
  const arquivo = join(temp(t), "v.mp4"); writeFileSync(arquivo, "fixture");
  let chamadas = 0;
  await assert.rejects(uploadSupabase(arquivo, "v.mp4", "video/mp4", config, undefined, async (url) => {
    chamadas++;
    if (url.includes("/auth/v1/")) return { ok: true, json: async () => ({ access_token: jwt("authenticated"), refresh_token: "rotacionado", user: { id: "upload-user" } }) };
    return { ok: false, status: 403, text: async () => "SEGREDO" };
  }, { arquivoSessao: join(temp(t), "sessao.json") }), (err) => /HTTP 403/.test(err.message) && !err.message.includes("SEGREDO"));
  assert.equal(chamadas, 2);
});
test("rejeita traversal antes de enviar mídia", async () => {
  await assert.rejects(uploadSupabase("ausente.mp4", "../escape.mp4", "video/mp4", config), /Caminho/);
});
test("config lê apenas env da raiz, ignora cwd, FLOW_REEL_ENV e perfil.envArquivo", (t) => {
  const dir = temp(t), raiz = join(dir, "repo");
  mkdirSync(join(raiz, "scripts/lib"), { recursive: true }); mkdirSync(join(raiz, "perfil"));
  for (const nome of ["config.mjs", "raiz.mjs"]) copyFileSync(new URL(`../scripts/lib/${nome}`, import.meta.url), join(raiz, "scripts/lib", nome));
  for (const nome of ["perfil", "estilo"]) writeFileSync(join(raiz, `perfil/${nome}.exemplo.json`), "{}");
  writeFileSync(join(dir, ".env.local"), "FLOW_REEL_TEST_ENV=foreign\nFLOW_REEL_TEST_FOREIGN=leaked");
  writeFileSync(join(raiz, "perfil/perfil.json"), JSON.stringify({ envArquivo: join(dir, ".env.local") }));
  writeFileSync(join(raiz, ".env"), "FLOW_REEL_TEST_ENV=repo");
  writeFileSync(join(raiz, ".env.local"), "FLOW_REEL_TEST_ENV=local");
  const script = `import {env} from ${JSON.stringify(pathToFileURL(join(raiz, "scripts/lib/config.mjs")).href)}; console.log(JSON.stringify({chosen:env.FLOW_REEL_TEST_ENV,foreign:env.FLOW_REEL_TEST_FOREIGN}));`;
  const childEnv = { ...process.env, FLOW_REEL_ENV: join(dir, ".env.local") };
  delete childEnv.FLOW_REEL_TEST_FOREIGN;
  const result = execFileSync(process.execPath, ["--input-type=module", "-e", script], { cwd: dir, env: childEnv, encoding: "utf8" });
  assert.deepEqual(JSON.parse(result), { chosen: "local" });
});
