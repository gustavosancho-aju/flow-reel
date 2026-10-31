/**
 * Fala por texto: gera a narração do zero com a sua voz clonada no ElevenLabs, frase
 * por frase, e encaixa cada frase na janela em que o avatar fala (a boca bate no começo
 * e no fim de cada frase).
 *
 * Cada frase é conferida DEPOIS do encaixe (esticar o áudio já apagou um "o") por dois
 * transcritores (lib/conferir.mjs). Se os dois ouvirem diferente do roteiro, refaz
 * (até 3 takes, variando a estabilidade). Frases aprovadas ficam em cache: rodar de novo
 * só gera o que mudou (texto, janela ou ajuste) ou o que você mandar refazer.
 *
 * Entrada: frases.json (gerado por scripts/frases.mjs) = [{ texto, inicio, fim }, ...]
 * Uso: node scripts/gerar-voz-tts.mjs <frases.json> <saida.wav> <duracao-total-s> [--refazer 3,7]
 * Ajustes em perfil.voz.texto: { modelo, stability, similarity, style, speed }
 *   (padrão eleven_v4, 0.5, 0.9, 0.2, 1.1). A voz vem de perfil.voz.voiceIdEnv.
 * Saída: <saida.wav> (mono 44,1 kHz), <saida>.relatorio.json e a pasta de cache <saida>.frases/
 */
import { createHash } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { env, perfil, exigir } from "./lib/config.mjs";
import { conferir } from "./lib/conferir.mjs";
import { ff, duracao, SEM_SILENCIO_NAS_PONTAS, WAV_MONO } from "./lib/midia.mjs";

const args = process.argv.slice(2);
const iRef = args.indexOf("--refazer");
const refazer = new Set(iRef >= 0 ? String(args[iRef + 1] || "").split(",").map((x) => Number(x)) : []);
if (iRef >= 0) args.splice(iRef, 2);
const [frasesPath, saida, duracaoTotal] = args;
if (!frasesPath || !saida || !duracaoTotal) {
  console.error("Uso: node scripts/gerar-voz-tts.mjs <frases.json> <saida.wav> <duracao-total-s> [--refazer 3,7]");
  process.exit(1);
}
const VOICE_ENV = perfil.voz?.voiceIdEnv || "ELEVENLABS_VOICE_ID";
exigir("ELEVENLABS_API_KEY", VOICE_ENV);

const cfg = { modelo: "eleven_v4", stability: 0.5, similarity: 0.9, style: 0.2, speed: 1.1, ...(perfil.voz?.texto || {}) };
const frases = JSON.parse(readFileSync(frasesPath, "utf-8"));
const cache = saida.replace(/\.wav$/i, "") + ".frases";
mkdirSync(cache, { recursive: true });

