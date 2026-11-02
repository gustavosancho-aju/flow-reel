/**
 * Prepara um vídeo bruto para entrar no Passo 3, sem Google Flow.
 * Uso: node scripts/preparar-video-gravado.mjs <bruto> <pasta-projeto> [9:16|16:9]
 * Sem formato explícito, infere pela orientação de exibição do vídeo.
 * Preserva o bruto; normaliza com faixas (sem recortar nem distorcer).
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { obterFormato } from "./lib/formato.mjs";

const [, , entrada, pasta, formatoArg] = process.argv;
if (!entrada || !pasta) {
  console.error("Uso: node scripts/preparar-video-gravado.mjs <bruto> <pasta-projeto> [9:16|16:9]");
  process.exit(1);
}
const origem = resolve(entrada);
const diretorio = resolve(pasta);
const probe = JSON.parse(execFileSync("ffprobe", [
  "-v", "error", "-show_streams", "-show_format", "-of", "json", origem,
], { encoding: "utf8" }));
const video = probe.streams.find((s) => s.codec_type === "video");
if (!video || !probe.streams.some((s) => s.codec_type === "audio")) {
  throw new Error("O vídeo gravado precisa de imagem e áudio para transcrição e corte de silêncio.");
}
const rotacao = Number(video.side_data_list?.find((s) => s.rotation != null)?.rotation ?? video.tags?.rotate ?? 0);
const [sarN, sarD] = (video.sample_aspect_ratio || "1:1").split(":").map(Number);
const larguraExibida = video.width * (sarN && sarD ? sarN / sarD : 1);
const girado = Math.abs(rotacao) % 180 === 90;
const horizontal = girado ? video.height > larguraExibida : larguraExibida > video.height;
const formato = obterFormato(formatoArg ?? (horizontal ? "16:9" : "9:16"));
const base = resolve(diretorio, "base.mp4");
const audio = resolve(diretorio, "voz16.mp3");
const manifesto = resolve(diretorio, "projeto.json");
for (const arquivo of [base, audio, manifesto]) {
  if (existsSync(arquivo)) throw new Error(`Saída já existe: ${arquivo}. Escolha outra pasta.`);
}
mkdirSync(diretorio, { recursive: true });
execFileSync("ffmpeg", [
  "-n", "-v", "error", "-i", origem, "-map", "0:v:0", "-map", "0:a:0",
  "-vf", `scale=${formato.largura}:${formato.altura}:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=${formato.largura}:${formato.altura}:(ow-iw)/2:(oh-ih)/2,setsar=1`,
  "-r", "30", "-c:v", "libx264", "-crf", "18", "-preset", "fast", "-pix_fmt", "yuv420p",
  "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", base,
], { stdio: "inherit" });
execFileSync("ffmpeg", ["-n", "-v", "error", "-i", base, "-vn", "-ac", "1", "-ar", "16000", audio], { stdio: "inherit" });
const projeto = { modo: "gravado", origem, formato: formato.nome, largura: formato.largura,
  altura: formato.altura, velocidadeFinal: 1, base, audio, proximoPasso: 3 };
writeFileSync(manifesto, JSON.stringify(projeto, null, 2) + "\n");
console.log(JSON.stringify(projeto));
