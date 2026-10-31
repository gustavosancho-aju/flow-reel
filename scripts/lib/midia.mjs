/**
 * Utilidades de mídia (ffmpeg/ffprobe) usadas pelos scripts de voz.
 */
import { spawnSync } from "child_process";
import { chmodSync, copyFileSync, existsSync, rmSync } from "fs";

/**
 * Copia uma fonte para a pasta de trabalho. Fontes instaladas no Windows vêm somente
 * leitura e a cópia herda isso: copiar de novo por cima dá EPERM. Apaga antes e libera
 * a escrita depois.
 */
export function copiarFonte(origem, destino) {
  if (existsSync(destino)) {
    try { chmodSync(destino, 0o666); } catch {}
    rmSync(destino, { force: true });
  }
  copyFileSync(origem, destino);
  try { chmodSync(destino, 0o666); } catch {}
}

/** Roda ffmpeg (-y -v error ...). Lança erro com o stderr se falhar. */
export function ff(args, opcoes = {}) {
  const r = spawnSync("ffmpeg", ["-y", "-v", "error", ...args], { encoding: "utf-8", maxBuffer: 64 * 1024 * 1024, ...opcoes });
  if (r.status !== 0) throw new Error("ffmpeg falhou: " + (r.stderr || "").slice(0, 600));
  return r;
}

/** Duração em segundos (ffprobe). */
export function duracao(arquivo) {
  const r = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", arquivo], { encoding: "utf-8" });
  const d = Number((r.stdout || "").trim());
  if (!Number.isFinite(d)) throw new Error("não consegui medir a duração de " + arquivo);
  return d;
}

/** Filtro que tira o silêncio do começo e do fim (para medir só a fala). */
export const SEM_SILENCIO_NAS_PONTAS =
  "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05,areverse," +
  "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05,areverse";

/** Fator de pitch para N semitons (rubberband). */
export const fatorSemitons = (n) => Math.pow(2, Number(n || 0) / 12);

/** Saída de áudio padrão dos scripts: WAV mono 44,1 kHz PCM 16 bits. */
export const WAV_MONO = ["-ar", "44100", "-ac", "1", "-acodec", "pcm_s16le"];
