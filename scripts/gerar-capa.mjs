/**
 * Capa de Reel no padrão visual do Instagram: foto real + overlay escuro
 * (cores.fundo) + bloco tipográfico com uma linha na cor de destaque (cores.destaque).
 * Fontes e cores vêm de perfil/estilo.json.
 *
 * Composta em código (e não por modelo de imagem) porque o texto tem acento —
 * e modelo de imagem erra grafia em português. Aqui a tipografia é exata.
 *
 * Uso: node gerar-capa.mjs <foto.jpg> <saida.jpg>
 * Env: L1, L2, L3 (linha verde), SUB
 */
import { execFileSync } from "child_process";
import { mkdirSync, copyFileSync, existsSync } from "fs";
import { dirname, basename, resolve } from "path";
import { env, estilo, perfil, ffColor, assColor, rgb } from "./lib/config.mjs";

const [, , foto, saidaPath] = process.argv;
const DIR = dirname(resolve(saidaPath));
mkdirSync(DIR, { recursive: true });
for (const [origem, destino] of [
  [(estilo.fontes.capaTitulo || estilo.fontes.titulo).arquivo, "black.ttf"],
  [(estilo.fontes.capaCorpo || estilo.fontes.corpo).arquivo, "bold.ttf"],
]) {
  if (!existsSync(resolve(DIR, destino))) copyFileSync(origem, resolve(DIR, destino));
}

const BARRA = String.fromCharCode(92);
const VIRGULA = String.fromCharCode(44);
const esc = (t) => t.split(VIRGULA).join(BARRA + VIRGULA).split(":").join(BARRA + ":");

const W = 1080;
const H = 1920;
const VERDE = ffColor(estilo.cores.destaque);
const BRANCO = ffColor(estilo.cores.texto);
const FUNDO = ffColor(estilo.cores.fundo);

const L1 = process.env.L1 ?? "ESSE VÍDEO";
const L2 = process.env.L2 ?? "EU NÃO GRAVEI";
const L3 = process.env.L3 ?? "FOI UM COMANDO";
const SUB = process.env.SUB ?? "feito com Claude Code";

// O grid do perfil corta o Reel em 4:5 a partir do centro: tudo que importa
// precisa caber entre y=285 e y=1635. O bloco de texto fica dentro disso.
const BASE = 1180;
const P1 = 78;   // corpo das duas primeiras linhas
const P3 = 92;   // linha de destaque, um pouco maior
const X = 84;

const filtros = [
  // preenche 1080x1920 sem distorcer
  `scale=${W}:${H}:force_original_aspect_ratio=increase`,
  `crop=${W}:${H}`,
  // overlay escuro geral, para unificar a composição
  `drawbox=x=0:y=0:w=${W}:h=${H}:color=${FUNDO}@0.42:t=fill`,
  // reforço na base em faixas de opacidade crescente: um drawbox sólido deixa
  // uma emenda dura visível atravessando a foto
  ...Array.from({ length: 26 }, (_, i) => {
    const faixaAltura = Math.ceil((H - (BASE - 300)) / 26);
    const y = BASE - 300 + i * faixaAltura;
    const a = (0.62 * (i + 1)) / 26;
    return `drawbox=x=0:y=${y}:w=${W}:h=${faixaAltura + 1}:color=${FUNDO}@${a.toFixed(3)}:t=fill`;
  }),
  // filete verde da marca
  `drawbox=x=${X}:y=${BASE - 46}:w=96:h=10:color=${VERDE}:t=fill`,
  `drawtext=fontfile=black.ttf:text=${esc(L1)}:fontcolor=${BRANCO}:fontsize=${P1}:x=${X}:y=${BASE}`,
  `drawtext=fontfile=black.ttf:text=${esc(L2)}:fontcolor=${BRANCO}:fontsize=${P1}:x=${X}:y=${BASE + Math.round(P1 * 1.18)}`,
  `drawtext=fontfile=black.ttf:text=${esc(L3)}:fontcolor=${VERDE}:fontsize=${P3}:x=${X}:y=${BASE + Math.round(P1 * 2.36) + 14}`,
  `drawtext=fontfile=bold.ttf:text=${esc(SUB)}:fontcolor=0xB8B8C4:fontsize=40:x=${X}:y=${BASE + Math.round(P1 * 2.36) + P3 + 46}`,
];

execFileSync("ffmpeg", [
  "-y", "-v", "error", "-i", resolve(foto),
  "-vf", filtros.join(","),
  "-frames:v", "1", "-q:v", "2",
  basename(saidaPath),
], { stdio: "inherit", cwd: DIR });

console.log(`${basename(saidaPath)} · ${W}x${H}`);
