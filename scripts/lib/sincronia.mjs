/**
 * Sincronia labial por palavra para a fala por texto.
 *
 * A boca do avatar foi gerada com a voz do Flow. Quando trocamos por uma fala gerada do
 * zero, cada palavra chega num instante diferente. O encaixe por frase (esticar a frase
 * inteira) só acerta o começo e o fim. Aqui:
 *   1. medimos quando a voz nova fala cada palavra (Whisper/Groq com tempo por palavra);
 *   2. casamos com o instante em que o avatar fala a mesma palavra (frases.json → palavras);
 *   3. cada casamento vira uma âncora; o áudio entre âncoras vizinhas é esticado ou
 *      comprimido (0,8 a 1,35x) para caber no intervalo do avatar. Os trechos entram em
 *      sequência e nunca se sobrepõem: se um atrasa, o seguinte começa logo depois e
 *      recupera o tempo. Se a frase não couber na janela assim, cai no encaixe por frase.
 */
import { readFileSync } from "fs";
import { basename } from "path";
import { env } from "./config.mjs";
import { normalizar, postComRetry } from "./conferir.mjs";
import { ff } from "./midia.mjs";

/** Palavras com tempo (Groq whisper-large-v3, granularidade de palavra), já normalizadas. */
export async function palavrasComTempo(arquivo) {
  const montar = () => {
    const form = new FormData();
    form.append("file", new Blob([readFileSync(arquivo)]), basename(arquivo));
    form.append("model", "whisper-large-v3");
    form.append("language", "pt");
    form.append("response_format", "verbose_json");
    form.append("timestamp_granularities[]", "word");
    return form;
  };
  const r = await postComRetry("https://api.groq.com/openai/v1/audio/transcriptions", { Authorization: `Bearer ${env.GROQ_API_KEY}` }, montar);
  if (!r.ok) throw new Error(`palavras com tempo ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  const out = [];
  for (const p of j.words || []) for (const w of normalizar(p.word)) out.push({ w, inicio: p.start, fim: p.end });
  return out;
}

/** Casa duas listas de palavras normalizadas (só pares idênticos), preservando a ordem. */
export function alinhar(a, b) {
  const n = a.length, m = b.length;
  const d = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = 0; i <= n; i++) d[i][0] = i;
  for (let j = 0; j <= m; j++) d[0][j] = j;
  for (let i = 1; i <= n; i++)
    for (let j = 1; j <= m; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1].w === b[j - 1].w ? 0 : 1));
  const pares = [];
  for (let i = n, j = m; i > 0 && j > 0; ) {
    const igual = a[i - 1].w === b[j - 1].w;
    if (d[i][j] === d[i - 1][j - 1] + (igual ? 0 : 1)) { if (igual) pares.push([i - 1, j - 1]); i--; j--; }
    else if (d[i][j] === d[i - 1][j] + 1) i--;
    else j--;
  }
  return pares.reverse();
}

/** Desvio médio (s) entre o início de cada palavra falada e o início da mesma palavra no avatar. */
export function desvio(alvo, fala) {
  const pares = alinhar(alvo, fala);
  if (!pares.length) return null;
  return pares.reduce((s, [i, j]) => s + Math.abs(alvo[i].inicio - fala[j].inicio), 0) / pares.length;
}

/**
 * Encaixa `entrada` (fala sem silêncio nas pontas, começa em 0) na janela da frase,
 * palavra por palavra.
 *   alvo: palavras do avatar com tempos RELATIVOS ao início da janela
 *   fala: palavras da voz nova com tempos relativos ao início de `entrada`
 * Devolve { ancoras, fatores } ou null se não houver âncoras suficientes (use o encaixe por frase).
 */
export function encaixarPorPalavra({ entrada, saida, janela, duracaoFala, alvo, fala, wav }) {
  const ANTES = 0.03; // corta um pouco antes do início da palavra para não comer a consoante
  const pares = alinhar(alvo, fala);
  let ancoras = [{ t: 0, v: Math.max(0, alvo[0]?.inicio ?? 0) - (fala[0]?.inicio ?? 0) }];
  if (ancoras[0].v < 0) ancoras[0].v = 0;
  for (const [i, j] of pares) {
    const t = Math.max(0, fala[j].inicio - ANTES);
    const v = Math.max(0, alvo[i].inicio - ANTES);
    const ult = ancoras[ancoras.length - 1];
    // trechos curtos demais soam picotados: precisa de 0,22s de fala e 0,15s de avatar
    if (t - ult.t >= 0.22 && v - ult.v >= 0.15) ancoras.push({ t, v });
  }
  ancoras.push({ t: duracaoFala, v: janela });
  // a última âncora interna precisa deixar espaço para o fim
  while (ancoras.length > 2) {
    const [a, b] = ancoras.slice(-2);
    if (b.t - a.t >= 0.15 && b.v - a.v >= 0.1) break;
    ancoras.splice(ancoras.length - 2, 1);
  }
  if (ancoras.length < 3) return null; // sem nenhuma âncora interna: não há o que sincronizar
  // Faixa estreita: comprimir/esticar além disso deforma a fala ("no mês" virou "por mês",
  // "com direito" virou "tung direito" quando o fator chegou a 1,6).
  const MIN = 0.8, MAX = 1.35;
  const partes = [];
  const fatores = [];
  let cursor = 0; // fim do trecho anterior já colocado: trechos NUNCA se sobrepõem
  for (let k = 0; k < ancoras.length - 1; k++) {
    const a = ancoras[k], b = ancoras[k + 1];
    const dt = b.t - a.t;
    const inicio = Math.max(a.v, cursor); // atrasado? começa logo depois do anterior e tenta recuperar
    const dv = b.v - inicio;
    const fator = dv > 0 ? Math.min(MAX, Math.max(MIN, dt / dv)) : MAX;
    fatores.push(+fator.toFixed(3));
    const durSaida = dt / fator;
    cursor = inicio + durSaida;
    const fade = Math.min(0.008, durSaida / 4);
    const ms = Math.round(inicio * 1000);
    partes.push(
      `[0:a]atrim=start=${a.t.toFixed(4)}:end=${b.t.toFixed(4)},asetpts=PTS-STARTPTS,atempo=${fator.toFixed(4)},` +
        `afade=t=in:d=${fade.toFixed(4)},afade=t=out:st=${Math.max(0, durSaida - fade).toFixed(4)}:d=${fade.toFixed(4)},adelay=${ms}|${ms}[s${k}]`,
    );
  }
  // não cabe na janela sem deformar: devolve null e quem chamou usa o encaixe por frase
  if (cursor > janela + 0.02) return null;
  const n = partes.length;
  ff(["-i", entrada, "-filter_complex", `${partes.join(";")};${partes.map((_, k) => `[s${k}]`).join("")}amix=inputs=${n}:normalize=0,apad=whole_dur=${janela},atrim=0:${janela}[o]`, "-map", "[o]", ...wav, saida]);
  return { ancoras: ancoras.map((x) => ({ t: +x.t.toFixed(3), v: +x.v.toFixed(3) })), fatores };
}
