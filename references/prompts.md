# Prompts das cenas: Flow (Omni 1.1 Flash)

## Formato selfie (padrão; `perfil.avatar.formato`)

Montado em JS no navegador para ir via `execCommand('insertText')`. `CENARIO` e
`FIGURINO` vêm de `perfil/perfil.json` (`cenario`, `figurino`); `IDIOMA` de `perfil.idioma`
(ex.: "português brasileiro").

```js
const CENARIO = '<perfil.cenario>';
const FIGURINO = '<perfil.figurino>';
const IDIOMA = '<ex.: português brasileiro>';
const BASE = `Vídeo estilo selfie: o personagem segura o próprio celular com o braço estendido e grava a si mesmo com a câmera frontal, enquadrado do peito para cima, olhando direto para a lente, com leve movimento natural da mão, como quem grava um Reel para o Instagram. Use o avatar anexado e preserve a aparência, o rosto, o cabelo e as proporções. Cenário fixo, igual em todas as cenas: ${CENARIO}. Ele veste a mesma ${FIGURINO} em todas as cenas. Luz suave e natural, a mesma em todas as cenas. Nenhum notebook, nenhuma tela e nenhum papel no quadro. Vídeo vertical 9:16, uma tomada contínua de no máximo 8 segundos.`;
const R = `Fala natural e conversada, em ${IDIOMA}, mesma voz em todas as cenas, sem acelerar, omitir ou cortar palavras. Sincronize os lábios. Se a fala terminar antes, mantenha uma breve pausa olhando para a câmera até encerrar a cena. Sem música. Sem legendas, sem texto na tela e sem logotipos.`;
const CONT = ' Continue a fala da cena anterior, sem introdução adicional.';
const s = (tom, fala, cont, extra = '') =>
  `${BASE} Tom: ${tom} Narração, exatamente esta frase, sem mudar nenhuma palavra: "${fala}"${cont ? CONT : ''}${extra} ${R}`;
```

- `tom` varia por cena (curioso no gancho, didático no conteúdo, próximo no CTA).
- `cont = true` quando a frase continua a da cena anterior.
- `extra` para pronúncia: `' Pronuncie todas as palavras em português; a palavra "condições" é em português, nunca em inglês.'`
- `extra` para tirar o celular do quadro (se atrapalhar): troque também "segura o
  próprio celular com o braço estendido e grava a si mesmo" no `BASE` por "fala direto
  para a câmera frontal, estável, sem nenhum celular ou mão segurando aparelho visível
  no quadro", senão o prompt se contradiz.

## O que NÃO pôr no prompt

- **Microfone, notebook, tela, papel**: aparecem no quadro e atrapalham. Num caso
  real, "microfone com LED verde atrás dele" fez o microfone aparecer em todas as cenas.
- Pedir texto legível na tela (ex.: um checklist): o modelo escreve em inglês
  ("Property checklist"). Texto vai no motion, não no vídeo.
- Nomes de marca difíceis (ver `armadilhas.md`, "Claude" vira "cloud").

## Formato com ficha na tela (preterido)

Plano médio + notebook mostrando a ficha funciona, mas o texto da tela sai em
inglês e o plano "por cima do ombro" nem sempre é respeitado. Use só se a pessoa pedir.
