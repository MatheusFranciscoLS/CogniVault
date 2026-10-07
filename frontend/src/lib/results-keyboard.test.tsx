import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ResultsTable } from '../components/parts-v2/ResultsTable';
import PartRow from '../components/parts-v2/PartRow';
import { focusFirstResult } from './results-keyboard';

afterEach(cleanup);

function tela(onAdd = vi.fn()) {
  render(
    <div>
      <input name="busca" aria-label="busca" />
      <ResultsTable>
        <PartRow code="587106701" name="CARBURADOR" details={[]} origin="CATALOG" price={378.26} onCopy={() => {}} onAdd={onAdd} />
        <PartRow code="501691702" name="VELA" details={[]} origin="CATALOG" price={21.15} onCopy={() => {}} onAdd={() => {}} />
        <PartRow code="503443201" name="FILTRO" details={[]} origin="PRICE_LIST" price={null} onCopy={() => {}} onAdd={() => {}} />
      </ResultsTable>
    </div>,
  );
  return {
    copiar: (codigo: string) => screen.getByRole('button', { name: `Copiar código ${codigo}` }),
    busca: screen.getByLabelText('busca'),
  };
}

describe('teclado na lista de resultados', () => {
  it('↓ e ↑ percorrem o código de cada linha', () => {
    const { copiar } = tela();
    copiar('587106701').focus();
    fireEvent.keyDown(copiar('587106701'), { key: 'ArrowDown' });
    expect(document.activeElement).toBe(copiar('501691702'));
    fireEvent.keyDown(copiar('501691702'), { key: 'ArrowDown' });
    expect(document.activeElement).toBe(copiar('503443201'));
    fireEvent.keyDown(copiar('503443201'), { key: 'ArrowUp' });
    expect(document.activeElement).toBe(copiar('501691702'));
  });

  it('↓ na última linha fica nela, e ↑ na primeira volta para o campo de busca', () => {
    const { copiar, busca } = tela();
    copiar('503443201').focus();
    fireEvent.keyDown(copiar('503443201'), { key: 'ArrowDown' });
    expect(document.activeElement).toBe(copiar('503443201'));
    copiar('587106701').focus();
    fireEvent.keyDown(copiar('587106701'), { key: 'ArrowUp' });
    expect(document.activeElement).toBe(busca);
  });

  it('+ põe a linha focada no orçamento', () => {
    const onAdd = vi.fn();
    const { copiar } = tela(onAdd);
    copiar('587106701').focus();
    fireEvent.keyDown(copiar('587106701'), { key: '+' });
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it('com Ctrl ou Alt não interfere (atalhos do navegador seguem valendo)', () => {
    const onAdd = vi.fn();
    const { copiar } = tela(onAdd);
    copiar('587106701').focus();
    fireEvent.keyDown(copiar('587106701'), { key: 'ArrowDown', ctrlKey: true });
    expect(document.activeElement).toBe(copiar('587106701'));
    fireEvent.keyDown(copiar('587106701'), { key: '+', altKey: true });
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('seta dentro de um campo de texto não é roubada', () => {
    const { busca } = tela();
    busca.focus();
    fireEvent.keyDown(busca, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(busca);
  });

  it('focusFirstResult leva à primeira linha, e devolve false quando não há lista', () => {
    const { copiar } = tela();
    expect(focusFirstResult()).toBe(true);
    expect(document.activeElement).toBe(copiar('587106701'));
    cleanup();
    expect(focusFirstResult()).toBe(false);
  });
});
