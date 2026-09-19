# Kawasaki: o catálogo de peças pela API do ARI PartStream

Mapa medido em 2026-09-19, **do terminal** (não só do navegador), contra
`partstream.arinet.com`. Registrado aqui porque a conclusão anterior — "não dá
para integrar a Kawasaki" — **estava errada**, e o dono apontou o erro: nós já
tínhamos achado o carburador juntos numa sessão anterior.

## Por que eu tinha concluído errado

Duas coisas me enganaram, e as duas são armadilhas de método:

1. **As chamadas são JSONP.** Eu instrumentei `fetch` e `XMLHttpRequest`, não vi
   nada, e concluí que não havia API. JSONP entra por `<script>` dinâmico — não
   aparece em nenhum dos dois. Só apareceu em
   `performance.getEntriesByType('resource')`.
2. **Vi o reCAPTCHA na página e generalizei.** O reCAPTCHA protege a *página* do
   localizador; os endpoints do ARI respondem sem ele, do servidor, com a app
   key na query string. Verificado: `200` e JSON.

A lição: "não achei a chamada" não é "não existe chamada", e proteção na página
não é proteção no endpoint.

## A cadeia completa

App key do site da Kawasaki: `MrXKUgA9snz6mlf5kyGE`.
Parâmetros comuns: `arik=<appKey>&aril=en-US&ariv=<origem duplo-encodada>`,
onde a origem é `https://kawasakienginesusa.com/parts-lookup?aribrand=kwe`.

**Sem o parâmetro `cb`, as respostas vêm como JSON puro** em vez de JSONP —
é isso que torna a leitura do servidor trivial.

### 1. Modelo digitado → nome completo

    GET /Parts/GetAutocomplete?brand=kwe&key=model&search=FX921V-ES06

    {"html":"","model":[{"Brand":"KWE","Data":"FX921V-ES06 4 Stroke Engine FX921V","Description":null}]}

O `Data` é o nome completo, e ele é obrigatório nos passos seguintes — é o que
o autocompletar da tela devolve quando o atendente **clica** na opção (digitar
e apertar Enter não serve, e foi assim que eu errei a primeira vez).

### 2. Nome completo → GUID do modelo

    GET /Search?arib=KWE&model=<nome completo>&page=1&responsive=y

Do HTML da resposta saem dois identificadores:

- `slugmid="VluFf8AFynZEPY-DKARqBA2"` → o `modelID`
- o primeiro GUID do corpo → `63e707fb-f388-4087-95ee-f0dbb8238447`, o **GUID do
  modelo**, que é o que importa

### 3. GUID do modelo + nome do conjunto → as peças

    GET /Parts/GetDetails?ariq=<caminho duplo-encodado>

O caminho é o mesmo que aparece no hash da URL do site:

    /Kawasaki_Engine/FX921V-ES06_4_Stroke_Engine_FX921V/CARBURETOR(1//2)/63e707fb-f388-4087-95ee-f0dbb8238447

**O GUID do conjunto NÃO é necessário.** Medido lado a lado:

| caminho | resposta |
|---|---|
| nome do conjunto + GUID do modelo | **71104 bytes, com as peças** |
| os dois GUIDs (como o site monta) | 71104 bytes, idêntico |
| GUID do modelo, sem conjunto | 286 bytes, `error has occurred` |
| nome + GUID do modelo + `/y` | 286 bytes, `error has occurred` |

Isso simplifica muito: basta o **GUID do modelo** (um por motor) e o **nome do
conjunto**. O sufixo `/y` só vale quando o GUID do conjunto está presente.

Na resposta vêm os códigos reais, e a distinção que o dono ensinou está lá:

    15004-0937  CARBURETOR-ASSY
    11009-2056  GASKET,SCREW-CARBURETOR

## O que ainda falta mapear

**A lista de nomes de conjunto por motor.** A chamada
`/Search/GetModelSearchAssembliesForPrompt?arib=kwe&modelID=&arim=&modelName=&modelUniqueTag=`
responde `200`, mas o `<div id="ariModelAssemblyTree">` vem **vazio** — a árvore
é preenchida por outra chamada que eu ainda não capturei. Sem ela, os nomes de
conjunto precisam vir de outro lugar (confirmados por motor, ou de uma lista
tentada contra a API).

Os do FX921V-ES06, lidos da tela:

    *KITS GASKET / CYLINDER HEAD     AIR-FILTER/MUFFLER      CARBURETOR(1/2)
    *MAINTENANCE PARTS               CONTROL-EQUIPMENT       CARBURETOR(2/2)
    *REPLACEMENT ENGINE / ACCESSORIES  COOLING-EQUIPMENT     CYLINDER/CRANKCASE
    *SHORT BLOCK ASSEMBLY            ELECTRIC-EQUIPMENT      FUEL-TANK/FUEL-VALVE
    LABEL                            LUBRICATION-EQUIPMENT   PISTON/CRANKSHAFT
    STARTER                          VALVE/CAMSHAFT

Note `CARBURETOR(1//2)` no caminho contra `CARBURETOR(1/2)` na tela: a barra é
duplicada dentro do segmento, porque o caminho usa `/` como separador.

## O que isto NÃO decide

Usar a app key acima é usar uma credencial que pertence ao site da Kawasaki, e o
`ariv` declara a origem deles. **Isso é decisão do dono, não técnica** — ele
optou por seguir ("eu queria que fosse igual a husqvarna e a kawasaki... eu
quero o mais completo possível"). Registrado aqui para que a escolha fique
explícita e revisável, não escondida no código.

Se algum dia a chave for revogada ou a origem passar a ser checada, o caminho de
reserva é o link direto: a URL do site com os dois GUIDs **abre a vista do
conjunto** (medido), e é isso que `utils/kawasaki-catalog.ts` já faz para os
modelos confirmados.
