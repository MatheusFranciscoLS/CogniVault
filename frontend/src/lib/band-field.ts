/**
 * Campo de trabalho DENTRO da faixa marinho (direção B): branco nos dois temas, como a busca do topo, para o texto e a sugestão passarem no contraste
 * (texto #1b2234, sugestão #5f667a). O `Input` do projeto tem `dark:bg-input/30`, por isso o `dark:bg-white`; `[color-scheme:light]` mantém o ícone do
 * seletor de data escuro (sem ele, no tema escuro o ícone sai branco sobre o fundo branco). A altura fica por conta de quem usa (`h-10`/`h-11`).
 */
export const BAND_FIELD = 'border-transparent bg-white text-[#1b2234] placeholder:text-[#5f667a] focus-visible:ring-[#ff9a73] dark:bg-white [color-scheme:light]';
