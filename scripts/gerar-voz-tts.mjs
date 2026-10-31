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
import { desvio, encaixarPorPalavra, palavrasComTempo } from "./lib/sincronia.mjs";

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
  // palavras do avatar com tempo relativo à janela: base da sincronia labial por palavra
  const alvo = (f.palavras || []).map((p) => ({ w: p.w, inicio: +(p.inicio - f.inicio).toFixed(3) }));
  const porPalavra = alvo.length >= 2 && !!env.GROQ_API_KEY;
  // duas chaves: a da fala gerada (custa crédito) e a do encaixe (grátis). Mudar só o encaixe
  // reaproveita a fala já aprovada e refaz o encaixe, sem chamar o ElevenLabs.
  const ttsChave = createHash("sha1").update(JSON.stringify([f.texto, cfg, env[VOICE_ENV]])).digest("hex").slice(0, 12);
  const chave = createHash("sha1").update(JSON.stringify([ttsChave, janela, porPalavra ? "sync-palavra-2" : "sync-frase", alvo])).digest("hex").slice(0, 12);
  const wav = join(cache, `f${n}.wav`);
  const meta = join(cache, `f${n}.json`);
  if (!refazer.has(n) && existsSync(wav) && existsSync(meta) && JSON.parse(readFileSync(meta, "utf-8")).chave === chave) {
    const m = JSON.parse(readFileSync(meta, "utf-8"));
    relatorio.push(m);
    console.log(`${String(n).padStart(2)}. (cache) ${f.texto.slice(0, 48)}`);
    continue;
  }
  const stabs = [cfg.stability, Math.min(1, cfg.stability + 0.15), Math.max(0, cfg.stability - 0.15)];
  // fala já aprovada antes com o mesmo texto e ajustes? tenta reencaixar ela primeiro (0 crédito)
  const anterior = existsSync(meta) ? JSON.parse(readFileSync(meta, "utf-8")) : null;
  const reaproveitar = !refazer.has(n) && anterior?.ttsChave === ttsChave && anterior.limpo && existsSync(anterior.limpo) ? anterior : null;
  const tentativas = [...(reaproveitar ? [{ reuso: true, take: reaproveitar.take, stability: reaproveitar.stability }] : []), ...stabs.map((s, k) => ({ reuso: false, take: (reaproveitar ? 3 : 0) + k + 1, stability: s }))];
  let melhor = null;
  for (const tent of tentativas) {
    const t = tent.take - 1;
    let limpo;
    if (tent.reuso) {
      limpo = reaproveitar.limpo;
    } else {
      const { audio, creditos: c } = await tts(f.texto, frases[i - 1]?.texto, frases[i + 1]?.texto, tent.stability);
      creditos += c;
      const bruto = join(cache, `f${n}_t${t + 1}.mp3`);
      limpo = join(cache, `f${n}_t${t + 1}_limpo.wav`);
      writeFileSync(bruto, audio);
      ff(["-i", bruto, "-af", SEM_SILENCIO_NAS_PONTAS, ...WAV_MONO, limpo]);
    }
    const fit = join(cache, `f${n}_t${t + 1}_fit.wav`);
    const natural = duracao(limpo);
    const fator = Math.min(1.6, Math.max(0.75, natural / janela)); // >1 acelera, <1 desacelera
    let sincronia = { modo: "frase" };
    if (porPalavra) {
      const fala = await palavrasComTempo(limpo);
      const r = fala.length >= 2 ? encaixarPorPalavra({ entrada: limpo, saida: fit, janela, duracaoFala: natural, alvo, fala, wav: WAV_MONO }) : null;
      if (r) {
        // desvio que o encaixe por frase teria (fala esticada inteira) x o medido depois do encaixe por palavra
        const antes = desvio(alvo, fala.map((p) => ({ ...p, inicio: p.inicio / fator })));
        const depois = desvio(alvo, await palavrasComTempo(fit));
        sincronia = { modo: "palavra", ancoras: r.ancoras.length - 2, fatores: r.fatores, desvioFraseMs: antes === null ? null : Math.round(antes * 1000), desvioPalavraMs: depois === null ? null : Math.round(depois * 1000) };
      }
    }
    if (sincronia.modo === "frase") {
      ff(["-i", limpo, "-af", `atempo=${fator.toFixed(4)},apad=whole_dur=${janela},atrim=0:${janela}`, ...WAV_MONO, fit]);
    }
    const conf = await conferir(fit, esperado);
    const tentativa = { n, texto: f.texto, chave, ttsChave, limpo, reaproveitada: tent.reuso, take: tent.take, stability: tent.stability, janela, natural: +natural.toFixed(2), fator: +fator.toFixed(3), cortada: natural / fator > janela + 0.05, sincronia, conferencia: conf, arquivo: fit };
    if (!melhor || conf.melhor < melhor.conferencia.melhor) melhor = tentativa;
    if (conf.veredito !== "erro") break;
    console.log(`    take ${tent.take}${tent.reuso ? " (reaproveitado)" : ""} não passou: "${conf.leituras.map((l) => l.texto).join('" / "')}"`);
  }
  ff(["-i", melhor.arquivo, ...WAV_MONO, wav]);
  const { arquivo, ...registro } = melhor;
  writeFileSync(meta, JSON.stringify(registro, null, 1));
  relatorio.push(registro);
  const v = melhor.conferencia.veredito;
  console.log(`${String(n).padStart(2)}. ${v === "ok" ? "ok   " : v === "aviso" ? "AVISO" : "ERRO "} ${f.texto.slice(0, 44).padEnd(44)} take ${melhor.take} · ${melhor.sincronia.modo === "palavra" ? `sincronia por palavra (${melhor.sincronia.ancoras} âncoras) · desvio ${melhor.sincronia.desvioFraseMs}ms → ${melhor.sincronia.desvioPalavraMs}ms` : `encaixe por frase · fator ${melhor.fator}`}${melhor.cortada && melhor.sincronia.modo === "frase" ? " · CORTADA (frase longa para a janela)" : ""}`);
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
const sinc = relatorio.filter((r) => r.sincronia?.modo === "palavra" && r.sincronia.desvioPalavraMs !== null);
const media = (k) => (sinc.length ? Math.round(sinc.reduce((s, r) => s + r.sincronia[k], 0) / sinc.length) : null);
const resumoSincronia = { frasesPorPalavra: sinc.length, de: relatorio.length, desvioMedioFraseMs: media("desvioFraseMs"), desvioMedioPalavraMs: media("desvioPalavraMs") };
writeFileSync(saida.replace(/\.wav$/i, "") + ".relatorio.json", JSON.stringify({ cfg, creditos, erros, sincronia: resumoSincronia, frases: relatorio }, null, 2));
if (sinc.length) console.log(`sincronia labial: ${sinc.length}/${relatorio.length} frases por palavra · desvio médio ${resumoSincronia.desvioMedioFraseMs}ms (por frase) → ${resumoSincronia.desvioMedioPalavraMs}ms (por palavra)`);
console.log(`ok ${saida} · créditos ElevenLabs nesta rodada: ${creditos}${erros.length ? ` · FRASES COM ERRO: ${erros.join(", ")} (reescreva o texto delas no frases.json ou rode com --refazer ${erros.join(",")})` : ""}`);
if (erros.length) process.exit(3);
