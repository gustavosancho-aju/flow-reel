/**
 * Configuração central do flow-reel.
 *
 * - env: lê apenas <repo>/.env.local e <repo>/.env, nessa prioridade,
 *   e depois process.env. Nunca procura arquivos na pasta de execução,
 *   nem usa FLOW_REEL_ENV. Nunca imprime valores.
 * - perfil: dados de quem usa (avatar, voz, publicação). perfil/perfil.json
 * - estilo: identidade visual extraída dos vídeos de referência. perfil/estilo.json
 *   Se um dos dois não existir, cai no arquivo .exemplo.json (neutro).
 */
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { RAIZ } from "./raiz.mjs";

export { RAIZ };

function lerEnv(caminho) {
  const out = {};
  for (const linha of readFileSync(caminho, "utf-8").split(/\r?\n/)) {
    const t = linha.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    out[t.slice(0, i).trim()] = t
      .slice(i + 1)
      .trim()
      .replace(/^["']|["']$/g, "")
      .replace(/\\[nr]/g, "") // "\n" literal que o `vercel env pull` deixa no fim do valor
      .trim();
  }
  return out;
}

function carregarEnv() {
  const candidatos = [
    resolve(RAIZ, ".env.local"),
    resolve(RAIZ, ".env"),
  ];
  const env = {};
  for (const c of candidatos.reverse()) if (existsSync(c)) Object.assign(env, lerEnv(c));
  for (const [k, v] of Object.entries(process.env)) if (v && !(k in env)) env[k] = v;
  return env;
}

function lerJson(nome) {
  for (const arq of [`perfil/${nome}.json`, `perfil/${nome}.exemplo.json`]) {
    const p = resolve(RAIZ, arq);
    if (existsSync(p)) return { dados: JSON.parse(readFileSync(p, "utf-8")), arquivo: arq, exemplo: arq.endsWith(".exemplo.json") };
  }
  throw new Error(`perfil/${nome}.json (nem .exemplo.json) não encontrado em ${RAIZ}`);
}

const P = lerJson("perfil");
const E = lerJson("estilo");
export const env = carregarEnv();
export const perfil = P.dados;
export const estilo = E.dados;
export const usandoExemplo = { perfil: P.exemplo, estilo: E.exemplo };

/** "#00FF66" -> "0x00FF66" (ffmpeg drawbox/drawtext) */
export const ffColor = (hex) => "0x" + hex.replace("#", "").toUpperCase();
/** "#00FF66" -> "&H0066FF00&" (BGR do ASS/libass) */
export const assColor = (hex) => {
  const h = hex.replace("#", "").toUpperCase();
  return `&H00${h.slice(4, 6)}${h.slice(2, 4)}${h.slice(0, 2)}&`;
};
/** "#00FF66" -> "0,255,102" (rgba() em CSS) */
export const rgb = (hex) => {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).join(",");
};
/** Exige variáveis de ambiente; encerra com mensagem clara se faltar. */
export function exigir(...chaves) {
  const faltam = chaves.filter((k) => !env[k]);
  if (faltam.length) {
    console.error(`Faltam variáveis no .env: ${faltam.join(", ")} (veja .env.exemplo)`);
    process.exit(1);
  }
}
