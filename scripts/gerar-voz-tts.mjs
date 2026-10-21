/**
 * Gera a fala do Reel do ZERO (texto para voz) com a sua voz clonada no ElevenLabs,
 * frase por frase, e encaixa cada frase na janela de tempo em que o avatar fala,
 * para a boca continuar batendo no começo e no fim de cada frase.
 *
 * Alternativa à troca de voz (trocar-voz-elevenlabs.mjs): a troca de voz mantém o
 * ritmo e a gravidade da voz sintética do Flow; aqui o ritmo e o timbre vêm do clone.
 * Limite conhecido: dentro da frase a boca só bate no começo e no fim.
 *
 * Entrada: frases.json = [{ "texto": "...", "inicio": 0.02, "fim": 1.6, "esperado": "(opcional) como o transcritor deve ouvir, ex.: 150 em vez de cento e cinquenta" }, ...]
 *          (tempos em segundos no vídeo limpo, 1,0x; use os de palavras.json)
 * Cada frase é CONFERIDA por transcrição (OpenAI) e regerada até 3 vezes se o texto não bater
 * (a fala por texto já comeu "o" e trocou "com direito a" por "empreguei pra"). Exige OPENAI_API_KEY.
 * Uso: node scripts/gerar-voz-tts.mjs <frases.json> <saida.wav> <duracao-total-s> [modelo] [stability] [similarity] [style] [speed]
 *      Padrão: eleven_v4, 0.5, 0.9, 0.2, 1.1. A voz vem de perfil.voz.voiceIdEnv.
 * Saída: <saida.wav> (mono 44,1 kHz) e <saida>.relatorio.json com o fator de ajuste de cada frase.
 */
import { spawnSync } from "child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { env, perfil, exigir } from "./lib/config.mjs";

const [, , frasesPath, saida, duracao, modelo = "eleven_v4", stab = "0.5", sim = "0.9", style = "0.2", speed = "1.1"] = process.argv;
if (!frasesPath || !saida || !duracao) {
  console.error("Uso: node scripts/gerar-voz-tts.mjs <frases.json> <saida.wav> <duracao-total-s> [modelo] [stability] [similarity] [style] [speed]");
  process.exit(1);
}
const VOICE_ENV = perfil.voz?.voiceIdEnv || "ELEVENLABS_VOICE_ID";
exigir("ELEVENLABS_API_KEY", VOICE_ENV, "OPENAI_API_KEY");

const frases = JSON.parse(readFileSync(frasesPath, "utf-8"));
const dir = mkdtempSync(join(tmpdir(), "flowreel-tts-"));
const ff = (args) => {
  const r = spawnSync("ffmpeg", ["-y", "-v", "error", ...args], { encoding: "utf-8" });
  if (r.status !== 0) throw new Error("ffmpeg: " + r.stderr);
};
const dur = (arq) => Number(spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", arq], { encoding: "utf-8" }).stdout);

const norm = (t) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/r\$\s*/g, "").replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
function distancia(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
async function ouvir(arq) {
  const form = new FormData();
  form.append("file", new Blob([readFileSync(arq)]), "frase.mp3");
  form.append("model", "gpt-4o-transcribe");
  form.append("language", "pt");
  const r = await fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` }, body: form });
  if (!r.ok) throw new Error("transcrição " + r.status);
  return (await r.json()).text || "";
}
const partes = [];
const relatorio = [];
for (let i = 0; i < frases.length; i++) {
  const f = frases[i];
  const body = {
    text: f.texto,
    model_id: modelo,
    language_code: "pt",
    voice_settings: { stability: Number(stab), similarity_boost: Number(sim), style: Number(style), use_speaker_boost: true, speed: Number(speed) },
    previous_text: frases[i - 1]?.texto,
    next_text: frases[i + 1]?.texto,
  };
  const alvo = norm(f.esperado || f.texto);
  let mp3 = null, melhor = 9, ouviu = "", takes = 0;
  for (let t = 1; t <= 3; t++) {
    takes = t;
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${env[VOICE_ENV]}?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "xi-api-key": env.ELEVENLABS_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`ElevenLabs ${r.status}: ${(await r.text()).slice(0, 300)}`);
    const cand = join(dir, `f${i}_t${t}.mp3`);
    writeFileSync(cand, Buffer.from(await r.arrayBuffer()));
    ouviu = await ouvir(cand);
    const taxa = distancia(alvo, norm(ouviu)) / alvo.length;
    if (taxa < melhor) { melhor = taxa; mp3 = cand; }
    if (taxa === 0 || taxa <= 0.08) break;
    console.log(`   take ${t} não bateu (${(taxa * 100).toFixed(0)}% de diferença): "${ouviu}"`);
  }
  // tira silêncio das pontas para medir só a fala
  const limpo = join(dir, `f${i}_limpo.wav`);
  ff(["-i", mp3, "-af", "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05,areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05,areverse", "-ar", "44100", "-ac", "1", limpo]);
  const natural = dur(limpo);
  const janela = f.fim - f.inicio;
  const fator = Math.min(1.6, Math.max(0.75, natural / janela)); // >1 acelera, <1 desacelera
  const fit = join(dir, `f${i}_fit.wav`);
  ff(["-i", limpo, "-af", `atempo=${fator.toFixed(4)},apad=whole_dur=${janela.toFixed(3)},atrim=0:${janela.toFixed(3)}`, "-ar", "44100", "-ac", "1", fit]);
  partes.push({ arq: fit, inicio: f.inicio });
  relatorio.push({ texto: f.texto, takes, diferenca: +melhor.toFixed(3), janela: +janela.toFixed(2), natural: +natural.toFixed(2), fator: +fator.toFixed(3), cortada: natural / fator > janela + 0.05 });
  console.log(`${String(i + 1).padStart(2)}. ${f.texto.slice(0, 40).padEnd(40)} natural ${natural.toFixed(2)}s · janela ${janela.toFixed(2)}s · fator ${fator.toFixed(2)} · takes ${takes} · dif ${(melhor * 100).toFixed(0)}%`);
}

// posiciona cada frase no seu início e soma tudo numa faixa só
const ins = [], fc = [];
partes.forEach((p, i) => {
  ins.push("-i", p.arq);
  const ms = Math.round(p.inicio * 1000);
  fc.push(`[${i}:a]adelay=${ms}|${ms}[a${i}]`);
});
ff([...ins, "-filter_complex", `${fc.join(";")};${partes.map((_, i) => `[a${i}]`).join("")}amix=inputs=${partes.length}:normalize=0,apad=whole_dur=${duracao},atrim=0:${duracao}[o]`, "-map", "[o]", "-ar", "44100", "-ac", "1", "-acodec", "pcm_s16le", saida]);
writeFileSync(saida.replace(/\.wav$/, "") + ".relatorio.json", JSON.stringify({ modelo, stab, sim, style, speed, frases: relatorio }, null, 2));
console.log("ok", saida);
