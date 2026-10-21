/**
 * Publica um Reel no Instagram: cria o container, espera o processamento
 * terminar de verdade (polling do status_code) e só então publica.
 *
 * NUNCA chamar sem confirmação explícita do dono do perfil — publicar é uma ação
 * pública e difícil de desfazer.
 *
 * Uso: node publicar-instagram.mjs <video_url_publica> <cover_url_publica> <arquivo-legenda.txt>
 * Lê META_ACCESS_TOKEN e INSTAGRAM_BUSINESS_ACCOUNT_ID do .env.local (veja .env.exemplo).
 */
import { readFileSync } from "fs";
import { env, estilo, perfil, ffColor, assColor, rgb, exigir } from "./lib/config.mjs";


const TOKEN = env.META_ACCESS_TOKEN;
const IG = (env.INSTAGRAM_BUSINESS_ACCOUNT_ID || "").replace(/[^0-9]/g, "");
const API = "https://graph.facebook.com/v21.0";

const [, , videoUrl, coverUrl, captionPath] = process.argv;
if (!videoUrl || !coverUrl || !captionPath) {
  console.error("Uso: node publicar-instagram.mjs <video_url> <cover_url> <legenda.txt>");
  process.exit(1);
}
const caption = readFileSync(captionPath, "utf-8").trim();

async function post(path, params) {
  const body = new URLSearchParams({ ...params, access_token: TOKEN });
  const r = await fetch(`${API}${path}`, { method: "POST", body });
  const d = await r.json();
  if (!r.ok || d.error) throw new Error(JSON.stringify(d.error ?? d).slice(0, 400));
  return d;
}

console.log("1/3 criando container...");
const container = await post(`/${IG}/media`, {
  media_type: "REELS",
  video_url: videoUrl,
  cover_url: coverUrl,
  caption,
  share_to_feed: "true",
});
console.log(`    container: ${container.id}`);

console.log("2/3 aguardando processamento do vídeo...");
let pronto = false;
for (let i = 0; i < 40; i++) {
  await new Promise((r) => setTimeout(r, 5000));
  const r = await fetch(`${API}/${container.id}?fields=status_code,status&access_token=${TOKEN}`);
  const d = await r.json();
  const s = d.status_code;
  process.stdout.write(`    ${(i + 1) * 5}s: ${s ?? "?"}\n`);
  if (s === "FINISHED") { pronto = true; break; }
  if (s === "ERROR" || s === "EXPIRED") {
    throw new Error(`container falhou: ${JSON.stringify(d).slice(0, 300)}`);
  }
}
if (!pronto) throw new Error("container não ficou pronto em 200s");

console.log("3/3 publicando...");
const publicado = await post(`/${IG}/media_publish`, { creation_id: container.id });
console.log(`    media id: ${publicado.id}`);

const perm = await fetch(`${API}/${publicado.id}?fields=permalink,media_type&access_token=${TOKEN}`);
const pd = await perm.json();
console.log(`\nPUBLICADO: ${pd.permalink ?? "(sem permalink)"}`);
console.log(`tipo: ${pd.media_type ?? "?"}`);
