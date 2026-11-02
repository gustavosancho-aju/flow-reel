/**
 * Envia mídia a um bucket PRIVADO dedicado e devolve somente a URL assinada.
 * Usa publishable/anon + JWT de usuário autenticado, sujeitos às políticas RLS.
 * Configure references/supabase-storage.sql antes de usar. Nunca usa chave admin.
 * Uso: node scripts/upload-supabase.mjs <arquivo> <destino> <mime> [bucket]
 * O bucket opcional deve coincidir com SUPABASE_STORAGE_BUCKET (flow-reel-media).
 */
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { env } from "./lib/config.mjs";

export function configurarUpload(config, bucketArg) {
  const url = config.SUPABASE_URL || config.NEXT_PUBLIC_SUPABASE_URL;
  for (const [nome, valor] of Object.entries({ SUPABASE_URL: url,
    SUPABASE_PUBLISHABLE_KEY: config.SUPABASE_PUBLISHABLE_KEY,
    SUPABASE_STORAGE_ACCESS_TOKEN: config.SUPABASE_STORAGE_ACCESS_TOKEN })) {
    if (!valor) throw new Error(`Falta ${nome} (veja .env.exemplo).`);
  }
  const base = new URL(url);
  if (base.protocol !== "https:" && !(base.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname))) {
    throw new Error("SUPABASE_URL deve usar HTTPS (HTTP só para localhost).");
  }
  if (base.username || base.password || base.search || base.hash || base.pathname !== "/") {
    throw new Error("SUPABASE_URL deve conter somente a origem do projeto.");
  }
  const claims = (token) => {
    try { return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")); }
    catch { return {}; }
  };
  const key = config.SUPABASE_PUBLISHABLE_KEY;
  if (!key.startsWith("sb_publishable_") && claims(key).role !== "anon") {
    throw new Error("Use uma chave publishable (ou anon legada), sem privilégios administrativos.");
  }
  const token = config.SUPABASE_STORAGE_ACCESS_TOKEN;
  const usuario = claims(token);
  if (usuario.role !== "authenticated" || !usuario.sub) {
    throw new Error("SUPABASE_STORAGE_ACCESS_TOKEN deve ser o JWT de um usuário dedicado autenticado, limitado por RLS.");
  }
  const bucket = config.SUPABASE_STORAGE_BUCKET || "flow-reel-media";
  if (!/^[a-z0-9][a-z0-9-]*$/.test(bucket) || (bucketArg && bucketArg !== bucket)) {
    throw new Error("Use somente o bucket dedicado configurado em SUPABASE_STORAGE_BUCKET.");
  }
  const expiresIn = Number(config.SUPABASE_SIGNED_URL_TTL ?? 21600);
  if (!Number.isInteger(expiresIn) || expiresIn < 300 || expiresIn > 604800) {
    throw new Error("SUPABASE_SIGNED_URL_TTL deve estar entre 300 e 604800 segundos.");
  }
  return { base: base.origin, bucket, expiresIn, key, token };
}

export async function uploadSupabase(arquivo, destino, mime, config = env, bucketArg, request = fetch) {
  const { base, bucket, expiresIn, key, token } = configurarUpload(config, bucketArg);
  const partes = destino.replace(/^\/+/, "").split("/");
  if (partes.some((p) => !p || p === "." || p === ".." || /[\\\x00-\x1f]/.test(p))) {
    throw new Error("Caminho de destino inválido.");
  }
  if (!["video/mp4", "image/jpeg", "image/png", "image/webp"].includes(mime)) {
    throw new Error("MIME não permitido: use video/mp4, image/jpeg, image/png ou image/webp.");
  }
  const caminho = `${bucket}/${partes.map(encodeURIComponent).join("/")}`;
  const headers = { apikey: key, Authorization: `Bearer ${token}` };
  const envio = await request(`${base}/storage/v1/object/${caminho}`, {
    method: "POST", headers: { ...headers, "Content-Type": mime, "x-upsert": "false" },
    body: readFileSync(arquivo),
  });
  // Não ecoa corpo de erro remoto: ele pode conter credenciais ou URLs assinadas.
  if (!envio.ok) throw new Error(`Upload falhou (HTTP ${envio.status}). Confira bucket, RLS, token e nome único do arquivo.`);
  const assinatura = await request(`${base}/storage/v1/object/sign/${caminho}`, {
    method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ expiresIn }),
  });
  if (!assinatura.ok) throw new Error(`URL assinada falhou (HTTP ${assinatura.status}). Confira a política SELECT do bucket.`);
  const { signedURL } = await assinatura.json();
  if (typeof signedURL !== "string" || !signedURL.startsWith(`/object/sign/${bucket}/`)) {
    throw new Error("Resposta de assinatura inválida.");
  }
  return `${base}/storage/v1${signedURL}`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [, , arquivo, destino, mime, bucket] = process.argv;
  if (!arquivo || !destino || !mime) {
    console.error("Uso: node scripts/upload-supabase.mjs <arquivo> <destino> <mime> [bucket]");
    process.exit(1);
  }
  try { console.log(await uploadSupabase(arquivo, destino, mime, env, bucket)); }
  catch (erro) {
    console.error(erro instanceof TypeError ? "Falha de conexão com o Supabase." : erro.message);
    process.exit(1);
  }
}
