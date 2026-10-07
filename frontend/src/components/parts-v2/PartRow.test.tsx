import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PartRow from './PartRow';

afterEach(cleanup);

const base = {
  code: '587106701',
  name: 'CARBURADOR',
  details: ['143RII', 'PNC 967332904', 'Pos. 15'],
  origin: 'CATALOG' as const,
  price: 187.4,
  onSelect: () => undefined,
  onAdd: () => undefined,
  menu: [{ label: 'Copiar código', onSelect: () => undefined }],
};

describe('PartRow', () => {
  it('mostra o código inteiro, o preço em reais e a origem como texto (não como etiqueta)', () => {
    render(<PartRow {...base} onOpen={() => undefined} />);

    // Código nunca truncado nem alterado: é o que se confere na peça física.
    expect(screen.getByText('587106701')).toBeTruthy();
    expect(screen.getByText(/187,40/)).toBeTruthy();
    expect(screen.getByText('Catálogo · 143RII · PNC 967332904 · Pos. 15')).toBeTruthy();
  });

  it('o botão de adicionar tem um só rótulo, "+ Orçamento", e leva o nome da peça para o leitor de tela', () => {
    const onAdd = vi.fn();
    render(<PartRow {...base} onAdd={onAdd} />);

    const botao = screen.getByRole('button', { name: /\+ Orçamento/ });
    expect(botao.textContent).toContain('+ Orçamento');
    expect(botao.textContent).toContain('CARBURADOR');
    fireEvent.click(botao);
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it('peça já no orçamento troca para "No orçamento · N", com o mesmo botão', () => {
    render(<PartRow {...base} quantityInCart={3} />);

    expect(screen.getByRole('button', { name: /No orçamento · 3/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /\+ Orçamento/ })).toBeNull();
  });

  it('o código abre os detalhes e tem o nome que o e2e e o leitor de tela esperam', () => {
    const onOpen = vi.fn();
    render(<PartRow {...base} onOpen={onOpen} />);

    fireEvent.click(screen.getByRole('button', { name: 'Abrir detalhes de CARBURADOR' }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('sem preço mostra o aviso, e o cadastro comercial pode oferecer o caminho do Parceiro', () => {
    const { rerender } = render(<PartRow {...base} price={null} />);
    expect(screen.getByText('Sem preço')).toBeTruthy();

    rerender(<PartRow {...base} price={null} origin="PRICE_LIST" priceMissing={<button type="button">Consultar no Parceiro</button>} />);
    expect(screen.getByRole('button', { name: 'Consultar no Parceiro' })).toBeTruthy();
    expect(screen.getByText(/^Cadastro · /)).toBeTruthy();
  });
});
