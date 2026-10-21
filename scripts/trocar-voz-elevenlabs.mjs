/**
 * Troca a voz sintética do avatar pela sua voz clonada via API do
 * ElevenLabs (Speech to Speech). Mantém o tempo da fala original (desvio
 * médio medido: 0,03s), então a boca continua sincronizada sem realinhar.
 *
 * Configuração padrão validada (versão "A"):
 *   similarity_boost 1.0, stability 0.35 (mais expressiva), style 0,
 *   remove_background_noise true.
 *
 * Requisitos já descobertos:
 *   - a chave ELEVENLABS_API_KEY precisa da permissão "speech_to_speech"
 *     (sem ela: 401 missing_permissions);
 *   - no plano atual só mp3_44100_128 (192 kbps dá 403 subscription_required);
 *   - custo ~705 créditos para ~42s de áudio.
 * A voz vem da variável indicada em perfil.voz.voiceIdEnv (padrão ELEVENLABS_VOICE_ID).
 *
 * Uso: node trocar-voz-elevenlabs.mjs <entrada.wav> <saida.mp3> [stability] [similarity]
 */
import { readFileSync, writeFileSync } from "fs";
import { env, estilo, perfil, ffColor, assColor, rgb, exigir } from "./lib/config.mjs";


const [, , entrada, saida, stab = String(perfil.voz?.stability ?? 0.35), sim = String(perfil.voz?.similarity ?? 1.0)] = process.argv;
const VOICE_ENV = perfil.voz?.voiceIdEnv || "ELEVENLABS_VOICE_ID";
exigir("ELEVENLABS_API_KEY", VOICE_ENV);
if (!entrada || !saida) {
  console.error("Uso: node trocar-voz-elevenlabs.mjs <entrada.wav> <saida.mp3> [stability] [similarity]");
  process.exit(1);
}

const fd = new FormData();
fd.append("audio", new Blob([readFileSync(entrada)], { type: "audio/wav" }), "voz.wav");
fd.append("model_id", "eleven_multilingual_sts_v2");
fd.append("voice_settings", JSON.stringify({
  stability: Number(stab), similarity_boost: Number(sim), style: 0, use_speaker_boost: true,
}));
fd.append("remove_background_noise", "true");

const r = await fetch(
  `https://api.elevenlabs.io/v1/speech-to-speech/${env[VOICE_ENV]}?output_format=mp3_44100_128`,
  { method: "POST", headers: { "xi-api-key": env.ELEVENLABS_API_KEY }, body: fd }
);
if (!r.ok) {
  console.error("erro", r.status, (await r.text()).slice(0, 400));
  process.exit(1);
}
writeFileSync(saida, Buffer.from(await r.arrayBuffer()));
console.log("ok", saida, "créditos:", r.headers.get("character-cost") || "?");
