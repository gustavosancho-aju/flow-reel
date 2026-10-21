/**
 * Motion de terminal do Claude Code com o prompt sendo digitado.
 * Feito para a metade de cima de um split screen (personagem embaixo).
 *
 * Uso: node gerar-terminal.mjs <saida.mp4> "<linha 1>" "<linha 2>"
 * Env: DURACAO (segundos, padrão 2.5), ALTURA (px, padrão 640)
 *
 * Sem áudio de propósito: entra por cima do vídeo e o áudio original continua.
 */
import { execFileSync } from "child_process";
import { mkdirSync, copyFileSync, existsSync } from "fs";
import { dirname, basename, resolve } from "path";
import { env, estilo, perfil, ffColor, assColor, rgb } from "./lib/config.mjs";

const [, , saidaPath, linha1 = "", linha2 = ""] = process.argv;
const SAIDA_DIR = dirname(resolve(saidaPath));
mkdirSync(SAIDA_DIR, { recursive: true });
// mono para o terminal, sans para o rótulo — copiadas para evitar o ":" do path
for (const [origem, destino] of [
  ["C:/Windows/Fonts/consolab.ttf", "mono.ttf"],
  ["C:/Windows/Fonts/arialbd.ttf", "fonte.ttf"],
]) {
  if (!existsSync(resolve(SAIDA_DIR, destino))) copyFileSync(origem, resolve(SAIDA_DIR, destino));
}

const BARRA = String.fromCharCode(92);
const VIRGULA = String.fromCharCode(44);
const escapar = (e) => e.split(VIRGULA).join(BARRA + VIRGULA);
// no filtergraph, ':' e '%' dentro de text= também precisam de escape
const escaparTexto = (t) =>
  t.split(VIRGULA).join(BARRA + VIRGULA)
   .split(":").join(BARRA + ":")
   .split("%").join(BARRA + "%");

const DUR = Number(process.env.DURACAO ?? 2.5);
const H = Number(process.env.ALTURA ?? 640);
const W = 720;
const FPS = 24;

const FUNDO = ffColor(estilo.cores.fundo);
const CAIXA = "0x16161C";
const VERDE = ffColor(estilo.cores.destaque);
const BRANCO = "0xE8E8EC";
const CINZA = "0x6B6B78";

const CORPO = 34;
const X = 56;
const Y1 = Math.round(H / 2 - 26);
const Y2 = Y1 + Math.round(CORPO * 1.5);

// tempo gasto digitando: sobra um respiro no fim para o texto ficar legível
const totalChars = linha1.length + linha2.length;
const inicioDigitacao = 0.18;
const fimDigitacao = DUR - 0.45;
const porChar = (fimDigitacao - inicioDigitacao) / Math.max(totalChars, 1);

/** Um drawtext por estado da digitação, habilitado na sua janela de tempo. */
function estados() {
  const out = [];
  for (let i = 0; i <= totalChars; i++) {
    const t0 = inicioDigitacao + i * porChar;
    const t1 = i === totalChars ? DUR : inicioDigitacao + (i + 1) * porChar;
    const l1 = linha1.slice(0, Math.min(i, linha1.length));
    const l2 = i > linha1.length ? linha2.slice(0, i - linha1.length) : "";
    const cursorNa1 = i <= linha1.length;
    out.push({ t0, t1, l1: l1 + (cursorNa1 ? "\u2588" : ""), l2: l2 + (cursorNa1 ? "" : "\u2588") });
  }
  return out;
}

const filtros = [
  // caixa do terminal
  `drawbox=x=32:y=${Math.round(H * 0.16)}:w=${W - 64}:h=${Math.round(H * 0.62)}:color=${CAIXA}:t=fill`,
  // faixa superior da janela + rótulo
  `drawbox=x=32:y=${Math.round(H * 0.16)}:w=${W - 64}:h=44:color=0x1E1E26:t=fill`,
  `drawtext=fontfile=fonte.ttf:text=claude code:fontcolor=${VERDE}:fontsize=22:x=52:y=${Math.round(H * 0.16) + 12}`,
  // linha de comando
  `drawtext=fontfile=mono.ttf:text=>:fontcolor=${VERDE}:fontsize=${CORPO}:x=${X - 26}:y=${Y1}`,
];

for (const e of estados()) {
  const janela = escapar(`between(t,${e.t0.toFixed(3)},${e.t1.toFixed(3)})`);
  if (e.l1) {
    filtros.push(
      `drawtext=fontfile=mono.ttf:text=${escaparTexto(e.l1)}:fontcolor=${BRANCO}:fontsize=${CORPO}:x=${X}:y=${Y1}:enable=${janela}`
    );
  }
  if (e.l2) {
    filtros.push(
      `drawtext=fontfile=mono.ttf:text=${escaparTexto(e.l2)}:fontcolor=${BRANCO}:fontsize=${CORPO}:x=${X}:y=${Y2}:enable=${janela}`
    );
  }
}

// rodapé discreto
filtros.push(
  `drawtext=fontfile=fonte.ttf:text=enviando...:fontcolor=${CINZA}:fontsize=20:x=52:y=${Math.round(H * 0.78) - 34}:enable=${escapar(`gt(t,${(DUR - 0.4).toFixed(2)})`)}`
);

execFileSync("ffmpeg", [
  "-y", "-v", "error",
  "-f", "lavfi", "-i", `color=c=${FUNDO}:s=${W}x${H}:d=${DUR}:r=${FPS}`,
  "-vf", filtros.join(","),
  "-t", String(DUR),
  "-an",
  "-c:v", "libx264", "-crf", "20", "-preset", "slow", "-pix_fmt", "yuv420p",
  basename(saidaPath),
], { stdio: "inherit", cwd: SAIDA_DIR });

console.log(`${basename(saidaPath)} · ${DUR}s · ${W}x${H} · ${totalChars} caracteres digitados`);
