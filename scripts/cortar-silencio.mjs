/**
 * Remove as pausas de silêncio de um vídeo, preservando uma margem de respiro
 * para o corte não engolir o ataque das palavras.
 *
 * Uso: node cortar-silencio.mjs <entrada.mp4> <saida.mp4> [minSilencio] [margem]
 */
import { execFileSync, spawnSync } from "child_process";
import { writeFileSync } from "fs";

const [, , input, output, minSilArg, padArg] = process.argv;
if (!input || !output) {
  console.error("Uso: node cortar-silencio.mjs <entrada.mp4> <saida.mp4>");
  process.exit(1);
}

const MIN_SILENCIO = Number(minSilArg ?? 0.35); // só corta pausa maior que isso
const MARGEM = Number(padArg ?? 0.10); // respiro mantido em cada ponta
const RUIDO = "-32dB";

function ffprobeDuracao(file) {
  const out = execFileSync("ffprobe", [
    "-v", "error", "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1", file,
  ]).toString();
  return parseFloat(out.trim());
}

function detectarSilencios(file) {
  // o silencedetect reporta em stderr mesmo quando o ffmpeg termina com sucesso,
  // por isso spawnSync (execFileSync devolve apenas stdout)
  const r = spawnSync("ffmpeg", [
    "-hide_banner", "-i", file,
    "-af", `silencedetect=noise=${RUIDO}:d=${MIN_SILENCIO}`,
    "-f", "null", "-",
  ], { encoding: "utf-8" });
  const saida = `${r.stderr ?? ""}${r.stdout ?? ""}`;
  if (!saida.includes("silence_")) {
    console.warn("aviso: nenhum silêncio detectado — conferir limiar de ruído");
  }
  const silencios = [];
  let inicio = null;
  for (const linha of saida.split("\n")) {
    const s = linha.match(/silence_start:\s*(-?[\d.]+)/);
    const e = linha.match(/silence_end:\s*([\d.]+)/);
    if (s) inicio = Math.max(0, parseFloat(s[1]));
    if (e && inicio !== null) {
      silencios.push([inicio, parseFloat(e[1])]);
      inicio = null;
    }
  }
  return silencios;
}

/** Converte os intervalos de silêncio nos trechos de fala que sobram. */
export function calcularTrechos(silencios, duracao, margem) {
  const falas = [];
  let cursor = 0;
  for (const [ini, fim] of silencios) {
    if (ini > cursor) falas.push([cursor, ini]);
    cursor = Math.max(cursor, fim);
  }
  if (cursor < duracao) falas.push([cursor, duracao]);

  // devolve a margem de respiro e descarta fragmentos curtos demais
  const comMargem = falas
    .map(([ini, fim]) => [Math.max(0, ini - margem), Math.min(duracao, fim + margem)])
    .filter(([ini, fim]) => fim - ini > 0.12);

  // funde trechos que voltaram a se tocar depois da margem
  const fundidos = [];
  for (const trecho of comMargem) {
    const ultimo = fundidos[fundidos.length - 1];
    if (ultimo && trecho[0] <= ultimo[1] + 0.02) ultimo[1] = Math.max(ultimo[1], trecho[1]);
    else fundidos.push([...trecho]);
  }
  return fundidos;
}

const duracao = ffprobeDuracao(input);
const silencios = detectarSilencios(input);
const trechos = calcularTrechos(silencios, duracao, MARGEM);

const totalFinal = trechos.reduce((s, [a, b]) => s + (b - a), 0);
console.log(`duração original : ${duracao.toFixed(2)}s`);
console.log(`trechos de fala  : ${trechos.length}`);
console.log(`duração final    : ${totalFinal.toFixed(2)}s (-${(duracao - totalFinal).toFixed(2)}s)`);

const partes = trechos
  .map(([ini, fim], i) =>
    `[0:v]trim=${ini.toFixed(3)}:${fim.toFixed(3)},setpts=PTS-STARTPTS[v${i}];` +
    `[0:a]atrim=${ini.toFixed(3)}:${fim.toFixed(3)},asetpts=PTS-STARTPTS[a${i}]`)
  .join(";");
const refs = trechos.map((_, i) => `[v${i}][a${i}]`).join("");
const filtro = `${partes};${refs}concat=n=${trechos.length}:v=1:a=1[v][a]`;

const filtroPath = output.replace(/\.mp4$/, "-filtro.txt");
writeFileSync(filtroPath, filtro, "utf-8");

execFileSync("ffmpeg", [
  "-y", "-v", "error", "-i", input,
  "-filter_complex_script", filtroPath,
  "-map", "[v]", "-map", "[a]",
  "-c:v", "libx264", "-crf", "27", "-preset", "slow", "-pix_fmt", "yuv420p",
  "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart",
  output,
], { stdio: "inherit" });

console.log(`ok: ${output}`);
