/** Argumentos do auto-editor 31.x (sem shell). Tempos em segundos. */
export function argumentosAutoEditor(entrada, saida, minSilencio = 0.35, margem = 0.12, limiar = 0.025) {
  if (![minSilencio, margem, limiar].every(Number.isFinite) || minSilencio < 0 || margem < 0 || limiar <= 0 || limiar > 1) {
    throw new Error("Corte inválido: tempos devem ser >= 0 e o limiar de áudio deve estar entre 0 (exclusivo) e 1.");
  }
  return [entrada, "--edit", `audio:threshold=${limiar}`, "--smooth", `${minSilencio}s,0.1s`,
    "--margin", `${margem}s`, "--when-inactive", "cut", "--video-codec", "libx264",
    "--audio-codec", "aac", "--pix-fmt", "yuv420p", "--no-open", "--output", saida];
}
