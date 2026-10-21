/**
 * Gera UM fundo fixo (cômodo vazio, sem pessoa e sem objetos de primeiro
 * plano) a partir de um quadro de referência do próprio vídeo. Serve para
 * unificar o cenário das cenas do Flow: cada geração do Omni/Veo varia o fundo
 * (quadros mudam de lugar, aparecem objetos), e recortar a pessoa + colocar
 * este fundo único atrás resolve sem gastar créditos do Flow.
 *
 * Usa o Nano Banana (google/gemini-3.1-flash-image-preview) pela OpenRouter,
 * porque a chave direta do Google (AI Studio) fica sem crédito com frequência.
 * Custo medido: ~US$ 0,07 por imagem. Saída 768x1376 (9:16).
 *
 * Uso: node gerar-fundo.mjs <quadro-referencia.jpg> <saida.png> ["o que remover/manter a mais"]
 * Depois: ffmpeg -i saida.png -vf "scale=720:1290,crop=720:1280:0:5" fundo.png
 */
import { readFileSync, writeFileSync } from "fs";
import { env, estilo, perfil, ffColor, assColor, rgb, exigir } from "./lib/config.mjs";


const [, , ref, out, extra] = process.argv;
if (!ref || !out) {
  console.error("Uso: node gerar-fundo.mjs <referencia.jpg> <saida.png> [instrucao extra]");
  process.exit(1);
}

const prompt = `Usando esta foto como referência do ambiente, gere SOMENTE o cômodo vazio, como uma foto real de celular na vertical 9:16, do mesmo ponto de vista e com a mesma lente desta selfie.
Remova completamente: a pessoa, o braço, o celular, microfones e seus suportes, e a cadeira.
Mantenha igual: as paredes, os quadros, as prateleiras com seus objetos, a iluminação e as cores.
A metade de baixo do quadro deve ser apenas parede e móvel ao fundo, sem objeto em primeiro plano.
Sem texto, sem logotipos, sem pessoas. Fotografia realista, levemente desfocada como o fundo de uma selfie. ${extra || ""}`;

const body = {
  model: "google/gemini-3.1-flash-image-preview",
  modalities: ["image", "text"],
  image_config: { aspect_ratio: "9:16" },
  messages: [{
    role: "user",
    content: [
      { type: "image_url", image_url: { url: "data:image/jpeg;base64," + readFileSync(ref).toString("base64") } },
      { type: "text", text: prompt },
    ],
  }],
};

const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: "Bearer " + env.OPENROUTER_API_KEY },
  body: JSON.stringify(body),
});
const j = await r.json();
const url = j.choices?.[0]?.message?.images?.[0]?.image_url?.url;
if (!url) {
  console.error("sem imagem", r.status, JSON.stringify(j).slice(0, 500));
  process.exit(1);
}
writeFileSync(out, Buffer.from(url.split(",")[1], "base64"));
console.log("ok", out, "custo US$", j.usage?.cost ?? "?");
