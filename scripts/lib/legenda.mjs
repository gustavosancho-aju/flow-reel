import { assColor } from "./config.mjs";
import { obterFormato } from "./formato.mjs";

export function normalizar(palavras) {
  const saida = [];
  let ultimoFim = 0;
  // NÃO reordenar: o Whisper já devolve na ordem falada, e nas emendas entre
  // cenas os tempos se cruzam — ordenar por timestamp troca as palavras de
  // lugar ("QUE VOCÊ ESTÁ" / "NÃO VENDO"). Só empurra o tempo para frente.
  for (const p of palavras) {
    if (typeof p.texto !== "string" || !Number.isFinite(p.inicio) || !Number.isFinite(p.fim)) {
      throw new Error("Cada palavra deve ter texto e tempos inicio/fim finitos.");
    }
    const inicio = Math.max(p.inicio, ultimoFim);
    const fim = Math.max(p.fim, inicio + 0.06);
    saida.push({ ...p, inicio, fim });
    ultimoFim = fim;
  }
  return saida;
}

export function agruparPalavras(palavras, porCartela = 3, pausaMax = 0.35) {
  if (!Number.isInteger(porCartela) || porCartela < 1) throw new Error("palavrasPorCartela deve ser inteiro positivo.");
  const grupos = [];
  let atual = [];
  for (let i = 0; i < palavras.length; i++) {
    const p = palavras[i];
    const anterior = palavras[i - 1];
    const quebraPorPausa = anterior && p.inicio - anterior.fim > pausaMax;
    const quebraPorFrase = anterior && /[.!?…:;]$/.test(anterior.texto);
    if (atual.length >= porCartela || quebraPorPausa || quebraPorFrase) {
      if (atual.length) grupos.push(atual);
      atual = [];
    }
    atual.push(p);
  }
  if (atual.length) grupos.push(atual);
  return grupos;
}


export function gerarLegenda(brutas, estilo, { formato: formatoArg, suprimir = [] } = {}) {
  const formato = obterFormato(formatoArg);
  // trechos cobertos por motion de tela cheia: a peça já mostra as palavras,
  // repetir na legenda polui e duplica a mesma mensagem
  const dentroDeMotion = (p) => suprimir.some(([a, b]) => p.inicio >= a - 0.05 && p.inicio <= b);
  const palavras = normalizar(brutas).filter((p) => !dentroDeMotion(p));

  const L = estilo.legenda || {};
  const FL = estilo.fontes.legenda;
  const POR_CARTELA = L.palavrasPorCartela ?? 3;
  const BRANCO = assColor(L.corTexto || estilo.cores.texto || "#FFFFFF");

  /**
   * Correções de grafia da legenda. O Veo pronuncia "Claude" à inglesa e o
   * transcritor ouve "cloud" — a legenda tem que mostrar a marca escrita certo,
   * senão o erro do áudio vira erro também na tela.
   */
  const CORRECOES = new Map([
    ["CLOUD", "CLAUDE"],
    ["CLOUDCODE", "CLAUDE CODE"],
  ]);

  /** Caixa alta e sem pontuação — padrão de legenda dinâmica de Reels. */
  function limpar(texto) {
    const base = texto.replace(/[.,;:!?]+$/g, "");
    const base2 = L.caixaAlta === false ? base : base.toUpperCase();
    return CORRECOES.get(base2.toUpperCase()) ?? base2;
  }

  function tempoAss(s) {
    const total = Math.round(s * 100);
    const h = Math.floor(total / 360000);
    const m = Math.floor(total / 6000) % 60;
    const seg = Math.floor(total / 100) % 60;
    const cs = total % 100;
    return `${h}:${String(m).padStart(2, "0")}:${String(seg).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
  }


  const grupos = agruparPalavras(palavras, POR_CARTELA);

  const cabecalho = `[Script Info]
ScriptType: v4.00+
PlayResX: ${formato.legendaLargura}
PlayResY: ${formato.legendaAltura}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Reels,${FL.familia},${FL.tamanho ?? 32},${BRANCO},${BRANCO},&H00000000&,&H90000000&,1,0,0,0,100,100,1,0,1,5,2,2,70,70,${Math.round(formato.legendaAltura * (1 - (L.posicaoVerticalPct ?? 88) / 100)) - 14},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const linhas = [];
  for (let g = 0; g < grupos.length; g++) {
    const grupo = grupos[g];
    const proximoGrupo = grupos[g + 1];
    const inicio = grupo[0].inicio;
    // segura até a próxima cartela, sem invadi-la (duas na tela ao mesmo tempo)
    const teto = proximoGrupo ? proximoGrupo[0].inicio - 0.02 : Infinity;
    const fim = Math.min(grupo[grupo.length - 1].fim + 0.12, teto);
    const texto = grupo.map((p) => limpar(p.texto)).join(" ");
    // pop curto só na entrada — não revela palavra a palavra
    const B = String.fromCharCode(92);
    const pop = `{${B}fscx90${B}fscy90${B}t(0,110,${B}fscx100${B}fscy100)}`;
    linhas.push(
      `Dialogue: 0,${tempoAss(inicio)},${tempoAss(fim)},Reels,,0,0,0,,${pop}${texto}`
    );
  }

  return cabecalho + linhas.join("\n") + "\n";
}
