import { existsSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { RAIZ } from "./raiz.mjs";

/** Caminhos do estilo são relativos ao clone, nunca à pasta de execução. */
export function resolverFonte(fonte, raiz = RAIZ) {
  const arquivo = typeof fonte === "string" ? fonte : fonte?.arquivo;
  if (typeof arquivo !== "string" || !arquivo.trim()) throw new Error("Fonte sem arquivo: configure fontes.*.arquivo em perfil/estilo.json.");
  const caminho = isAbsolute(arquivo) ? arquivo : resolve(raiz, arquivo);
  if (!existsSync(caminho)) throw new Error(`Fonte não encontrada: ${arquivo}. Use um arquivo no clone ou configure seu caminho absoluto.`);
  return caminho;
}

export const FONTE_MONO = { familia: "IBM Plex Mono", arquivo: "assets/fonts/IBMPlexMono-Regular.ttf" };
