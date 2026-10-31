/**
 * Conferência de fala por transcrição.
 *
 * Regra aprendida em produção: um transcritor sozinho erra (o Whisper/Groq inventou um
 * "a" em "comenta a automação" até no áudio original; o OpenAI às vezes engole um "o").
 * Por isso:
 *   - "ok"    os dois transcritores ouvem o texto esperado (ou o primeiro já ouve);
 *   - "aviso" só um deles ouve diferente: provável erro do transcritor, vale escutar;
 *   - "erro"  os dois ouvem diferente: a fala está errada de verdade.
 *
 * Números são comparados por extenso ("150" == "cento e cinquenta") e "R$" é ignorado.
 */
import { readFileSync } from "fs";
import { basename } from "path";
import { env } from "./config.mjs";

const UNIDADES = ["zero", "um", "dois", "tres", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
const DEZENAS = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
const CENTENAS = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];

/** Inteiro de 0 a 999.999 por extenso, sem acentos (para comparar com o texto normalizado). */
export function porExtenso(n) {
  n = Math.floor(Number(n));
  if (!Number.isFinite(n) || n < 0 || n > 999999) return String(n);
  if (n < 20) return UNIDADES[n];
  if (n < 100) return DEZENAS[Math.floor(n / 10)] + (n % 10 ? " e " + UNIDADES[n % 10] : "");
  if (n === 100) return "cem";
  if (n < 1000) return CENTENAS[Math.floor(n / 100)] + (n % 100 ? " e " + porExtenso(n % 100) : "");
  const mil = Math.floor(n / 1000);
  const resto = n % 1000;
  const cabeca = mil === 1 ? "mil" : porExtenso(mil) + " mil";
  if (!resto) return cabeca;
  return cabeca + (resto < 100 || resto % 100 === 0 ? " e " : " ") + porExtenso(resto);
}

/** Lista de palavras normalizadas: minúsculas, sem acento, sem pontuação, números por extenso. */
export function normalizar(texto) {
  return String(texto)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/(\d+)[.,]00\b/g, "$1")
    .replace(/r\$\s*(\d+)\b(?!\s*reais)/g, "$1 reais") // "R$ 150" é falado "cento e cinquenta reais"
    .replace(/r\$/g, " ")
    .replace(/\d+/g, (m) => " " + porExtenso(m) + " ")
    .replace(/[^a-z ]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** Distância de edição entre duas listas de palavras. */
export function distancia(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return d[a.length][b.length];
}

/** Fração de palavras diferentes entre o esperado e o ouvido (0 = idêntico). */
export function taxa(esperado, ouvido) {
  const a = normalizar(esperado);
  if (!a.length) return 0;
  return distancia(a, normalizar(ouvido)) / a.length;
}

async function transcrever(url, chave, modelo, arquivo) {
  const form = new FormData();
  form.append("file", new Blob([readFileSync(arquivo)]), basename(arquivo));
  form.append("model", modelo);
  form.append("language", "pt");
  const r = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${chave}` }, body: form });
  if (!r.ok) throw new Error(`transcrição ${modelo} ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return ((await r.json()).text || "").trim();
}

/** Transcreve com o OpenAI (gpt-4o-transcribe). */
export const ouvirOpenAI = (arquivo) =>
  transcrever("https://api.openai.com/v1/audio/transcriptions", env.OPENAI_API_KEY, "gpt-4o-transcribe", arquivo);

/** Transcreve com o Groq (whisper-large-v3). */
export const ouvirGroq = (arquivo) =>
  transcrever("https://api.groq.com/openai/v1/audio/transcriptions", env.GROQ_API_KEY, "whisper-large-v3", arquivo);

/**
 * Confere um áudio contra o texto esperado com até dois transcritores.
 * Só chama o segundo quando o primeiro discorda. Sem chave de um deles, usa o que houver.
 */
export async function conferir(arquivo, esperado, limiar = 0.08) {
  const ouvintes = [];
  if (env.OPENAI_API_KEY) ouvintes.push(["openai", ouvirOpenAI]);
  if (env.GROQ_API_KEY) ouvintes.push(["groq", ouvirGroq]);
  if (!ouvintes.length) throw new Error("Conferência exige OPENAI_API_KEY ou GROQ_API_KEY no .env");
  const leituras = [];
  for (const [nome, ouvir] of ouvintes) {
    const texto = await ouvir(arquivo);
    const t = taxa(esperado, texto);
    leituras.push({ transcritor: nome, texto, taxa: +t.toFixed(3) });
    if (t <= limiar) break;
  }
  const divergentes = leituras.filter((l) => l.taxa > limiar).length;
  const veredito = divergentes === 0 ? "ok" : divergentes === leituras.length && leituras.length > 1 ? "erro" : leituras.length === 1 ? "erro" : "aviso";
  return { veredito, leituras, melhor: Math.min(...leituras.map((l) => l.taxa)) };
}
