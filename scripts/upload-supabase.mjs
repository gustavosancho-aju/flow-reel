/**
 * Sobe um arquivo para um bucket do Supabase Storage e devolve a URL pública.
 * Use "post-images" para imagem (capa) e "post-videos" para vídeo — o bucket
 * de imagens costuma RECUSAR vídeo (mimes restritos), por isso o parâmetro
 * de bucket é obrigatório, não um default silencioso.
 *
 * Uso: node upload-supabase.mjs <arquivo-local> <caminho-destino> <mime> <bucket>
 * Ex.: node upload-supabase.mjs capa.jpg reels/capa-2026.jpg image/jpeg post-images
 *      node upload-supabase.mjs reel.mp4 reels/reel-2026.mp4 video/mp4 post-videos
 *
 * Lê NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY do .env.local do projeto.
 */
import { readFileSync } from "fs";
import { env, estilo, perfil, ffColor, assColor, rgb, exigir } from "./lib/config.mjs";


const [, , arquivo, destino, mime, bucket] = process.argv;
if (!arquivo || !destino || !mime || !bucket) {
  console.error("Uso: node upload-supabase.mjs <arquivo> <destino> <mime> <bucket>");
  process.exit(1);
}

const URL_BASE = env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/+$/, "");
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;

const corpo = readFileSync(arquivo);
const caminho = destino.replace(/^\/+/, "");

const res = await fetch(`${URL_BASE}/storage/v1/object/${bucket}/${caminho}`, {
  method: "POST",
  headers: {
    apikey: KEY,
    Authorization: `Bearer ${KEY}`,
    "Content-Type": mime,
    "x-upsert": "true",
  },
  body: corpo,
});
if (!res.ok) {
  console.error(`falha ${res.status}: ${(await res.text()).slice(0, 300)}`);
  process.exit(1);
}
console.log(`${URL_BASE}/storage/v1/object/public/${bucket}/${caminho}`);
