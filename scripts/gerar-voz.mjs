/**
 * Gera a voz final do Reel com o método salvo no perfil (scripts/escolher-voz.mjs).
 *
 *   perfil.voz.metodo = "texto"    → PADRÃO: fala por texto (seu clone lendo o roteiro),
 *                                    com sincronia labial por palavra (lib/sincronia.mjs)
 *                       "troca"    → troca de voz (seu clone sobre a fala do avatar)
 *                       "original" → mantém a voz do Flow
 *   Sem método no perfil: usa "texto" se houver chave do ElevenLabs; senão "original".
 *   perfil.voz.ajusteSemitons      → sobe/desce o tom no final (0 = sem ajuste)
 *
 * Depois confere frase a frase com dois transcritores e lista o que precisa refazer.
 * A saída fica na linha do tempo do vídeo limpo (1,0x); a velocidade final é aplicada
 * na montagem (Passo 8).
 *
 * Uso: node scripts/gerar-voz.mjs <limpo.mp4> <frases.json> <saida.wav>
 * Código de saída 3 = alguma frase com erro confirmado pelos dois transcritores.
 */
import { spawnSync } from "child_process";
import { mkdirSync, writeFileSync } from "fs";
import { readFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { RAIZ, env, perfil } from "./lib/config.mjs";
import { conferir } from "./lib/conferir.mjs";
import { ff, duracao, fatorSemitons, WAV_MONO } from "./lib/midia.mjs";

const [, , video, frasesPath, saida] = process.argv;
if (!video || !frasesPath || !saida) {
  console.error("Uso: node scripts/gerar-voz.mjs <limpo.mp4> <frases.json> <saida.wav>");
  process.exit(1);
}
const voz = perfil.voz || {};
const temClone = !!(env.ELEVENLABS_API_KEY && env[voz.voiceIdEnv || "ELEVENLABS_VOICE_ID"]);
const metodo = voz.metodo || (voz.trocarVoz === false || !temClone ? "original" : "texto");
if (!voz.metodo) {
  console.log(`Sem voz escolhida no perfil: usando "${metodo}" (padrão). Para comparar opções: node scripts/escolher-voz.mjs amostras <limpo.mp4> <frases.json>`);
}
const frases = JSON.parse(readFileSync(frasesPath, "utf-8"));
if (metodo === "texto" && !frases.some((f) => f.palavras?.length)) {
  console.log("Aviso: frases.json sem tempos por palavra; a sincronia labial será só por frase. Gere com scripts/frases.mjs.");
}
if (metodo === "texto" && !env.GROQ_API_KEY) {
  console.log("Aviso: sem GROQ_API_KEY a sincronia labial é só por frase (o tempo de cada palavra vem do Groq).");
}
const total = duracao(video);
const trabalho = resolve(dirname(saida), "voz-trabalho");
mkdirSync(trabalho, { recursive: true });
const T = (n) => join(trabalho, n);
const node = (script, ...a) => {
  const r = spawnSync(process.execPath, [resolve(RAIZ, "scripts", script), ...a], { stdio: "inherit" });
  if (r.status !== 0 && r.status !== 3) throw new Error(`${script} falhou (código ${r.status})`);
};

console.log(`Voz: ${metodo}${voz.ajusteSemitons ? `, ${voz.ajusteSemitons > 0 ? "+" : ""}${voz.ajusteSemitons} semitom(ns)` : ""}`);
ff(["-i", video, "-vn", ...WAV_MONO, T("original.wav")]);
let base = T("original.wav");
if (metodo === "troca") {
  node("trocar-voz-elevenlabs.mjs", T("original.wav"), T("troca.mp3"));
  ff(["-i", T("troca.mp3"), "-af", `apad=whole_dur=${total},atrim=0:${total}`, ...WAV_MONO, T("troca.wav")]);
  base = T("troca.wav");
} else if (metodo === "texto") {
  node("gerar-voz-tts.mjs", frasesPath, T("texto.wav"), String(total));
  base = T("texto.wav");
} else if (metodo !== "original") {
  throw new Error(`perfil.voz.metodo desconhecido: ${metodo}`);
}

const semitons = Number(voz.ajusteSemitons || 0);
if (semitons) ff(["-i", base, "-af", `rubberband=pitch=${fatorSemitons(semitons)}:formant=shifted:transients=crisp`, ...WAV_MONO, saida]);
else ff(["-i", base, ...WAV_MONO, saida]);

// conferência frase a frase no áudio final
console.log("\nConferindo frase a frase...");
const resultado = [];
for (let i = 0; i < frases.length; i++) {
  const f = frases[i];
  // janela exata da frase: com folga o trecho pegava a vizinha e gerava avisos falsos
  const ini = f.inicio;
  const trecho = T(`conf_${i + 1}.wav`);
  ff(["-ss", String(ini), "-t", String(f.fim - ini + 0.03), "-i", saida, ...WAV_MONO, trecho]);
  const c = await conferir(trecho, f.esperado || f.texto);
  resultado.push({ n: i + 1, texto: f.texto, veredito: c.veredito, ouvido: c.leituras.map((l) => `${l.transcritor}: ${l.texto}`) });
  const marca = c.veredito === "ok" ? "ok   " : c.veredito === "aviso" ? "AVISO" : "ERRO ";
  console.log(`${String(i + 1).padStart(2)}. ${marca} ${f.texto}${c.veredito !== "ok" ? `\n      ouvido: ${c.leituras.map((l) => l.texto).join(" | ")}` : ""}`);
}
writeFileSync(saida.replace(/\.wav$/i, "") + ".conferencia.json", JSON.stringify({ metodo, ajusteSemitons: semitons, frases: resultado }, null, 2));
const erros = resultado.filter((r) => r.veredito === "erro").map((r) => r.n);
console.log(`\nok ${saida}${erros.length ? ` · ERRO nas frases ${erros.join(", ")}` : " · todas as frases conferidas"}`);
if (erros.length) {
  console.log(metodo === "texto"
    ? `Reescreva o texto dessas frases no frases.json (ex.: uma vírgula antes da palavra engolida) e rode de novo; só elas são regeradas.`
    : `Na troca de voz, refaça só o trecho errado: veja o Passo 7 do SKILL.md.`);
  process.exit(3);
}
