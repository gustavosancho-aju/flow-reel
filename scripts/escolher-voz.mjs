/**
 * Escolha guiada da voz (teste A/B), feita uma vez; o resultado fica salvo no perfil.
 *
 * 1) amostras: pega o começo do Reel (as primeiras frases, ~6s) e gera as opções
 *      A    voz do Flow, sem troca (sem custo)
 *      B    troca de voz: seu clone sobre a fala do avatar (mantém o ritmo do avatar)
 *      B+1  B um semitom acima (sem custo extra)
 *      C    fala por texto: seu clone lendo o roteiro (ritmo e timbre do clone)
 *      C+1  C um semitom acima (sem custo extra)
 *    Monta comparacao.mp4 com o mesmo trecho do vídeo tocando cada opção em sequência,
 *    com a etiqueta na tela, já na velocidade final do perfil. Cada opção é conferida
 *    por transcrição. Custo típico: ~100 créditos para B e ~100 para C.
 *
 *    node scripts/escolher-voz.mjs amostras <limpo.mp4> <frases.json> [segundos=6]
 *
 * 2) gravar: salva a escolha em perfil/perfil.json (voz.metodo e voz.ajusteSemitons).
 *    Os próximos Reels usam scripts/gerar-voz.mjs direto, sem novo teste.
 *
 *    node scripts/escolher-voz.mjs gravar <A|B|B+1|C|C+1|C+2...>
 */
import { spawnSync } from "child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { basename, dirname, join, resolve } from "path";
import { RAIZ, estilo, perfil, usandoExemplo } from "./lib/config.mjs";
import { conferir } from "./lib/conferir.mjs";
import { copiarFonte, ff, duracao, fatorSemitons, WAV_MONO } from "./lib/midia.mjs";

const METODOS = { A: "original", B: "troca", C: "texto" };
const [, , acao, ...resto] = process.argv;

if (acao === "gravar") {
  const id = String(resto[0] || "").toUpperCase();
  const m = id.match(/^([ABC])(?:\+(\d+))?$/);
  if (!m) {
    console.error("Uso: node scripts/escolher-voz.mjs gravar <A|B|B+1|C|C+1|C+2...>");
    process.exit(1);
  }
  if (usandoExemplo.perfil) {
    console.error("Crie perfil/perfil.json antes (Passo 0 do SKILL.md).");
    process.exit(1);
  }
  const caminho = resolve(RAIZ, "perfil/perfil.json");
  const p = JSON.parse(readFileSync(caminho, "utf-8"));
  p.voz = { ...(p.voz || {}), metodo: METODOS[m[1]], ajusteSemitons: Number(m[2] || 0), trocarVoz: m[1] !== "A", escolhidaEm: new Date().toISOString().slice(0, 10) };
  writeFileSync(caminho, JSON.stringify(p, null, 2));
  console.log(`voz salva no perfil: metodo=${p.voz.metodo}, ajusteSemitons=${p.voz.ajusteSemitons}`);
  process.exit(0);
}

if (acao !== "amostras") {
  console.error("Uso:\n  node scripts/escolher-voz.mjs amostras <limpo.mp4> <frases.json> [segundos=6]\n  node scripts/escolher-voz.mjs gravar <A|B|B+1|C|C+1>");
  process.exit(1);
}

const [video, frasesPath, segStr = "6"] = resto;
if (!video || !frasesPath) {
  console.error("Uso: node scripts/escolher-voz.mjs amostras <limpo.mp4> <frases.json> [segundos=6]");
  process.exit(1);
}
const frases = JSON.parse(readFileSync(frasesPath, "utf-8"));
const alvo = Number(segStr);
const k = Math.max(1, frases.findIndex((f) => f.fim - frases[0].inicio >= alvo) + 1 || frases.length);
const trecho = frases.slice(0, k);
const t0 = Math.max(0, trecho[0].inicio - 0.1);
const t1 = trecho[trecho.length - 1].fim + 0.25;
const dur = +(t1 - t0).toFixed(3);
const esperado = trecho.map((f) => f.texto).join(" ");
const vel = Number(perfil.velocidadeFinal || estilo.ritmo?.velocidadeFinal || 1.1);

const pasta = resolve(dirname(frasesPath), "amostras-voz");
mkdirSync(pasta, { recursive: true });
const P = (nome) => join(pasta, nome);
const node = (script, ...a) => {
  const r = spawnSync(process.execPath, [resolve(RAIZ, "scripts", script), ...a], { encoding: "utf-8" });
  process.stdout.write(r.stdout || "");
  if (r.status !== 0 && r.status !== 3) throw new Error(`${script} falhou: ${(r.stderr || r.stdout || "").slice(-500)}`);
  return r.stdout || "";
};

console.log(`Trecho de teste: ${t0.toFixed(2)}–${t1.toFixed(2)}s (${trecho.length} frases): "${esperado}"`);
console.log(`Velocidade da prévia: ${vel}x (perfil.velocidadeFinal)\n`);

