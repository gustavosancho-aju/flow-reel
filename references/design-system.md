# Design system: como o estilo entra nas peças

Todas as peças geradas em código (motion no HyperFrames, capa, legenda, terminal)
leem **`perfil/estilo.json`**. Nada de cor ou fonte fica fixo nos scripts. O estilo
nasce no onboarding (4 vídeos de referência, ver `SKILL.md`, Passo 0) e pode ser
ajustado a qualquer momento editando o JSON.

## Cores (`estilo.cores`)

- `fundo`: base escura (ou clara) de tudo.
- `destaque`: cor de marca (linha da capa, filetes, checks, pílula de CTA).
- `texto` e `textoSecundario`: texto principal e discreto.
- `alerta` e `atencao`: só para o sentido de erro/pendência (vermelho/âmbar).

Formatos: ffmpeg usa `0xRRGGBB` (`ffColor`), legenda ASS usa BGR `&H00BBGGRR&`
(`assColor`), CSS usa `rgba(r,g,b,a)` (`rgb`). Os três vêm de `scripts/lib/config.mjs`.

## Fontes (`estilo.fontes`)

- `titulo`, `corpo`, `legenda`: `{ familia, arquivo, peso/tamanho }`.
- Opcionais `capaTitulo` e `capaCorpo` se a capa usar fontes diferentes do vídeo.
- **Sempre informe o arquivo** (`.ttf`/`.otf`). O ffmpeg/libass não resolve fonte por
  família sem fontconfig no Windows, e sem o arquivo a legenda cai em Arial sem
  avisar. Os scripts copiam o arquivo para a pasta de saída e referenciam só o nome
  (caminho completo com `:` quebra o `drawtext`; ver `armadilhas.md`).
- Coloque as fontes da pessoa em `perfil/fontes/` (fora do git) ou use fontes do sistema.

## Legenda (`estilo.legenda`)

Padrão validado: 3 palavras por cartela, caixa alta, sem pontuação final, branca com
contorno/sombra, sem caixa de fundo, tamanho 32 (PlayRes 720x1280), a ~88% da altura
(por baixo da boca no cartão do rosto). Queimar com `subtitles=...:fontsdir=<pasta da fonte>`.

## Layout (`estilo.layout`)

- `dividido`: painel animado em cima + cartão arredondado do rosto embaixo; rosto em
  tela cheia na abertura, nas viradas de bloco e no CTA (os 3 primeiros segundos
  sempre no rosto). É o que o template fornecido implementa.
- `tela-cheia` e `pessoa-no-canto`: adaptar o template.

## Avatar e figurino

- O avatar da pessoa é único e fixo: a identidade nunca muda entre cenas de um vídeo.
- Cenário e figurino fixos em `perfil.cenario` e `perfil.figurino`, descritos
  literalmente no prompt de todas as cenas; sem repetir o figurino, o Flow troca a
  roupa a cada cena.
- Cenário que muda por tema (praia, carro, estúdio) é escolha de estilo, não o padrão:
  perguntar antes.
