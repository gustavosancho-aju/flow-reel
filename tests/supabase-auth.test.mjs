import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { renovarSessao } from "../scripts/lib/supabase-auth.mjs";
import { uploadSupabase } from "../scripts/upload-supabase.mjs";

const futuro = Math.floor(Date.now() / 1000) + 3600;
const jwt = (sub = "usuario", exp = futuro) =>
  `e30.${Buffer.from(JSON.stringify({ role: "authenticated", sub, exp })).toString("base64url")}.fixture`;
const conexao = { base: "https://example.supabase.co", key: "sb_publishable_fixture", token: jwt("usuario", 1) };
const config = { SUPABASE_URL: conexao.base, SUPABASE_PUBLISHABLE_KEY: conexao.key,
  SUPABASE_STORAGE_ACCESS_TOKEN: conexao.token, SUPABASE_STORAGE_REFRESH_TOKEN: "inicial" };
const fixture = (t) => {
  const temporarios = fileURLToPath(new URL("../test-output/", import.meta.url));
  mkdirSync(temporarios, { recursive: true });
  const pasta = mkdtempSync(join(temporarios, "flow-auth-test-"));
  t.after(() => rmSync(pasta, { recursive: true, force: true }));
  return { arquivoSessao: join(pasta, "sessao.json") };
};
const resposta = (refresh = "novo", sub = "usuario", exp) => ({ ok: true,
  json: async () => ({ access_token: jwt(sub, exp), refresh_token: refresh, user: { id: sub } }) });

test("renova JWT expirado e usa o refresh rotacionado no próximo upload", async (t) => {
  const opcoes = fixture(t), recebidos = [];
  const request = async (url, options) => {
    assert.equal(url, `${conexao.base}/auth/v1/token?grant_type=refresh_token`);
    assert.equal(options.headers.apikey, conexao.key);
    assert.equal(options.headers.Authorization, undefined);
    assert.equal(options.redirect, "error");
    recebidos.push(JSON.parse(options.body).refresh_token);
    return resposta(`novo-${recebidos.length}`);
  };
  assert.equal(await renovarSessao(conexao, config, request, opcoes), jwt());
  await renovarSessao(conexao, config, request, opcoes);
  assert.deepEqual(recebidos, ["inicial", "novo-1"]);
  assert.deepEqual(JSON.parse(readFileSync(opcoes.arquivoSessao)), { base: conexao.base, userId: "usuario", refreshToken: "novo-2" });
  assert.equal(existsSync(`${opcoes.arquivoSessao}.lock`), false);
});
test("renovação pode iniciar só com refresh token, sem access token manual", async (t) => {
  const token = await renovarSessao({ ...conexao, token: undefined }, config, async () => resposta(), fixture(t));
  assert.equal(token, jwt());
});
test("falha de Auth impede upload e não expõe resposta remota", async (t) => {
  const opcoes = fixture(t);
  writeFileSync(`${opcoes.arquivoSessao}.mp4`, "fixture");
  let chamadas = 0;
  await assert.rejects(uploadSupabase(`${opcoes.arquivoSessao}.mp4`, "v.mp4", "video/mp4", config, undefined, async () => {
    chamadas++; return { ok: false, status: 400, text: async () => "SEGREDO" };
  }, opcoes), (err) => /Renovação.*HTTP 400/.test(err.message) && !err.message.includes("SEGREDO"));
  assert.equal(chamadas, 1);
  assert.equal(existsSync(opcoes.arquivoSessao), false);
  assert.equal(existsSync(`${opcoes.arquivoSessao}.lock`), false);
});
test("falha de upload preserva refresh rotacionado e só usa JWT novo na mídia", async (t) => {
  const opcoes = fixture(t), arquivo = `${opcoes.arquivoSessao}.mp4`;
  writeFileSync(arquivo, "fixture");
  await assert.rejects(uploadSupabase(arquivo, "v.mp4", "video/mp4", config, undefined, async (url, options) => {
    if (url.includes("/auth/v1/")) return resposta("persistido");
    assert.equal(JSON.parse(readFileSync(opcoes.arquivoSessao)).refreshToken, "persistido");
    assert.equal(options.headers.Authorization, `Bearer ${jwt()}`);
    assert.notEqual(options.headers.Authorization, `Bearer ${conexao.token}`);
    return { ok: false, status: 403 };
  }, opcoes), /Upload falhou/);
  assert.equal(JSON.parse(readFileSync(opcoes.arquivoSessao)).refreshToken, "persistido");
});
test("sem refresh token não há requisição nem arquivo de sessão", async (t) => {
  const opcoes = fixture(t);
  await assert.rejects(renovarSessao(conexao, {}, () => { throw new Error("não chamar"); }, opcoes), /Falta SUPABASE_STORAGE_REFRESH_TOKEN/);
  assert.equal(existsSync(`${opcoes.arquivoSessao}.lock`), false);
});
test("bloqueio impede duas renovações concorrentes da mesma sessão", async (t) => {
  const opcoes = fixture(t);
  let liberar;
  const primeira = renovarSessao(conexao, config, () => new Promise((r) => { liberar = () => r(resposta()); }), opcoes);
  await assert.rejects(renovarSessao(conexao, config, async () => resposta(), opcoes), /em andamento/);
  liberar(); await primeira;
});
test("recusa resposta expirada, usuário trocado e JSON inválido sem salvar segredos", async (t) => {
  for (const request of [async () => resposta("novo", "outro"), async () => resposta("novo", "usuario", 1),
    async () => ({ ok: true, json: async () => { throw new Error("SEGREDO"); } })]) {
    const opcoes = fixture(t);
    await assert.rejects(renovarSessao(conexao, config, request, opcoes), (e) => !e.message.includes("SEGREDO"));
    assert.equal(existsSync(opcoes.arquivoSessao), false);
  }
});
test("cache de outro projeto é recusado sem enviar refresh token", async (t) => {
  const opcoes = fixture(t);
  writeFileSync(opcoes.arquivoSessao, JSON.stringify({ base: "https://outro.supabase.co", userId: "usuario", refreshToken: "segredo" }));
  await assert.rejects(renovarSessao(conexao, config, () => { throw new Error("não chamar"); }, opcoes), /outro projeto/);
});
test("falha ao persistir rotação impede envio da mídia", async (t) => {
  const opcoes = fixture(t), arquivo = `${opcoes.arquivoSessao}.mp4`;
  writeFileSync(arquivo, "fixture");
  let chamadas = 0;
  await assert.rejects(uploadSupabase(arquivo, "v.mp4", "video/mp4", config, undefined, async () => {
    chamadas++;
    // Simula o destino tornando-se indisponível entre o refresh e a gravação atômica.
    mkdirSync(opcoes.arquivoSessao);
    return resposta();
  }, opcoes), /Não foi possível salvar/);
  assert.equal(chamadas, 1);
  assert.equal(existsSync(`${opcoes.arquivoSessao}.lock`), false);
});
