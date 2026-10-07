import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PanelErrorBoundary } from './PanelErrorBoundary';

function Bomb(): never {
  throw new Error('campo a menos na resposta');
}

afterEach(cleanup);

describe('PanelErrorBoundary', () => {
  it('um erro dentro do painel fecha só o painel: o que está atrás continua na tela', () => {
    // React registra o erro capturado no console; silenciar mantém a saída legível.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    render(
      <div>
        <p>busca e cesta do atendente</p>
        <PanelErrorBoundary onClose={() => undefined}>
          <Bomb />
        </PanelErrorBoundary>
      </div>,
    );

    expect(screen.getByText('busca e cesta do atendente')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('Não foi possível abrir este painel.');
    // O detalhe técnico vai para o console, não para a tela do balcão.
    expect(screen.getByRole('alert').textContent).not.toContain('campo a menos');
    expect(consoleError.mock.calls.some(call => String(call[0]).includes('Painel interrompido por erro'))).toBe(true);
  });

  it('o botão chama onClose, e o rótulo pode ser trocado', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const onClose = vi.fn();

    render(
      <PanelErrorBoundary onClose={onClose} closeLabel="Voltar ao atendimento">
        <Bomb />
      </PanelErrorBoundary>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Voltar ao atendimento' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('painel sem erro aparece normalmente, sem alerta', () => {
    render(
      <PanelErrorBoundary onClose={() => undefined}>
        <p>vista explodida</p>
      </PanelErrorBoundary>,
    );

    expect(screen.getByText('vista explodida')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
