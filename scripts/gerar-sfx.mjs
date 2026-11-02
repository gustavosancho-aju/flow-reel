/**
 * Sintetiza a trilha de efeitos (sem banco de áudio externo) e mixa com a
 * voz, baixando os efeitos sozinhos enquanto há fala (sidechain). Sem o
 * ducking, o whoosh do corte mascara a primeira palavra da frase (medido: a
 * transcrição passou a ouvir "Pega" em vez de "Pede" e "Goldsonet" em vez de
 * "Sonnet").
 *
 * Uso: node gerar-sfx.mjs <cues.json> <voz.wav> <saida-mix.wav> [tempo]
 *   cues.json = { "duracao": 42.2, "cortes": [3.5, ...], "checks": [...],
 *                 "pops": [...], "alertas": [...] }
 *   tempo     = 1.1 aplica atempo no mix (o vídeo precisa do setpts=PTS/1.1)
 */
import { readFileSync, writeFileSync } from "fs";
import { spawnSync } from "child_process";

const [, , cuesPath, voz, saida, tempo] = process.argv;
if (!cuesPath || !voz || !saida) {
  console.error("Uso: node gerar-sfx.mjs <cues.json> <voz.wav> <saida.wav> [tempo]");
  process.exit(1);
}
const c = JSON.parse(readFileSync(cuesPath, "utf-8"));
if (!Number.isFinite(c.duracao) || c.duracao <= 0) throw new Error("cues.duracao deve ser um número positivo.");
if (tempo !== undefined && (!Number.isFinite(Number(tempo)) || Number(tempo) < 0.5 || Number(tempo) > 100)) {
  throw new Error("tempo deve ser um número entre 0.5 e 100.");
}
function ffmpeg(args) {
  const r = spawnSync("ffmpeg", args, { stdio: "inherit", shell: false });
  if (r.error) throw new Error("Não foi possível executar ffmpeg.");
  if (r.status !== 0) throw new Error(`ffmpeg falhou (código ${r.status ?? r.signal}).`);
}
const ins = [], fc = [], outs = [];
let n = 0;
const add = (src, t, vol) => {
  if (!Number.isFinite(t)) throw new Error("Tempos dos efeitos devem ser números finitos.");
  ins.push(...src);
  const ms = Math.max(0, Math.round(t * 1000));
  fc.push(`[${n}:a]adelay=${ms}|${ms},volume=${vol}[s${n}]`);
  outs.push(`[s${n}]`);
  n++;
};
const WHOOSH = ["-f", "lavfi", "-t", "0.45", "-i", "anoisesrc=color=pink:amplitude=0.9,highpass=f=500,lowpass=f=7000,afade=t=in:d=0.18,afade=t=out:st=0.2:d=0.25"];
const DING = ["-f", "lavfi", "-t", "0.6", "-i", "aevalsrc=0.5*sin(2*PI*1320*t)*exp(-6*t)+0.3*sin(2*PI*1980*t)*exp(-8*t):s=44100"];
const POP = ["-f", "lavfi", "-t", "0.15", "-i", "aevalsrc=0.6*sin(2*PI*(500+900*t)*t)*exp(-30*t):s=44100"];
const BUZZ = ["-f", "lavfi", "-t", "0.35", "-i", "aevalsrc=0.4*sin(2*PI*220*t)*(0.5+0.5*sin(2*PI*30*t))*exp(-4*t):s=44100"];
(c.cortes || []).forEach((t) => add(WHOOSH, t - 0.18, 0.5));
(c.checks || []).forEach((t) => add(DING, t, 0.45));
(c.pops || []).forEach((t) => add(POP, t, 0.32));
(c.alertas || []).forEach((t) => add(BUZZ, t, 0.45));

const sfx = saida.replace(/\.wav$/, "") + "-sfx.wav";
if (n) {
  ffmpeg(["-y", "-v", "error", ...ins, "-filter_complex",
    `${fc.join(";")};${outs.join("")}amix=inputs=${n}:normalize=0,alimiter=limit=0.9,apad=whole_dur=${c.duracao}[o]`,
    "-map", "[o]", "-t", String(c.duracao), "-ar", "44100", "-ac", "1", sfx]);
} else {
  ffmpeg(["-y", "-v", "error", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono", "-t", String(c.duracao), sfx]);
}
const at = tempo ? `,atempo=${tempo}` : "";
ffmpeg(["-y", "-v", "error", "-i", voz, "-i", sfx, "-filter_complex",
  `[1:a]volume=0.6[s];[s][0:a]sidechaincompress=threshold=0.015:ratio=10:attack=3:release=250[d];[0:a][d]amix=inputs=2:normalize=0:duration=first,alimiter=limit=0.95${at}[o]`,
  "-map", "[o]", "-ar", "44100", "-ac", "1", "-acodec", "pcm_s16le", saida]);
console.log("ok", saida, `(${n} efeitos)`);
