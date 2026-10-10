import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PageTabs from './PageTabs';

afterEach(cleanup);
const tabs = [{ id: 'a', label: 'Resumo' }, { id: 'b', label: 'Demanda', badge: 2 }, { id: 'c', label: 'Lista' }] as const;

describe('abas em pílula', () => {
  it('só a selecionada entra na ordem do Tab, e o selo aparece só com número', () => {
    render(<PageTabs tabs={tabs} value="b" onChange={() => undefined} label="Seções" />);
    expect(screen.getByRole('tab', { name: /Demanda/ }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: /Demanda/ }).getAttribute('tabindex')).toBe('0');
    expect(screen.getByRole('tab', { name: 'Resumo' }).getAttribute('tabindex')).toBe('-1');
    expect(screen.getByText('2').textContent).toBe('2');
    expect(screen.getByRole('tab', { name: 'Lista' }).textContent).toBe('Lista');
  });

  it('clique troca; setas percorrem e dão a volta', () => {
    const onChange = vi.fn();
    render(<PageTabs tabs={tabs} value="c" onChange={onChange} label="Seções" />);
    fireEvent.click(screen.getByRole('tab', { name: 'Resumo' }));
    expect(onChange).toHaveBeenLastCalledWith('a');
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Lista' }), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith('a');
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Lista' }), { key: 'ArrowLeft' });
    expect(onChange).toHaveBeenLastCalledWith('b');
  });
});
