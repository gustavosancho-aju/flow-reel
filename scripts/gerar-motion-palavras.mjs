/**
 * Motion de tipografia cinética: fundo preto e as palavras surgindo uma a uma,
 * sincronizadas com a fala. Feito para entrar SOBRE o vídeo enquanto o áudio
 * original continua correndo por baixo — por isso a peça não tem trilha própria.
 *
 * Uso: node gerar-motion-palavras.mjs <palavras.json> <saida.mp4> [destaque]
 *   palavras.json: [{ texto, offset }] com o offset em segundos a partir do
 *   início da peça.
 */
import { execFileSync } from "child_process";
import { readFileSync, mkdirSync, copyFileSync, existsSync } from "fs";
import { dirname, basename, resolve } from "path";
import { env, estilo, perfil, ffColor, assColor, rgb } from "./lib/config.mjs";

const [, , entrada, saidaPath, destaqueArg] = process.argv;
const palavras = JSON.parse(readFileSync(entrada, "utf-8"));
const DESTAQUE = destaqueArg ? Number(destaqueArg) : palavras.length - 1;

const SAIDA_DIR = dirname(resolve(saidaPath));
mkdirSync(SAIDA_DIR, { recursive: true });
if (!existsSync(resolve(SAIDA_DIR, "fonte.ttf"))) {
  copyFileSync("C:/Windows/Fonts/arialbd.ttf", resolve(SAIDA_DIR, "fonte.ttf"));
}

const FUNDO = ffColor(estilo.cores.fundo);
const VERDE = ffColor(estilo.cores.destaque);
const BRANCO = "0xFFFFFF";
const W = 720;
const H = 1280;
const FPS = 24;

const dur = Number(process.env.DURACAO ?? palavras[palavras.length - 1].offset + 0.9);

const BARRA = String.fromCharCode(92);
const escapar = (e) => e.split(String.fromCharCode(44)).join(BARRA + String.fromCharCode(44));

// corpo cai conforme o número de linhas, para a pilha nunca vazar na vertical
const linhas = palavras.length;
const corpo = linhas <= 3 ? 92 : linhas <= 5 ? 74 : 58;
const passo = Math.round(corpo * 1.28);
const topo = Math.round(H / 2 - (linhas * passo) / 2);

const filtros = palavras.map((p, i) => {
  const t0 = p.offset;
  const cor = i === DESTAQUE ? VERDE : BRANCO;
  // surge com fade curto e subindo alguns pixels
  const a = `if(lt(t,${t0}),0,min((t-${t0})/0.14,1))`;
  const y = `${topo + i * passo}-14*(1-min(max(t-${t0},0)/0.22,1))`;
  return [
    `drawtext=fontfile=fonte.ttf`,
    `text=${p.texto.toUpperCase()}`,
    `fontcolor=${cor}`,
    `fontsize=${corpo}`,
    `x=(w-text_w)/2`,
    `y=${escapar(y)}`,
    `alpha=${escapar(a)}`,
  ].join(":");
});

execFileSync("ffmpeg", [
  "-y", "-v", "error",
  "-f", "lavfi", "-i", `color=c=${FUNDO}:s=${W}x${H}:d=${dur}:r=${FPS}`,
  "-vf", filtros.join(","),
  "-t", String(dur),
  "-an",
  "-c:v", "libx264", "-crf", "20", "-preset", "slow", "-pix_fmt", "yuv420p",
  basename(saidaPath),
], { stdio: "inherit", cwd: SAIDA_DIR });

console.log(`${basename(saidaPath)} · ${dur.toFixed(2)}s · ${linhas} palavras · corpo ${corpo}`);
