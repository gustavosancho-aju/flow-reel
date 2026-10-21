/**
 * Publica um vídeo como post no seu LinkedIn.
 *
 * Caminho legado da API do LinkedIn (ugcPosts):
 * /v2/assets?action=registerUpload (recipe feedshare-video) → PUT do binário →
 * /v2/ugcPosts com shareMediaCategory VIDEO. Misturar com /rest/videos
 * (urn:li:video) causa "not owned by the author".
 *
 * NUNCA rodar sem ordem explícita do dono do perfil: publicar é público.
 * O token vem de integration_secrets (o cron de refresh o renova); fallback
 * para LINKEDIN_ACCESS_TOKEN do .env.local. Limite do LinkedIn: 5 GB / 10 min.
 *
 * Uso: node publicar-linkedin-video.mjs <video.mp4> <texto.txt> [titulo]
 */
import { readFileSync } from "fs";
import { env, estilo, perfil, ffColor, assColor, rgb, exigir } from "./lib/config.mjs";


const [, , videoPath, textoPath, titulo = "Reel"] = process.argv;
if (!videoPath || !textoPath) {
  console.error("Uso: node publicar-linkedin-video.mjs <video.mp4> <texto.txt> [titulo]");
  process.exit(1);
}

/**
 * Token do LinkedIn: LINKEDIN_ACCESS_TOKEN no .env.local. Opcional: se você guarda o
 * token renovado numa tabela "integration_secrets" do Supabase (chave
 * LINKEDIN_ACCESS_TOKEN), defina LINKEDIN_TOKEN_FROM_SUPABASE=true e ele é lido de lá.
 */
async function token() {
  if (env.LINKEDIN_TOKEN_FROM_SUPABASE === "true" && env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
    const url = env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/+$/, "");
    const key = env.SUPABASE_SERVICE_ROLE_KEY;
    const r = await fetch(`${url}/rest/v1/integration_secrets?select=value&key=eq.LINKEDIN_ACCESS_TOKEN`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    const j = await r.json().catch(() => []);
    if (j?.[0]?.value) return j[0].value;
  }
  return env.LINKEDIN_ACCESS_TOKEN;
}

const TOKEN = await token();
if (!TOKEN) throw new Error("sem token do LinkedIn: defina LINKEDIN_ACCESS_TOKEN no .env.local");
const H = { Authorization: `Bearer ${TOKEN}`, "X-Restli-Protocol-Version": "2.0.0", "Content-Type": "application/json" };

const info = await (await fetch("https://api.linkedin.com/v2/userinfo", { headers: H })).json();
if (!info.sub) throw new Error("userinfo falhou: " + JSON.stringify(info).slice(0, 200));
const author = `urn:li:person:${info.sub}`;
console.log("conta:", info.name);

console.log("1/4 registrando upload...");
const reg = await fetch("https://api.linkedin.com/v2/assets?action=registerUpload", {
  method: "POST", headers: H,
  body: JSON.stringify({ registerUploadRequest: {
    recipes: ["urn:li:digitalmediaRecipe:feedshare-video"],
    owner: author,
    serviceRelationships: [{ relationshipType: "OWNER", identifier: "urn:li:userGeneratedContent" }],
  } }),
});
const regJ = await reg.json();
if (!reg.ok) throw new Error(`registerUpload ${reg.status}: ${JSON.stringify(regJ).slice(0, 300)}`);
const uploadUrl = regJ.value?.uploadMechanism?.["com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"]?.uploadUrl;
const asset = regJ.value?.asset;
if (!uploadUrl || !asset) throw new Error("registerUpload sem uploadUrl/asset");
console.log("    asset:", asset);

console.log("2/4 enviando o arquivo...");
const bin = readFileSync(videoPath);
const up = await fetch(uploadUrl, {
  method: "PUT",
  headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/octet-stream" },
  body: bin,
});
if (!up.ok && up.status !== 201) throw new Error(`upload ${up.status}: ${(await up.text()).slice(0, 200)}`);
console.log(`    ${(bin.length / 1048576).toFixed(1)} MB enviados (HTTP ${up.status})`);

console.log("3/4 aguardando o processamento do vídeo...");
const id = asset.split(":").pop();
let pronto = false;
for (let i = 0; i < 40; i++) {
  await new Promise((r) => setTimeout(r, 5000));
  const s = await fetch(`https://api.linkedin.com/v2/assets/${id}`, { headers: H });
  const sj = await s.json().catch(() => ({}));
  const st = sj.recipes?.[0]?.status;
  process.stdout.write(`    ${(i + 1) * 5}s: ${st ?? s.status}\n`);
  if (st === "AVAILABLE") { pronto = true; break; }
  if (st === "CLIENT_ERROR" || st === "SERVER_ERROR") throw new Error("processamento falhou: " + JSON.stringify(sj).slice(0, 300));
}
if (!pronto) throw new Error("vídeo não ficou AVAILABLE em 200s");

console.log("4/4 publicando...");
const texto = readFileSync(textoPath, "utf-8").trim();
const post = await fetch("https://api.linkedin.com/v2/ugcPosts", {
  method: "POST", headers: H,
  body: JSON.stringify({
    author,
    lifecycleState: "PUBLISHED",
    specificContent: { "com.linkedin.ugc.ShareContent": {
      shareCommentary: { text: texto },
      shareMediaCategory: "VIDEO",
      media: [{ status: "READY", media: asset, title: { text: titulo } }],
    } },
    visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
  }),
});
const pid = post.headers.get("x-restli-id") || (await post.json().catch(() => ({}))).id;
if (!post.ok) throw new Error(`ugcPosts ${post.status}: ${(await post.text().catch(() => "")).slice(0, 300)}`);
console.log("\nPUBLICADO:", `https://www.linkedin.com/feed/update/${pid}/`);
