/** @type {import('tailwindcss').Config} */

// Paleta e tipografia extraídas do CSS computado de vardaomaquinas.com.br.
// Ver docs/IDENTIDADE_VISUAL_VARDAO.md antes de inventar um tom novo: cada valor
// abaixo tem contrapartida real no site da loja.
export default {
    darkMode: 'class',
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                /*
                 * Superfícies têm escala PRÓPRIA, separada da do texto.
                 *
                 * A razão é concreta: `ink-900` é fundo em 164 lugares e texto
                 * em 108. Enquanto fundo e texto dividem a mesma escala, não dá
                 * para ajustar profundidade sem mexer em legibilidade.
                 *
                 * O diagnóstico que motivou isto foi medido, não opinado — as
                 * três camadas do tema claro (página, card, barra lateral)
                 * tinham separação de 1,10 e 1,00. Barra lateral e card eram
                 * literalmente a MESMA cor branca, e é isso que fazia a tela
                 * parecer "tudo muito branco".
                 */
                surface: {
                    // Página: afasta do card branco (1,10 -> 1,23) mantendo o
                    // neutro quente do site da loja. Texto #1e1e1d a 13,6:1.
                    page: '#eae8e2',
                    // Página no escuro: afasta do card ink-900 (1,15 -> 1,24)
                    // sem tocar no token do card.
                    'page-dark': '#0f1426',
                    // Barra lateral: navy da marca, nos DOIS temas. É a mesma
                    // superfície do painel do login, e resolve de uma vez o
                    // "tudo branco" — 12:1 de separação contra a página clara.
                    nav: '#1f2742',
                },
                brand: {
                    DEFAULT: '#273a60',
                    50: '#f1f4f9',
                    100: '#dfe6f1',
                    200: '#c2d0e5',
                    300: '#94aacd',
                    400: '#5f7dae',
                    500: '#3d5c90',
                    600: '#273a60',
                    700: '#223454',
                    800: '#1f2742',
                    900: '#161c2f',
                    950: '#0d1220',
                },
                accent: {
                    DEFAULT: '#f25420',
                    50: '#fef3ee',
                    100: '#fde2d5',
                    200: '#fbc0a5',
                    300: '#f8966d',
                    400: '#f56f3e',
                    500: '#f25420',
                    600: '#d94512',
                    // Único tom de laranja aprovado para texto sobre fundo claro (5,3:1).
                    700: '#c13d0a',
                    800: '#9a3109',
                    900: '#7c2a0c',
                },
                gold: {
                    DEFAULT: '#ffc800',
                    100: '#fff4cc',
                    300: '#ffdf66',
                    500: '#ffc800',
                    700: '#b38c00',
                    // Ouro legível sobre fundo claro.
                    800: '#8a6a00',
                },
                /*
                 * Escala neutra do app. Substituiu `slate-*` em todo o
                 * front-end (mesmos degraus, para a troca ser mecânica).
                 *
                 * Ela serve dois papéis ao mesmo tempo, como o `slate` do
                 * Tailwind: 50–700 são texto e superfície no tema claro, 800–950
                 * são superfície no tema escuro. Por isso os degraus claros usam
                 * os neutros reais do site da loja (#f4f4f3, #e4e4e2, #686867,
                 * #3d3d3c) e os escuros puxam para o azul-marinho da marca — um
                 * tema escuro cinza-quente perderia a identidade, e um texto
                 * claro azulado perderia a fidelidade ao site. A virada de
                 * matiz entre 700 e 800 é consequência disso, não descuido.
                 */
                ink: {
                    DEFAULT: '#1e1e1d',
                    50: '#fafaf9',
                    100: '#f4f4f3',
                    200: '#e4e4e2',
                    300: '#c8c8c5',
                    400: '#a8a8a6',
                    500: '#686867',
                    600: '#4f5461',
                    700: '#3d3d3c',
                    800: '#2b3348',
                    // 850 não existe no `slate`: é a superfície ELEVADA do tema
                    // escuro, acima do card (900).
                    //
                    // Era `#222b44`, que dava 1,05 de separação contra o card —
                    // medido, e 1,05 o olho não distingue. Duas camadas com um
                    // tom só é o que fazia a tela parecer chapada. `#2a3555`
                    // sobe para 1,22 e mantém branco a 12,1:1.
                    //
                    // Este token é seguro de mudar porque é SÓ fundo: 20 usos em
                    // `bg-`, zero em `text-`. O `ink-900`, por comparação, é
                    // fundo 164 vezes E texto 108 — mexer nele quebraria o
                    // texto escuro sobre superfície clara.
                    850: '#2a3555',
                    900: '#1f2742',
                    950: '#161c2f',
                },
            },
            fontFamily: {
                sans: ['"Roboto Flex"', 'Roboto', 'system-ui', '-apple-system', '"Segoe UI"', 'Arial', 'sans-serif'],
                mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', '"Liberation Mono"', '"Courier New"', 'monospace'],
            },
            fontSize: {
                // Escala espelhando a do site: títulos com tracking negativo,
                // rótulos maiúsculos com tracking largo.
                eyebrow: ['0.75rem', { lineHeight: '1rem', letterSpacing: '0.105em', fontWeight: '700' }],
                seal: ['0.6rem', { lineHeight: '0.6rem', letterSpacing: '0.12em', fontWeight: '600' }],
                badge: ['0.7rem', { lineHeight: '1.05rem', letterSpacing: '0.025em', fontWeight: '600' }],
                'display-lg': ['2.4rem', { lineHeight: '2.64rem', letterSpacing: '-0.025em', fontWeight: '700' }],
                'display': ['2.25rem', { lineHeight: '2.5rem', letterSpacing: '-0.025em', fontWeight: '700' }],
                'display-sm': ['1.875rem', { lineHeight: '2.25rem', letterSpacing: '-0.025em', fontWeight: '700' }],
                'title': ['1.125rem', { lineHeight: '1.75rem', letterSpacing: '-0.025em', fontWeight: '600' }],
                'title-sm': ['0.875rem', { lineHeight: '1.203rem', letterSpacing: '-0.025em', fontWeight: '600' }],
            },
            borderRadius: {
                // O site só usa 6 / 8 / 12 / 16 / pill.
                card: '12px',
                panel: '16px',
            },
            boxShadow: {
                // Valores exatos do site — sombra discreta, nunca dramática.
                card: '0 1px 2px rgba(30,30,29,.04), 0 1px 3px rgba(30,30,29,.06)',
                raised: '0 12px 28px -8px rgba(39,58,96,.16), 0 4px 10px -4px rgba(30,30,29,.08)',
                ringLight: '0 0 0 1px rgba(255,255,255,.15)',
            },
            backgroundImage: {
                'section-soft': 'linear-gradient(to bottom right, #f1f4f9, #f4f4f3)',
                'brand-fade': 'linear-gradient(to right, #273a60, rgba(39,58,96,.9), rgba(39,58,96,.4))',
                'media-scrim': 'linear-gradient(to top, rgba(39,58,96,.6), rgba(0,0,0,0))',
            },
            screens: {
                // Balcão real: o aparelho do meio é um tablet 10" em retrato
                // (~800px) ou paisagem (~1280px). `tablet` existe para permitir
                // layout de duas colunas antes do `lg` do Tailwind.
                tablet: '820px',
            },
        },
    },
    plugins: [],
}
