/** Transcrição por palavra, com provedor explícito e sem fallback de cobrança. */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

export function escolherTranscritor(config, escolha = 'auto') {
  if (!['auto', 'groq', 'openai', 'nenhum'].includes(escolha)) throw new Error('Transcritor inválido: auto, groq, openai ou nenhum.');
  if (escolha === 'nenhum') return null;
  const provedor = escolha === 'auto' ? (config.GROQ_API_KEY ? 'groq' : config.OPENAI_API_KEY ? 'openai' : null) : escolha;
  if (!provedor) return null;
  const chave = config[provedor === 'groq' ? 'GROQ_API_KEY' : 'OPENAI_API_KEY'];
  if (!chave) throw new Error(`Falta a chave do transcritor ${provedor} no .env.local do flow-reel.`);
  return { provedor, chave };
}

export function validarPalavras(lista, duracao) {
  if (!Array.isArray(lista)) throw new Error('Transcrição sem lista de palavras.');
  let anterior = 0;
  return lista.map(p => {
    if (typeof p.texto !== 'string' || !p.texto.trim() || !Number.isFinite(p.inicio) || !Number.isFinite(p.fim) || p.inicio < 0 || p.fim < p.inicio || p.inicio < anterior) throw new Error('Transcrição contém palavra ou tempos inválidos.');
    anterior = p.inicio;
    return { texto: p.texto.trim(), inicio: p.inicio, fim: Math.min(Math.max(p.fim,p.inicio+0.02), duracao) };
  }).filter(p => p.inicio < duracao && p.fim > p.inicio);
}

export async function transcreverArquivo(arquivo, duracao, selecionado, request = fetch) {
  const audio = readFileSync(arquivo);
  if (audio.length > 24 * 1024 * 1024) throw new Error('Áudio excede 24 MB; divida o vídeo antes de transcrever.');
  const { provedor, chave } = selecionado;
  const form = new FormData();
  form.append('file', new Blob([audio]), basename(arquivo));
  form.append('model', provedor === 'groq' ? 'whisper-large-v3' : 'whisper-1');
  form.append('language', 'pt');
  form.append('response_format', 'verbose_json');
  form.append('timestamp_granularities[]', 'word');
  let r;
  try {
    r = await request(provedor === 'groq' ? 'https://api.groq.com/openai/v1/audio/transcriptions' : 'https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(120000),
      headers: { Authorization: `Bearer ${chave}` }, body: form,
    });
  } catch { throw new Error(`Falha de conexão/timeout na transcrição ${provedor}.`); }
  if (!r.ok) throw new Error(`Transcrição ${provedor} falhou (HTTP ${r.status}); confira chave, saldo e limites.`);
  let data;
  try { data = await r.json(); } catch { throw new Error('Resposta de transcrição inválida.'); }
  return validarPalavras(data.words?.map(p => ({ texto: p.word, inicio: p.start, fim: p.end })), duracao);
}

/** Mantém fala + respiro. Não remove repetições nem decide o valor visual de B-roll. */
export function planejarCortes(palavras, duracao, margem = 0.12, pausaMin = 0.35) {
  if (!(duracao > 0) || margem < 0 || pausaMin < 0) throw new Error('Parâmetros de corte inválidos.');
  const validas = validarPalavras(palavras, duracao);
  if (!validas.length) return { intervalos: [[0, duracao]], palavras: [], duracao };
  const intervalos = [];
  for (const p of validas) {
    const a = Math.max(0, p.inicio - margem), b = Math.min(duracao, p.fim + margem);
    const anterior = intervalos.at(-1);
    if (anterior && a - anterior[1] < pausaMin) anterior[1] = Math.max(anterior[1], b);
    else intervalos.push([a, b]);
  }
  const remapeadas = []; let offset = 0;
  for (const [a, b] of intervalos) {
    for (const p of validas.filter(p => p.inicio >= a && p.inicio < b)) remapeadas.push({ ...p, inicio: p.inicio - a + offset, fim: Math.min(p.fim, b) - a + offset });
    offset += b - a;
  }
  return { intervalos, palavras: remapeadas, duracao: offset };
}

export function filtroCortes(intervalos) {
  return intervalos.map(([a,b],i) => `[0:v]trim=start=${a}:end=${b},setpts=PTS-STARTPTS[v${i}];[0:a]atrim=start=${a}:end=${b},asetpts=PTS-STARTPTS[a${i}];`).join('\n') +
    intervalos.map((_,i) => `[v${i}][a${i}]`).join('') + `concat=n=${intervalos.length}:v=1:a=1[v][a]`;
}
