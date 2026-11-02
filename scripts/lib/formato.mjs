/** Formatos compartilhados por vídeo, composição, legenda e capa. */
export function obterFormato(nome = "9:16") {
  if (nome === "9:16") return { nome, largura: 1080, altura: 1920, legendaLargura: 720, legendaAltura: 1280 };
  if (nome === "16:9") return { nome, largura: 1920, altura: 1080, legendaLargura: 1280, legendaAltura: 720 };
  throw new Error(`Formato inválido: ${nome}. Use 9:16 ou 16:9.`);
}
