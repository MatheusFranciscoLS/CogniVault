import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

/**
 * Vista explodida com zoom e arraste.
 *
 * Pedido do dono, com o motivo dele: *"quero que ele dê zoom se caso for
 * necessário e tiver muito pequeno na imagem"*. E é real — a vista do carburador
 * do HS 608 tem mais de 20 posições numeradas num desenho que cabe em 620px de
 * altura. Sem zoom, o atendente lê o número errado e pede a peça errada.
 *
 * As posições são posicionadas em **porcentagem** sobre o desenho, então uma
 * transformação de escala no contêiner move imagem e posições juntas — nenhuma
 * conta de coordenada é refeita no zoom. É o que mantém o clique certo em
 * qualquer ampliação.
 */

export type ExplodedHotspot = {
  key: string;
  /** Posição em porcentagem do desenho, como o catálogo entrega. */
  left: number;
  top: number;
  label: string;
  onSelect: () => void;
  tooltip?: ReactNode;
};

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.5;

export default function ExplodedView({
  imageUrl,
  alt,
  hotspots,
  maxHeight = 620,
}: {
  imageUrl: string;
  alt: string;
  hotspots: ExplodedHotspot[];
  maxHeight?: number;
}) {
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const clamp = (value: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(value.toFixed(2))));

  // Ao ampliar, o ponto que estava no centro continua no centro. Sem isto o
  // desenho "salta" para o canto superior esquerdo e o atendente perde a peça
  // que estava olhando.
  //
  // Recebe o PASSO, não o alvo: calcular o alvo fora do `setZoom` lia o estado
  // do render anterior, e cliques rápidos no mesmo ciclo viravam um só. Medido
  // no navegador: sete cliques em "+" paravam em 200% em vez de 400%.
  const changeZoom = useCallback((delta: number) => {
    const viewport = viewportRef.current;
    setZoom(current => {
      const target = clamp(current + delta);
      if (viewport && current > 0 && target !== current) {
        const ratio = target / current;
        const centerX = viewport.scrollLeft + viewport.clientWidth / 2;
        const centerY = viewport.scrollTop + viewport.clientHeight / 2;
        requestAnimationFrame(() => {
          viewport.scrollLeft = centerX * ratio - viewport.clientWidth / 2;
          viewport.scrollTop = centerY * ratio - viewport.clientHeight / 2;
        });
      }
      return target;
    });
  }, []);

  const resetZoom = useCallback(() => {
    setZoom(MIN_ZOOM);
    const viewport = viewportRef.current;
    if (viewport) {
      viewport.scrollLeft = 0;
      viewport.scrollTop = 0;
    }
  }, []);

  // Arrastar só faz sentido ampliado; em 1x não há para onde mover.
  const startDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const viewport = viewportRef.current;
    if (!viewport || zoom === MIN_ZOOM) return;
    // Clique em posição é clique, não arraste: deixa o botão receber o evento.
    if ((event.target as HTMLElement).closest('[data-hotspot]')) return;
    dragRef.current = { x: event.clientX, y: event.clientY, left: viewport.scrollLeft, top: viewport.scrollTop };
    setDragging(true);
  };

  useEffect(() => {
    if (!dragging) return;
    const move = (event: PointerEvent) => {
      const viewport = viewportRef.current;
      const start = dragRef.current;
      if (!viewport || !start) return;
      viewport.scrollLeft = start.left - (event.clientX - start.x);
      viewport.scrollTop = start.top - (event.clientY - start.y);
    };
    const end = () => {
      dragRef.current = null;
      setDragging(false);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    };
  }, [dragging]);

  const zoomed = zoom > MIN_ZOOM;

  return (
    <div className="overflow-hidden rounded-xl border border-ink-200 bg-white dark:border-ink-700 dark:bg-ink-900">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-100 px-3 py-2 dark:border-ink-800">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => changeZoom(-ZOOM_STEP)}
            disabled={zoom <= MIN_ZOOM}
            aria-label="Diminuir zoom"
            className="cv-touch-target grid w-11 place-items-center rounded-lg border border-ink-200 text-lg font-bold text-ink-700 transition hover:bg-ink-50 disabled:opacity-40 dark:border-ink-700 dark:text-ink-200 dark:hover:bg-ink-800"
          >
            −
          </button>
          <button
            type="button"
            onClick={() => changeZoom(ZOOM_STEP)}
            disabled={zoom >= MAX_ZOOM}
            aria-label="Aumentar zoom"
            className="cv-touch-target grid w-11 place-items-center rounded-lg border border-ink-200 text-lg font-bold text-ink-700 transition hover:bg-ink-50 disabled:opacity-40 dark:border-ink-700 dark:text-ink-200 dark:hover:bg-ink-800"
          >
            +
          </button>
          <span className="ml-1 min-w-11 text-xs font-bold tabular-nums text-ink-600 dark:text-ink-300">
            {Math.round(zoom * 100)}%
          </span>
          {zoomed && (
            <button
              type="button"
              onClick={resetZoom}
              className="cv-touch-target rounded-lg px-3 text-xs font-bold text-brand-700 transition hover:bg-brand-50 dark:text-brand-300 dark:hover:bg-brand-950/30"
            >
              Ajustar à tela
            </button>
          )}
        </div>
        <span className="text-[11px] text-ink-500 dark:text-ink-400">
          {zoomed ? 'Arraste para mover o desenho' : 'Toque no número para abrir a peça'}
        </span>
      </div>

      <div
        ref={viewportRef}
        onPointerDown={startDrag}
        style={{ maxHeight }}
        className={`overflow-auto p-3 ${zoomed ? (dragging ? 'cursor-grabbing' : 'cursor-grab') : ''}`}
      >
        {/* A escala vive aqui: imagem e posições estão no mesmo sistema de
            coordenadas, então ampliar o contêiner mantém cada número sobre a
            peça a que ele pertence. */}
        <div
          style={{ transform: `scale(${zoom})`, transformOrigin: 'top left', width: 'fit-content' }}
          className="relative mx-auto"
        >
          <img
            src={imageUrl}
            alt={alt}
            draggable={false}
            style={{ maxHeight }}
            className="block max-w-full select-none object-contain"
            loading="lazy"
          />
          {hotspots.map(hotspot => (
            <div
              key={hotspot.key}
              data-hotspot="true"
              style={{ left: `${hotspot.left}%`, top: `${hotspot.top}%` }}
              className="group absolute -translate-x-1/2 -translate-y-1/2"
            >
              <button
                type="button"
                onClick={hotspot.onSelect}
                /* O alvo NÃO cresce com o zoom: 24px reais em qualquer
                   ampliação. Escalar o botão junto faria o número cobrir as
                   posições vizinhas justamente quando o atendente amplia para
                   separá-las. */
                style={{ transform: `scale(${1 / zoom})` }}
                className="grid h-6 min-w-6 place-items-center rounded-full border-2 border-white bg-ink-900 px-1 text-[9px] font-black text-white shadow-md transition hover:bg-accent-700 focus:outline-none focus:ring-2 focus:ring-brand-400"
              >
                {hotspot.label}
              </button>
              {/* A dica também não cresce com o zoom: em 4x ela cobriria o
                  desenho inteiro justamente quando o atendente amplia para
                  enxergar melhor. */}
              {hotspot.tooltip ? (
                <div style={{ transform: `scale(${1 / zoom})`, transformOrigin: 'bottom center' }} className="absolute bottom-full left-1/2 -translate-x-1/2">
                  {hotspot.tooltip}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
