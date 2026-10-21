/**
 * Extrai timestamps por palavra de um áudio, para sincronizar legenda dinâmica.
 * Uso: node timestamps-palavras.mjs <audio> <saida.json>
 */
import { readFileSync, writeFileSync } from "fs";
import { basename } from "path";
import { execFileSync } from "child_process";
import { env, estilo, perfil, ffColor, assColor, rgb, exigir } from "./lib/config.mjs";



const [, , audio, saida] = process.argv;
exigir("GROQ_API_KEY");

const form = new FormData();
form.append("file", new Blob([readFileSync(audio)]), basename(audio));
form.append("model", "whisper-large-v3");
form.append("language", "pt");
form.append("response_format", "verbose_json");
form.append("timestamp_granularities[]", "word");

const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
  method: "POST",
  headers: { Authorization: `Bearer ${env.GROQ_API_KEY}` },
  body: form,
});

if (!res.ok) {
  console.error(`Falha ${res.status}: ${(await res.text()).slice(0, 400)}`);
  process.exit(1);
}

const data = await res.json();

// O Whisper alucina em trechos longos de silêncio — em PT costuma inventar
// créditos de legendagem ("Legenda: Fulano") com timestamps além do fim do
// arquivo. Descartar tudo que cai fora da duração real.
const duracao = Number(
  execFileSync("ffprobe", [
    "-v", "error", "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1", audio,
  ]).toString().trim()
);

const todas = (data.words ?? []).map((w) => ({
  texto: w.word.trim(),
  inicio: w.start,
  fim: w.end,
}));
const palavras = todas.filter((p) => p.inicio < duracao - 0.05);
const descartadas = todas.length - palavras.length;
if (descartadas > 0) {
  console.log(`descartadas ${descartadas} palavra(s) fora da duração (${duracao.toFixed(2)}s): ${todas.slice(-descartadas).map((p) => p.texto).join(" ")}`);
}

if (!palavras.length) {
  console.error("Nenhuma palavra com timestamp retornada.");
  process.exit(1);
}

writeFileSync(saida, JSON.stringify(palavras, null, 2), "utf-8");
console.log(`${palavras.length} palavras · ${palavras[0].inicio.toFixed(2)}s → ${palavras[palavras.length - 1].fim.toFixed(2)}s`);
console.log(palavras.slice(0, 8).map((p) => `${p.inicio.toFixed(2)} ${p.texto}`).join("  |  "));