// A: a voz que já está no vídeo
ff(["-ss", String(t0), "-t", String(dur), "-i", video, "-vn", ...WAV_MONO, P("A.wav")]);

// B: troca de voz sobre o mesmo trecho
const saidaB = node("trocar-voz-elevenlabs.mjs", P("A.wav"), P("B.mp3"));
const credB = Number((saidaB.match(/créditos:\s*(\d+)/) || [])[1] || 0);
ff(["-i", P("B.mp3"), "-af", `apad=whole_dur=${dur},atrim=0:${dur}`, ...WAV_MONO, P("B.wav")]);

// C: fala por texto, com as janelas deslocadas para o começo do trecho
const sub = trecho.map((f) => ({ ...f, inicio: +(f.inicio - t0).toFixed(3), fim: +(f.fim - t0).toFixed(3) }));
writeFileSync(P("frases-trecho.json"), JSON.stringify(sub, null, 1));
const saidaC = node("gerar-voz-tts.mjs", P("frases-trecho.json"), P("C.wav"), String(dur));
const credC = Number((saidaC.match(/créditos ElevenLabs nesta rodada:\s*(\d+)/) || [])[1] || 0);

// variações de tom (sem custo)
for (const base of ["B", "C"]) {
  ff(["-i", P(`${base}.wav`), "-af", `rubberband=pitch=${fatorSemitons(1)}:formant=shifted:transients=crisp`, ...WAV_MONO, P(`${base}+1.wav`)]);
}

const opcoes = [
  { id: "A", nome: "voz do Flow (sem troca)", creditos: 0 },
  { id: "B", nome: "troca de voz", creditos: credB },
  { id: "B+1", nome: "troca de voz, 1 semitom acima", creditos: 0 },
  { id: "C", nome: "fala por texto", creditos: credC },
  { id: "C+1", nome: "fala por texto, 1 semitom acima", creditos: 0 },
];

// conferência de cada opção (no áudio sem aceleração)
for (const o of opcoes) {
  o.conferencia = await conferir(P(`${o.id}.wav`), esperado);
}

// vídeo de comparação: mesmo trecho, cada opção na velocidade final, com etiqueta
const fonte = estilo.fontes?.titulo?.arquivo;
const fonteLocal = fonte && existsSync(fonte) ? basename(fonte) : null;
if (fonteLocal) copiarFonte(fonte, P(fonteLocal));
const partes = [];
for (const o of opcoes) {
  const etiqueta = `${o.id}  -  ${o.nome}`.replace(/[:',\\]/g, " ");
  const texto = fonteLocal
    ? `,drawtext=fontfile=${fonteLocal}:text='${etiqueta}':x=(w-tw)/2:y=70:fontsize=38:fontcolor=white:box=1:boxcolor=black@0.65:boxborderw=18`
    : `,drawtext=text='${etiqueta}':x=(w-tw)/2:y=70:fontsize=38:fontcolor=white:box=1:boxcolor=black@0.65:boxborderw=18`;
  const saidaClip = `clip_${o.id.replace("+", "mais")}.mp4`;
  ff(["-ss", String(t0), "-t", String(dur), "-i", resolve(video), "-i", `${o.id}.wav`,
    "-filter_complex", `[0:v]setpts=(PTS-STARTPTS)/${vel},scale=720:-2,fps=30${texto}[v];[1:a]rubberband=tempo=${vel}:transients=crisp,aresample=44100[a]`,
    "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-crf", "20", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-shortest", saidaClip], { cwd: pasta });
  partes.push(saidaClip);
}
ff([...partes.flatMap((p) => ["-i", p]), "-filter_complex", `${partes.map((_, i) => `[${i}:v][${i}:a]`).join("")}concat=n=${partes.length}:v=1:a=1[v][a]`, "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-crf", "20", "-pix_fmt", "yuv420p", "-c:a", "aac", "-movflags", "+faststart", "comparacao.mp4"], { cwd: pasta });

const resumo = { trecho: { inicio: t0, fim: t1, texto: esperado }, velocidade: vel, opcoes: opcoes.map(({ id, nome, creditos, conferencia }) => ({ id, nome, creditos, veredito: conferencia.veredito, ouvido: conferencia.leituras.map((l) => `${l.transcritor}: ${l.texto}`) })) };
writeFileSync(P("escolha.json"), JSON.stringify(resumo, null, 2));

console.log("\nOpções (na ordem do vídeo):");
for (const o of resumo.opcoes) console.log(`  ${o.id.padEnd(4)} ${o.nome.padEnd(34)} ${String(o.creditos).padStart(4)} créditos · fala: ${o.veredito}`);
console.log(`\nAssista ${P("comparacao.mp4")} (${(duracao(P("comparacao.mp4"))).toFixed(1)}s) e grave a escolha:`);
console.log("  node scripts/escolher-voz.mjs gravar <ID>");
