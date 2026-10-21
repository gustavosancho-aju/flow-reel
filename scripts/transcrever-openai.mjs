/**
 * Transcreve um audio/video usando gpt-4o-transcribe (OpenAI), com e sem
 * pista de vocabulario, pra comparar como o modelo ouve nomes de marca.
 * Uso: node transcrever-openai.mjs <arquivo>
 */
import { readFileSync } from "fs";
import { basename } from "path";
import { env, estilo, perfil, ffColor, assColor, rgb, exigir } from "./lib/config.mjs";

const file = process.argv[2];
exigir("OPENAI_API_KEY");

async function transcrever(comPista) {
  const form = new FormData();
  form.append("file", new Blob([readFileSync(file)]), basename(file));
  form.append("model", "gpt-4o-transcribe");
  form.append("language", "pt");
  if (comPista) form.append("prompt", "GPT-6, Gemini, Canva, Grok, Claude");
  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: form,
  });
  if (!res.ok) return `[falha ${res.status}] ${(await res.text()).slice(0, 200)}`;
  const data = await res.json();
  return data.text.trim();
}

console.log("sem pista :", await transcrever(false));
console.log("com pista :", await transcrever(true));
