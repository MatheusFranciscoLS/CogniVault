import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { apiJson } from '../lib';
import { resolveItemLookup, type OfficialHit } from '../lib/item-lookup';
import { normalizeCode, useMasterPrices } from './machines/master-part-prices';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export type CustomItemInput = {
  name: string;
  price: number | undefined;
  quantity: number;
  /** Código digitado (sem máscara) ou vazio. */
  code: string;
  /** Marca que o sistema reconheceu pelo código (Husqvarna, Briggs & Stratton, Kawasaki, Kohler) ou `undefined`. */
  manufacturer: string | undefined;
};

// Um atalho só, por decisão do dono. Os outros saíram pelo que eles são: "Limpeza e regulagem" e "Graxa de transmissão" já estão dentro da mão de obra
// (cobrar à parte seria cobrar duas vezes) e "Óleo 2T" é PEÇA, que entra pelo cadastro ou como item avulso digitado.
const CUSTOM_ITEM_PRESETS = ['Mão de obra / Revisão Geral'];

/** Espera o balcão parar de digitar antes de consultar: um código de 9 dígitos faria 9 consultas. */
function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), ms);
    return () => window.clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

/**
 * Item avulso: serviço, mão de obra ou peça de QUALQUER marca.
 *
 * A Vardão é assistência multimarcas (10 fornecedores ou mais). O dono pediu (2026-10-09): código **Husqvarna, Briggs, Kawasaki ou Kohler** puxa
 * descrição (e o preço, quando a loja tem a peça) sozinho; **qualquer outro código não puxa nada** e ele escreve a descrição e o preço. Por isso o
 * código é opcional e nada aqui trava o que o atendente digita: o que o sistema preenche é só sugestão, e basta escrever por cima.
 */
export default function CustomItemForm({ onAdd, onClose, embedded = false }: { onAdd: (item: CustomItemInput) => void; onClose: () => void; /** Na aba Conserto o formulário é parte da página: sem fechar. */ embedded?: boolean }) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [qty, setQty] = useState(1);
  // O que o atendente escreveu à mão nunca é sobrescrito pelo que o sistema acha; sem isso, achar o código apagaria o texto dele.
  const [nameTouched, setNameTouched] = useState(false);
  const [priceTouched, setPriceTouched] = useState(false);
  // Manutenção quase nunca é um item só (carburador + mangueira + filtro + junta): o formulário fica aberto e volta para o código.
  const [added, setAdded] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);

  const debouncedCode = useDebounced(code, 350);
  const typed = normalizeCode(code);
  const asked = normalizeCode(debouncedCode);
  const enabled = asked.length >= 4;
  const settled = typed === asked;

  const prices = useMasterPrices(enabled ? [debouncedCode] : []);
  const official = useQuery({
    queryKey: ['item-official-hits', asked],
    // Só código com cara de código (3 dígitos ou mais), como o resto do produto: "TRAMONTINA" nunca existe no índice dos motores.
    enabled: enabled && (asked.match(/\d/g) || []).length >= 3,
    staleTime: 5 * 60 * 1000,
    retry: false,
    queryFn: async () => (await apiJson<{ officialParts: OfficialHit[] }>(`/api/official-parts/by-code?code=${encodeURIComponent(asked)}`, { timeoutMs: 10_000 })).officialParts ?? [],
  });

  const lookup = enabled && settled
    ? resolveItemLookup({ code: debouncedCode, store: prices.data?.prices[asked] ?? null, official: official.data ?? [] })
    : ({ kind: 'NONE' } as const);
  const searching = enabled && (!settled || prices.isFetching || official.isFetching);
  const found = lookup.kind === 'FOUND' ? lookup : null;

  // Valores derivados (sem efeito): o que o sistema achou aparece enquanto o atendente não escreveu por cima.
  const shownName = nameTouched ? name : (found?.name ?? name);
  const shownPrice = priceTouched ? price : (found?.price !== undefined ? String(found.price) : price);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const cleanName = shownName.trim();
    if (!cleanName) return;
    const priceNum = shownPrice ? parseFloat(shownPrice.replace(',', '.')) : undefined;
    onAdd({
      name: cleanName,
      price: priceNum !== undefined && !Number.isNaN(priceNum) && priceNum >= 0 ? priceNum : undefined,
      quantity: Math.max(1, qty || 1),
      code: typed,
      manufacturer: found?.manufacturer,
    });
    setCode('');
    setName('');
    setPrice('');
    setQty(1);
    setNameTouched(false);
    setPriceTouched(false);
    setAdded(count => count + 1);
    codeRef.current?.focus();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold">Serviço ou item avulso</h3>
        {!embedded && <Button type="button" variant="ghost" size="icon-sm" onClick={onClose} aria-label="Fechar"><X className="size-5" /></Button>}
      </div>

      <div className="flex flex-wrap gap-2">
        {CUSTOM_ITEM_PRESETS.map(preset => (
          <Button key={preset} type="button" variant="outline" size="sm" onClick={() => { setName(preset); setNameTouched(true); }}>{preset}</Button>
        ))}
      </div>

      <div className="space-y-1.5">
        <label htmlFor="custom-item-code" className="block text-sm font-medium text-muted-foreground">Código da peça (opcional)</label>
        <Input
          id="custom-item-code"
          ref={codeRef}
          type="text"
          value={code}
          onChange={event => setCode(event.target.value)}
          autoComplete="off"
          spellCheck={false}
          translate="no"
          placeholder="Husqvarna, Briggs, Kawasaki ou Kohler preenchem sozinhos"
          className="font-code text-base font-semibold"
        />
        {/* Uma linha de estado, só quando há o que dizer. Nunca bloqueia: o código de outro fornecedor simplesmente não preenche nada. */}
        {enabled && (
          <p role="status" className="text-sm text-muted-foreground">
            {searching ? 'Procurando…'
              : found ? (found.origin === 'LOJA'
                ? `Achei no cadastro da loja${found.manufacturer ? ` (${found.manufacturer})` : ''}: descrição${found.price !== undefined ? ' e preço' : ''} preenchidos.${found.confirmPrice ? ' Confira o preço.' : ''}${found.price === undefined ? ' Escreva o preço.' : ''}`
                : `Achei no catálogo ${found.manufacturer}: descrição preenchida. Escreva o preço.`)
                : 'Não achei este código: escreva a descrição e o preço.'}
          </p>
        )}
      </div>

      <Input
        type="text"
        required
        value={shownName}
        onChange={event => { setName(event.target.value); setNameTouched(true); }}
        placeholder="Descrição do serviço ou item…"
        aria-label="Descrição do serviço ou item"
        className="text-base"
      />

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label htmlFor="custom-item-price" className="block text-sm font-medium text-muted-foreground">Preço (R$)</label>
          <Input id="custom-item-price" type="number" inputMode="decimal" step="0.01" min="0" value={shownPrice} onChange={event => { setPrice(event.target.value); setPriceTouched(true); }} placeholder="0,00" className="font-code text-base font-semibold" />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="custom-item-qty" className="block text-sm font-medium text-muted-foreground">Quantidade</label>
          <Input id="custom-item-qty" type="number" min="1" value={qty} onChange={event => setQty(parseInt(event.target.value, 10) || 1)} className="font-code text-base font-semibold" />
        </div>
      </div>

      <div className="flex gap-2">
        <Button type="submit" className="flex-1">Adicionar</Button>
        {!embedded && <Button type="button" variant="outline" onClick={onClose}>{added > 0 ? 'Concluir' : 'Cancelar'}</Button>}
      </div>
    </form>
  );
}