async function tts(texto, anterior, proxima, stability) {
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${env[VOICE_ENV]}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": env.ELEVENLABS_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      text: texto,
      model_id: cfg.modelo,
      language_code: "pt",
      voice_settings: { stability, similarity_boost: cfg.similarity, style: cfg.style, use_speaker_boost: true, speed: cfg.speed },
      previous_text: anterior,
      next_text: proxima,
    }),
  });
  if (!r.ok) throw new Error(`ElevenLabs ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return { audio: Buffer.from(await r.arrayBuffer()), creditos: Number(r.headers.get("character-cost") || 0) };
}

let creditos = 0;
const relatorio = [];
for (let i = 0; i < frases.length; i++) {
  const f = frases[i];
  const n = i + 1;
  const janela = +(f.fim - f.inicio).toFixed(3);
  const esperado = f.esperado || f.texto;
  const chave = createHash("sha1").update(JSON.stringify([f.texto, janela, cfg, env[VOICE_ENV]])).digest("hex").slice(0, 12);
  const wav = join(cache, `f${n}.wav`);
  const meta = join(cache, `f${n}.json`);
  if (!refazer.has(n) && existsSync(wav) && existsSync(meta) && JSON.parse(readFileSync(meta, "utf-8")).chave === chave) {
    const m = JSON.parse(readFileSync(meta, "utf-8"));
    relatorio.push(m);
    console.log(`${String(n).padStart(2)}. (cache) ${f.texto.slice(0, 48)}`);
    continue;
  }
  const stabs = [cfg.stability, Math.min(1, cfg.stability + 0.15), Math.max(0, cfg.stability - 0.15)];
  let melhor = null;
  for (let t = 0; t < stabs.length; t++) {
    const { audio, creditos: c } = await tts(f.texto, frases[i - 1]?.texto, frases[i + 1]?.texto, stabs[t]);
    creditos += c;
    const bruto = join(cache, `f${n}_t${t + 1}.mp3`);
    const limpo = join(cache, `f${n}_t${t + 1}_limpo.wav`);
    const fit = join(cache, `f${n}_t${t + 1}_fit.wav`);
    writeFileSync(bruto, audio);
    ff(["-i", bruto, "-af", SEM_SILENCIO_NAS_PONTAS, ...WAV_MONO, limpo]);
    const natural = duracao(limpo);
    const fator = Math.min(1.6, Math.max(0.75, natural / janela)); // >1 acelera, <1 desacelera
    ff(["-i", limpo, "-af", `atempo=${fator.toFixed(4)},apad=whole_dur=${janela},atrim=0:${janela}`, ...WAV_MONO, fit]);
    const conf = await conferir(fit, esperado);
    const tentativa = { n, texto: f.texto, chave, take: t + 1, stability: stabs[t], janela, natural: +natural.toFixed(2), fator: +fator.toFixed(3), cortada: natural / fator > janela + 0.05, conferencia: conf, arquivo: fit };
    if (!melhor || conf.melhor < melhor.conferencia.melhor) melhor = tentativa;
    if (conf.veredito !== "erro") break;
    console.log(`    take ${t + 1} não passou: "${conf.leituras.map((l) => l.texto).join('" / "')}"`);
  }
  ff(["-i", melhor.arquivo, ...WAV_MONO, wav]);
  const { arquivo, ...registro } = melhor;
  writeFileSync(meta, JSON.stringify(registro, null, 1));
  relatorio.push(registro);
  const v = melhor.conferencia.veredito;
  console.log(`${String(n).padStart(2)}. ${v === "ok" ? "ok   " : v === "aviso" ? "AVISO" : "ERRO "} ${f.texto.slice(0, 44).padEnd(44)} natural ${melhor.natural}s · janela ${janela}s · fator ${melhor.fator} · take ${melhor.take}${melhor.cortada ? " · CORTADA (frase longa para a janela)" : ""}`);
}

// posiciona cada frase no seu início e soma tudo numa faixa só
const ins = [];
const fc = [];
frases.forEach((f, i) => {
  ins.push("-i", join(cache, `f${i + 1}.wav`));
  const ms = Math.round(f.inicio * 1000);
  fc.push(`[${i}:a]adelay=${ms}|${ms}[a${i}]`);
});
ff([...ins, "-filter_complex", `${fc.join(";")};${frases.map((_, i) => `[a${i}]`).join("")}amix=inputs=${frases.length}:normalize=0,apad=whole_dur=${duracaoTotal},atrim=0:${duracaoTotal}[o]`, "-map", "[o]", ...WAV_MONO, saida]);

const erros = relatorio.filter((r) => r.conferencia?.veredito === "erro").map((r) => r.n);
writeFileSync(saida.replace(/\.wav$/i, "") + ".relatorio.json", JSON.stringify({ cfg, creditos, erros, frases: relatorio }, null, 2));
console.log(`ok ${saida} · créditos ElevenLabs nesta rodada: ${creditos}${erros.length ? ` · FRASES COM ERRO: ${erros.join(", ")} (reescreva o texto delas no frases.json ou rode com --refazer ${erros.join(",")})` : ""}`);
if (erros.length) process.exit(3);
