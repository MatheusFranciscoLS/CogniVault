// Teto de tamanho para texto que passa por expressão regular com backtracking
// polinomial. O CodeQL (js/polynomial-redos) acusa 8 pontos assim, e o remédio é
// o mesmo em todos: nunca entregar ao regex mais texto do que o domínio comporta.
//
// O chat já recusa pergunta acima de 1.000 caracteres, então em produção o teto
// não corta nada; ele existe para a função não depender de quem a chama.
export const MAX_REGEX_INPUT_LENGTH = 1000;

export function capRegexInput(value: string, max: number = MAX_REGEX_INPUT_LENGTH): string {
  return value.length > max ? value.slice(0, max) : value;
}
