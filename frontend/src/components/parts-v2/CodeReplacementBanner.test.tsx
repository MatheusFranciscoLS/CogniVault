import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import CodeReplacementBanner from './CodeReplacementBanner';

afterEach(cleanup);

describe('CodeReplacementBanner', () => {
  const chain = [
    { from: '506027201', to: '506027207' },
    { from: '506027207', to: '587329502' },
    { from: '587329502', to: '587329503' },
  ];

  it('mostra o que foi digitado e o código NOVO (o último da cadeia)', () => {
    render(<CodeReplacementBanner asked="506027201" latest="587329503" chain={chain} onCopy={() => {}} />);
    expect(screen.getByRole('alert').textContent).toContain('506027201');
    expect(screen.getByText('587329503')).toBeTruthy();
  });

  it('o caminho lista só os passos do meio, sem repetir o novo', () => {
    render(<CodeReplacementBanner asked="506027201" latest="587329503" chain={chain} onCopy={() => {}} />);
    const caminho = screen.getByText(/Passou por/).textContent;
    expect(caminho).toContain('506027207 → 587329502');
    expect(caminho).not.toContain('587329503');
  });

  it('troca direta (um passo só) não mostra caminho', () => {
    render(<CodeReplacementBanner asked="532196495" latest="532199606" chain={[{ from: '532196495', to: '532199606' }]} onCopy={() => {}} />);
    expect(screen.queryByText(/Passou por/)).toBeNull();
  });

  it('copiar leva o código novo, e NÃO existe "buscar de novo" (é a mesma peça)', () => {
    const copiar = vi.fn();
    render(<CodeReplacementBanner asked="1" latest="587329503" onCopy={copiar} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copiar código novo' }));
    expect(copiar).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: /Buscar/ })).toBeNull();
  });

  it('mostra ao lado o que o balcão faz com o código novo (preço e orçamento)', () => {
    render(<CodeReplacementBanner asked="1" latest="2" onCopy={() => {}}><button type="button">+ Orçamento</button></CodeReplacementBanner>);
    expect(screen.getByRole('button', { name: '+ Orçamento' })).toBeTruthy();
  });

  it('depois de copiar o botão avisa', () => {
    render(<CodeReplacementBanner asked="1" latest="2" copied onCopy={() => {}} />);
    expect(screen.getByRole('button', { name: 'Copiado' })).toBeTruthy();
  });
});
