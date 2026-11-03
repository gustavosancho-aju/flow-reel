/**
 * Integração HTTP local com arquivos reais, sem credenciais nem publicação.
 * Simula Auth/Storage; não comprova a configuração RLS de um projeto Supabase real.
 * Uso: node tests/e2e-upload-local.mjs <video.mp4> <capa.jpg> <pasta-relatorio>
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { uploadSupabase } from "../scripts/upload-supabase.mjs";

const [, , video, capa, pastaArg] = process.argv;
if (!video || !capa || !pastaArg) throw new Error("Uso: node tests/e2e-upload-local.mjs <video.mp4> <capa.jpg> <pasta-relatorio>");
const pasta = resolve(pastaArg); mkdirSync(pasta, { recursive: true });
const objetos = new Map();
let renovacoes = 0, accessToken;
const hash = (b) => createHash("sha256").update(b).digest("hex");
const servidor = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    const partes = []; for await (const chunk of req) partes.push(chunk);
    const corpo = Buffer.concat(partes);
    const json = (valor) => { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(valor)); };
    if (url.pathname === "/auth/v1/token") {
      assert.equal(req.method, "POST"); assert.equal(url.searchParams.get("grant_type"), "refresh_token");
      assert.equal(req.headers.apikey, "sb_publishable_teste_local");
      assert.equal(JSON.parse(corpo).refresh_token, `local-${renovacoes}`);
      renovacoes++;
      accessToken = `e30.${Buffer.from(JSON.stringify({ role: "authenticated", sub: "usuario-local", exp: Math.floor(Date.now() / 1000) + 3600, rodada: renovacoes })).toString("base64url")}.teste-local`;
      return json({ access_token: accessToken, refresh_token: `local-${renovacoes}`, user: { id: "usuario-local" } });
    }
    if (req.method === "GET") {
      const caminho = url.pathname.replace("/storage/v1/object/sign/", "");
      const objeto = objetos.get(caminho);
      assert.equal(url.searchParams.get("token"), "assinatura-local");
      assert.ok(objeto); res.setHeader("Content-Type", objeto.mime); return res.end(objeto.corpo);
    }
    assert.equal(req.headers.authorization, `Bearer ${accessToken}`);
    if (url.pathname.startsWith("/storage/v1/object/sign/")) {
      const caminho = url.pathname.replace("/storage/v1/object/sign/", "");
      assert.ok(objetos.has(caminho)); assert.equal(JSON.parse(corpo).expiresIn, 21600);
      return json({ signedURL: `/object/sign/${caminho}?token=assinatura-local` });
    }
    const caminho = url.pathname.replace("/storage/v1/object/", "");
    assert.ok(caminho.startsWith("flow-reel-media/")); assert.equal(req.headers["x-upsert"], "false");
    assert.ok(!objetos.has(caminho)); objetos.set(caminho, { corpo, mime: req.headers["content-type"] });
    json({ Key: caminho });
  } catch (erro) { res.statusCode = 400; res.end("Falha de asserção do servidor local"); console.error(erro.message); }
});
await new Promise((resolve, reject) => { servidor.once("error", reject); servidor.listen(0, "127.0.0.1", resolve); });
try {
  const base = `http://127.0.0.1:${servidor.address().port}`;
  const config = { SUPABASE_URL: base, SUPABASE_PUBLISHABLE_KEY: "sb_publishable_teste_local", SUPABASE_STORAGE_REFRESH_TOKEN: "local-0" };
  const arquivoSessao = resolve(pasta, "sessao-local.json");
  const resultados = [];
  // Pasta nova a cada execução: evita reutilizar uma sessão de um servidor anterior.
  for (const [arquivo, nome, mime] of [[video, "video.mp4", "video/mp4"], [capa, "capa.jpg", "image/jpeg"]]) {
    const url = await uploadSupabase(arquivo, `reels/${nome}`, mime, config, undefined, fetch, { arquivoSessao });
    const download = await fetch(url); assert.equal(download.status, 200); assert.equal(download.headers.get("Content-Type"), mime);
    const original = hash(readFileSync(arquivo)), recebido = hash(Buffer.from(await download.arrayBuffer()));
    assert.equal(recebido, original); resultados.push({ arquivo: nome, sha256: original, download: "idêntico ao original" });
  }
  assert.equal(renovacoes, 2); assert.equal(objetos.size, 2);
  assert.equal(JSON.parse(readFileSync(arquivoSessao)).refreshToken, "local-2");
  const relatorio = { ok: true, servico: "Auth/Storage simulados em HTTP local; sem conexão ao Supabase real", renovacoes, resultados };
  writeFileSync(resolve(pasta, "relatorio-upload-local.json"), JSON.stringify(relatorio, null, 2));
  console.log(JSON.stringify(relatorio));
} finally {
  servidor.closeAllConnections(); await new Promise((resolve) => servidor.close(resolve));
}
