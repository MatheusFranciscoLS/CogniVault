import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { api, json } from '../lib';
import { pdfPageUrl } from '../pdf';
import type { ChatResponse, FeedbackOption, RetrievalSource } from '../types';

type FeedbackReason = 'WRONG_CODE' | 'WRONG_PNC' | 'WRONG_MODEL' | 'WRONG_PART' | 'OTHER';
type Message = {
  id: string;
  role: 'user' | 'ai';
  text: string;
  response?: ChatResponse;
  query?: string;
  pnc?: string;
  feedback?: 'correct' | 'wrong' | 'corrected';
  showReasons?: boolean;
  showCorrections?: boolean;
  reason?: FeedbackReason;
  feedbackId?: string;
  feedbackPending?: boolean;
  feedbackError?: string;
};
type Equipment = { id: string; manufacturer: string; model: string; pnc: string; serial?: string; label: string };
type Recent = { id: string; query: string; pnc: string };

const EQUIPMENT_KEY = 'cognivault_saved_equipment';
const RECENT_KEY = 'cognivault_recent_searches';
const quickPrompts = ['Filtro de ar', 'Carburador', 'Correia', 'Vela de ignição'];
const reasons: Array<[FeedbackReason, string]> = [
  ['WRONG_CODE', 'Código incorreto'],
  ['WRONG_PNC', 'PNC incorreto'],
  ['WRONG_MODEL', 'Modelo incorreto'],
  ['WRONG_PART', 'Peça incorreta'],
  ['OTHER', 'Outro motivo'],
];

const retrievalLabels: Record<RetrievalSource, string> = {
  DIRECT_CODE: 'Código exato',
  SEMANTIC: 'Semântica',
  LEXICAL: 'Vocabulário técnico',
  FULL_TEXT: 'Texto do catálogo',
  FUZZY: 'Tolerância a digitação',
};

const read = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
};

const save = <T,>(key: string, value: T) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Preferências locais não devem bloquear uma consulta técnica.
  }
};

const createId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

function confidencePresentation(response: ChatResponse) {
  if (!response.match) return null;
  const presentations = {
    EXACT: { label: 'Correspondência exata', style: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
    HIGH: { label: 'Confiança alta', style: 'bg-blue-50 text-blue-700 ring-blue-200' },
    REVIEW: { label: 'Requer conferência', style: 'bg-amber-50 text-amber-800 ring-amber-200' },
  } as const;
  return presentations[response.match.level];
}

function Guidance({ response }: { response: ChatResponse }) {
  if (!response.guidance) return null;
  const palette = response.status === 'FOUND'
    ? 'border-emerald-200 bg-emerald-50/70 text-emerald-950'
    : response.status === 'NOT_FOUND'
      ? 'border-rose-200 bg-rose-50/70 text-rose-950'
      : 'border-amber-200 bg-amber-50/70 text-amber-950';

  return (
    <div className={`rounded-2xl border p-3.5 ${palette}`}>
      <div className="text-xs font-bold">{response.guidance.title}</div>
      <div className="mt-1 text-xs leading-5 opacity-75">{response.guidance.description}</div>
      {response.guidance.tips.length ? (
        <ul className="mt-2 space-y-1 text-[11px] opacity-75">
          {response.guidance.tips.map(tip => <li key={tip}>• {tip}</li>)}
        </ul>
      ) : null}
    </div>
  );
}

function SerialFollowUp({ disabled, onSubmit }: { disabled: boolean; onSubmit: (serial: string) => void }) {
  const [serial, setSerial] = useState('');
  const submitSerial = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const clean = serial.replace(/\D/g, '');
    if (clean.length < 6 || clean.length > 16) return;
    onSubmit(clean);
  };

  return (
    <form onSubmit={submitSerial} className="mt-3 rounded-xl border border-amber-200 bg-white p-3">
      <label className="block text-xs font-semibold text-slate-700" htmlFor="guided-serial-number">Digite o número de série da etiqueta</label>
      <p className="mt-1 text-[11px] leading-4 text-slate-400">Não é preciso repetir peça, modelo ou PNC. O CogniVault continuará a consulta anterior com este S/N.</p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          id="guided-serial-number"
          inputMode="numeric"
          autoComplete="off"
          value={serial}
          onChange={event => setSerial(event.target.value.replace(/\D/g, '').slice(0, 16))}
          placeholder="Ex.: 20240200001"
          minLength={6}
          maxLength={16}
          required
          className="cv-field min-w-0 flex-1 text-sm"
        />
        <button type="submit" disabled={disabled || serial.length < 6} className="cv-primary px-4 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50">Continuar com S/N</button>
      </div>
    </form>
  );
}

function Interpretation({ response }: { response: ChatResponse }) {
  if (!response.interpreted) return null;
  const entries = [
    response.interpreted.partDescription ? ['Peça', response.interpreted.partDescription] : null,
    response.interpreted.manufacturer ? ['Fabricante', response.interpreted.manufacturer] : null,
    response.interpreted.model ? ['Modelo', response.interpreted.model] : null,
    response.interpreted.pnc ? ['PNC', response.interpreted.pnc] : null,
    response.interpreted.partNumber ? ['Código', response.interpreted.partNumber] : null,
  ].filter((entry): entry is string[] => Boolean(entry));

  if (!entries.length) return null;
  return (
    <details className="mt-3 rounded-xl border border-slate-200 bg-white/80 p-3 text-xs text-slate-600">
      <summary className="cursor-pointer font-semibold text-slate-700">O que o assistente entendeu</summary>
      <div className="mt-2 flex flex-wrap gap-2">
        {entries.map(([label, value]) => <span key={`${label}-${value}`} className="rounded-full bg-slate-100 px-2.5 py-1"><b>{label}:</b> {value}</span>)}
      </div>
    </details>
  );
}

function ReliabilityDetails({ response }: { response: ChatResponse }) {
  const evidence = response.match?.evidence || [];
  const sources = response.match?.retrievalSources || [];
  const context = response.technicalContext || [];
  if (!evidence.length && !sources.length && !context.length) return null;

  return (
    <details open={response.match?.level === 'REVIEW'} className="mt-3 rounded-xl border border-blue-100 bg-blue-50/40 p-3 text-xs text-slate-600">
      <summary className="cursor-pointer font-semibold text-[#173f76]">Evidências da decisão</summary>
      {sources.length ? (
        <div className="mt-3">
          <div className="text-[10px] font-bold uppercase tracking-[.1em] text-slate-400">Métodos que encontraram a peça</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {sources.map(source => <span key={source} className="rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold text-[#1d4f91] ring-1 ring-blue-100">{retrievalLabels[source]}</span>)}
          </div>
        </div>
      ) : null}
      {evidence.length ? (
        <ul className="mt-3 space-y-1.5 leading-5 text-slate-600">
          {evidence.map((item, index) => <li key={`${item}-${index}`}>• {item}</li>)}
        </ul>
      ) : null}
      {context.length ? (
        <div className="mt-3 border-t border-blue-100 pt-3">
          <div className="text-[10px] font-bold uppercase tracking-[.1em] text-slate-400">Memória técnica da mesma fonte</div>
          <p className="mt-1 text-[10px] leading-4 text-slate-400">Estes trechos servem para conferir contexto mecânico. O Part Number não é extraído deles; o código exibido vem do registro estruturado da peça.</p>
          <div className="mt-2 grid gap-2">
            {context.map((item, index) => (
              <div key={`${item.filename}-${item.page}-${item.section}-${index}`} className="rounded-lg border border-blue-100 bg-white p-2.5">
                <div className="flex flex-wrap gap-x-2 gap-y-1 text-[10px] font-semibold text-[#173f76]">
                  <span>{item.filename}</span>
                  {item.page ? <span>pág. {item.page}</span> : null}
                  {item.section ? <span>vista {item.section}</span> : null}
                </div>
                <div className="mt-1 line-clamp-4 whitespace-pre-line text-[10px] leading-4 text-slate-500">{item.excerpt}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </details>
  );
}

function ResultCard({
  response,
  onCopyCode,
  onCopySummary,
  onAccess,
}: {
  response: ChatResponse;
  onCopyCode: () => void;
  onCopySummary: () => void;
  onAccess: (mode: 'view' | 'download') => void;
}) {
  if (!response.part) return null;
  const part = response.part;
  const confidence = confidencePresentation(response);

  return (
    <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-4 text-slate-800 shadow-sm">
      <div className="flex flex-wrap justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-[.15em] text-[#1d4f91]">Resultado técnico</div>
          <div className="mt-1 font-semibold">{part.name}</div>
          <div className="mt-2 break-all text-2xl font-bold text-[#1d4f91]">{part.partNumber}</div>
        </div>
        {confidence ? <span className={`h-fit rounded-full px-3 py-1 text-xs font-semibold ring-1 ${confidence.style}`}>{confidence.label}</span> : null}
      </div>

      {response.match ? <div className="mt-3 rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-500">{response.match.explanation}</div> : null}
      <ReliabilityDetails response={response}/>

      <div className="mt-4 grid gap-2 text-xs sm:grid-cols-2">
        <div className="rounded-xl bg-slate-50 p-3">Modelo<b className="mt-1 block">{part.model}</b></div>
        <div className="rounded-xl bg-slate-50 p-3">PNC<b className="mt-1 block">{part.pnc || 'Não informado'}</b></div>
        <div className="rounded-xl bg-slate-50 p-3">Seção<b className="mt-1 block">{part.section || '—'}</b></div>
        <div className="rounded-xl bg-slate-50 p-3">Posição / página<b className="mt-1 block">{part.position || '—'} · pág. {part.page ?? '—'}</b></div>
      </div>
      <div className="mt-3 rounded-xl border border-slate-200 p-3 text-xs">Catálogo<b className="mt-1 block break-words">{part.filename}</b></div>
      {part.notes ? <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"><b className="block">Observação do catálogo</b><span className="mt-1 block">{part.notes}</span></div> : null}

      {(part.applications?.length || 0) > 1 ? (
        <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50/60 p-3">
          <div className="text-[10px] font-bold uppercase tracking-[.1em] text-blue-700">Aplicações confirmadas deste código</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {part.applications?.map(application => <span key={`${application.model}-${application.pnc}`} className="rounded-full bg-white px-2.5 py-1 text-[10px] font-medium text-blue-800 ring-1 ring-blue-100">{application.model} · PNC {application.pnc}</span>)}
          </div>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={onCopyCode} className="rounded-xl bg-[#1d4f91] px-3 py-2 text-xs font-semibold text-white">Copiar código</button>
        <button type="button" onClick={onCopySummary} className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold">Copiar ficha</button>
        <button type="button" onClick={() => onAccess('view')} className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold">Abrir na página</button>
        <button type="button" onClick={() => onAccess('download')} className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold">Baixar PDF</button>
      </div>
    </div>
  );
}

export default function ChatPanel({ storageScope }: { storageScope: string }) {
  const equipmentKey = `${EQUIPMENT_KEY}:${storageScope}`;
  const recentKey = `${RECENT_KEY}:${storageScope}`;
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const [model, setModel] = useState('');
  const [pnc, setPnc] = useState('');
  const [serial, setSerial] = useState('');
  const [loading, setLoading] = useState(false);
  const [equipment, setEquipment] = useState<Equipment[]>(() => read<Equipment[]>(equipmentKey, []));
  const [recent, setRecent] = useState<Recent[]>(() => read<Recent[]>(recentKey, []));
  const [notice, setNotice] = useState('');
  const [pdf, setPdf] = useState<{ url: string; page: number | null; title: string } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const questionRef = useRef<HTMLInputElement | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const noticeTimerRef = useRef<number | null>(null);
  const conversationVersionRef = useRef(0);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, loading]);

  useEffect(() => {
    if (!pdf) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPdf(null);
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [pdf]);

  useEffect(() => () => {
    requestRef.current?.abort();
    if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
  }, []);

  const baseQuestion = question.trim();
  const machine = [manufacturer.trim(), model.trim()].filter(Boolean).join(' ');
  const serialContext = serial.trim() ? `S/N ${serial.trim()}` : '';
  const equipmentContext = [machine, serialContext].filter(Boolean).join(' · ');
  const composed = baseQuestion ? (equipmentContext ? `${baseQuestion} do equipamento ${equipmentContext}` : baseQuestion) : '';

  const notify = (text: string) => {
    if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
    setNotice(text);
    noticeTimerRef.current = window.setTimeout(() => setNotice(''), 1800);
  };

  const remember = (query: string, usedPnc: string) => {
    const next = [{ id: createId(), query, pnc: usedPnc }, ...recent.filter(item => item.query !== query || item.pnc !== usedPnc)].slice(0, 6);
    setRecent(next);
    save(recentKey, next);
  };

  const ask = async (query: string, forcedPnc?: string, store = true, selectedPartId?: string) => {
    if (!query.trim() || loading) return;
    const usedPnc = forcedPnc || pnc || '';
    const controller = new AbortController();
    const conversationVersion = conversationVersionRef.current;
    requestRef.current = controller;
    setLoading(true);
    setMessages(current => [...current, { id: createId(), role: 'user', text: query }]);

    try {
      const response = await api('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: query, pnc: usedPnc || undefined, selectedPartId }),
        timeoutMs: 60_000,
        signal: controller.signal,
      });
      const data = await json<ChatResponse>(response);
      if (conversationVersion !== conversationVersionRef.current) return;
      setMessages(current => [...current, { id: createId(), role: 'ai', text: data.answer, response: data, query, pnc: usedPnc }]);
      if (store) remember(query, usedPnc);
    } catch (error) {
      if (conversationVersion !== conversationVersionRef.current) return;
      if (controller.signal.aborted) {
        setMessages(current => [...current, { id: createId(), role: 'ai', text: 'Consulta cancelada. Você pode ajustar os dados e tentar novamente.' }]);
      } else {
        setMessages(current => [...current, { id: createId(), role: 'ai', text: error instanceof Error ? error.message : 'Erro na consulta.' }]);
      }
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
      setLoading(false);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!composed) return;
    const query = composed;
    setQuestion('');
    void ask(query);
  };

  const cancel = () => requestRef.current?.abort();

  const positiveFeedback = async (index: number) => {
    const message = messages[index];
    const part = message.response?.part;
    if (!message.query || !part) return;
    setMessages(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, feedbackPending: true, feedbackError: undefined } : item));
    try {
      const result = await json<{ feedbackId: string }>(await api('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: message.query, partId: part.id, correct: true, pnc: message.pnc }),
      }));
      setMessages(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, feedback: 'correct', feedbackId: result.feedbackId, feedbackPending: false, showReasons: false, showCorrections: false } : item));
      notify('Confirmação registrada.');
    } catch (error) {
      const feedbackError = error instanceof Error ? error.message : 'Não foi possível salvar o feedback.';
      setMessages(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, feedbackPending: false, feedbackError } : item));
      notify(feedbackError);
    }
  };

  const startNegative = async (index: number) => {
    const message = messages[index];
    const part = message.response?.part;
    if (!message.query || !part) return;
    setMessages(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, feedbackPending: true, feedbackError: undefined } : item));
    try {
      const result = await json<{ feedbackId: string }>(await api('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: message.query, partId: part.id, correct: false, pnc: message.pnc, reason: 'OTHER' }),
      }));
      setMessages(current => current.map((item, itemIndex) => itemIndex === index ? {
        ...item, feedback: 'wrong', feedbackId: result.feedbackId, feedbackPending: false,
        reason: 'OTHER', showReasons: true, showCorrections: false,
      } : item));
      notify('Feedback negativo salvo. Você pode detalhar o motivo.');
    } catch (error) {
      const feedbackError = error instanceof Error ? error.message : 'Não foi possível salvar o feedback.';
      setMessages(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, feedbackPending: false, feedbackError } : item));
      notify(feedbackError);
    }
  };

  const chooseReason = async (index: number, reason: FeedbackReason) => {
    const message = messages[index];
    if (!message.feedbackId) return;
    setMessages(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, feedbackPending: true, feedbackError: undefined } : item));
    try {
      await json(await api(`/api/feedback/${message.feedbackId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }),
      }));
      setMessages(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, reason, feedbackPending: false, showReasons: false, showCorrections: true } : item));
    } catch (error) {
      const feedbackError = error instanceof Error ? error.message : 'Não foi possível detalhar o feedback.';
      setMessages(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, feedbackPending: false, feedbackError } : item));
      notify(feedbackError);
    }
  };

  const negativeFeedback = async (index: number, corrected?: FeedbackOption) => {
    const message = messages[index];
    const part = message.response?.part;
    if (!message.query || !part || !message.reason || !message.feedbackId) return;
    setMessages(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, feedbackPending: true, feedbackError: undefined } : item));
    try {
      await json(await api(`/api/feedback/${message.feedbackId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ correctedPartId: corrected?.id, reason: message.reason }),
      }));
      setMessages(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, feedback: corrected ? 'corrected' : 'wrong', feedbackPending: false, showReasons: false, showCorrections: false } : item));
      notify(corrected ? 'Correção registrada.' : 'Feedback registrado.');
    } catch (error) {
      const feedbackError = error instanceof Error ? error.message : 'Não foi possível salvar o feedback.';
      setMessages(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, feedbackPending: false, feedbackError } : item));
      notify(feedbackError);
    }
  };

  const access = async (documentId: string, mode: 'view' | 'download', page: number | null = null, title = 'Catálogo') => {
    const hasExactPage = mode === 'view' && Number.isInteger(Number(page)) && Number(page) > 0;
    const preparedWindow = hasExactPage ? window.open('', '_blank') : null;
    if (preparedWindow) preparedWindow.opener = null;

    try {
      const data = await json<{ url: string }>(await api(`/api/documents/${documentId}/access?mode=${mode}`));
      if (mode === 'view') {
        const targetUrl = pdfPageUrl(data.url, page);
        // Uma aba criada no clique é mais confiável que iframe para respeitar #page=N
        // em PDFs servidos por URL assinada. Se o navegador bloquear, mantemos o modal.
        if (hasExactPage && preparedWindow) {
          preparedWindow.location.replace(targetUrl);
          return;
        }
        setPdf({ url: data.url, page, title });
      } else {
        window.open(data.url, '_blank', 'noopener,noreferrer');
      }
    } catch {
      if (preparedWindow && !preparedWindow.closed) preparedWindow.close();
      notify('Não foi possível abrir o catálogo.');
    }
  };

  const copy = async (value: string, success = 'Código copiado.') => {
    try {
      await navigator.clipboard.writeText(value);
      notify(success);
    } catch {
      notify(value);
    }
  };

  const copySummary = (response: ChatResponse) => {
    if (!response.part) return;
    const part = response.part;
    const summary = [
      `Peça: ${part.name}`,
      `Código: ${part.partNumber}`,
      `Modelo: ${part.model}`,
      `PNC: ${part.pnc || 'não informado'}`,
      part.section ? `Seção: ${part.section}` : '',
      part.position ? `Posição: ${part.position}` : '',
      part.page ? `Página: ${part.page}` : '',
      `Catálogo: ${part.filename}`,
    ].filter(Boolean).join('\n');
    void copy(summary, 'Ficha técnica copiada.');
  };

  const saveEquipment = () => {
    if (!manufacturer.trim() && !model.trim() && !pnc.trim() && !serial.trim()) {
      notify('Preencha fabricante, modelo, PNC ou S/N.');
      return;
    }
    const item: Equipment = {
      id: createId(),
      manufacturer: manufacturer.trim(),
      model: model.trim(),
      pnc: pnc.trim(),
      serial: serial.trim(),
      label: [manufacturer.trim(), model.trim(), pnc.trim() ? `PNC ${pnc.trim()}` : '', serial.trim() ? `S/N ${serial.trim()}` : ''].filter(Boolean).join(' · '),
    };
    const next = [item, ...equipment.filter(saved => saved.label !== item.label)].slice(0, 6);
    setEquipment(next);
    save(equipmentKey, next);
    notify('Equipamento salvo.');
  };

  const removeEquipment = (equipmentId: string) => {
    const next = equipment.filter(item => item.id !== equipmentId);
    setEquipment(next);
    save(equipmentKey, next);
    notify('Equipamento removido.');
  };

  const choosePnc = (message: Message, nextPnc: string) => {
    if (!message.query) return;
    setPnc(nextPnc);
    void ask(message.query, nextPnc);
  };

  const chooseModel = (message: Message, nextModel: string) => {
    if (!message.query) return;
    const description = message.response?.interpreted?.partDescription || message.query;
    setModel(nextModel);
    void ask(`${description} do equipamento ${nextModel}`, message.pnc);
  };

  const continueWithSerial = (message: Message, nextSerial: string) => {
    if (!message.query) return;
    setSerial(nextSerial);
    void ask(`${message.query} · S/N ${nextSerial}`, message.pnc);
  };

  const chooseAmbiguousOption = (message: Message, option: FeedbackOption) => {
    const query = `${option.name} · código ${option.partNumber} · modelo ${option.model}`;
    setModel(option.model);
    if (option.pnc) setPnc(option.pnc);
    void ask(query, option.pnc || message.pnc, true, option.id);
  };

  const newConversation = () => {
    conversationVersionRef.current += 1;
    requestRef.current?.abort();
    setMessages([]);
    setQuestion('');
    window.requestAnimationFrame(() => questionRef.current?.focus());
  };

  return (
    <section>
      {notice ? <div role="status" aria-live="polite" className="fixed right-5 top-20 z-[100] rounded-xl bg-slate-900 px-4 py-2.5 text-sm text-white shadow-lg">{notice}</div> : null}

      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="cv-kicker">Assistente técnico</p>
          <h1 className="cv-page-title">Encontre o código certo com segurança</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">O assistente interpreta a solicitação, mas somente retorna códigos existentes nos catálogos técnicos da empresa.</p>
        </div>
        {messages.length ? <button type="button" onClick={newConversation} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-500 transition hover:border-blue-200 hover:text-[#1d4f91]">Nova conversa</button> : null}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_330px]">
        <div className="cv-surface overflow-hidden rounded-[24px]">
          <div className="grid gap-3 border-b border-slate-200 bg-slate-50/70 p-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="grid gap-1.5 text-[10px] font-bold uppercase tracking-[.1em] text-slate-400">Fabricante<input value={manufacturer} onChange={event => setManufacturer(event.target.value)} placeholder="Ex.: Husqvarna" className="cv-field text-sm font-normal normal-case tracking-normal" /></label>
            <label className="grid gap-1.5 text-[10px] font-bold uppercase tracking-[.1em] text-slate-400">Modelo<input value={model} onChange={event => setModel(event.target.value)} placeholder="Ex.: 143RS" className="cv-field text-sm font-normal normal-case tracking-normal" /></label>
            <label className="grid gap-1.5 text-[10px] font-bold uppercase tracking-[.1em] text-slate-400">PNC<input value={pnc} onChange={event => setPnc(event.target.value)} placeholder="Ex.: 967 33 26-01" className="cv-field text-sm font-normal normal-case tracking-normal" /></label>
            <label className="grid gap-1.5 text-[10px] font-bold uppercase tracking-[.1em] text-slate-400">S/N <span className="font-normal normal-case tracking-normal text-slate-300">opcional</span><input inputMode="numeric" autoComplete="off" value={serial} onChange={event => setSerial(event.target.value.replace(/\D/g, '').slice(0, 16))} placeholder="Ex.: 20240200001" className="cv-field text-sm font-normal normal-case tracking-normal" /></label>
            <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-4">
              <button type="button" onClick={saveEquipment} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold">☆ Salvar equipamento</button>
              {(manufacturer || model || pnc || serial) ? <button type="button" onClick={() => { setManufacturer(''); setModel(''); setPnc(''); setSerial(''); }} className="rounded-xl px-3 py-2 text-xs font-semibold text-slate-400 hover:bg-white hover:text-slate-700">Limpar equipamento</button> : null}
            </div>
          </div>

          <div className="cv-scrollbar min-h-[480px] max-h-[62vh] space-y-4 overflow-auto p-5" aria-busy={loading}>
            {!messages.length ? (
              <div className="grid h-[420px] place-items-center text-center">
                <div className="max-w-lg">
                  <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-blue-50 text-2xl text-[#1d4f91]">✦</div>
                  <h2 className="mt-4 font-semibold">O que você procura?</h2>
                  <p className="mt-1 text-sm text-slate-400">Informe uma descrição ou um código. Modelo e PNC aumentam a precisão.</p>
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    {quickPrompts.map(prompt => <button type="button" key={prompt} onClick={() => { setQuestion(prompt); questionRef.current?.focus(); }} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-[#1d4f91]">{prompt}</button>)}
                  </div>
                </div>
              </div>
            ) : null}

            {messages.map((message, index) => (
              <div key={message.id} className={message.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                <div className={`max-w-[94%] rounded-2xl px-4 py-3 text-sm ${message.role === 'user' ? 'bg-[#1d4f91] text-white' : 'bg-slate-100 text-slate-800'}`}>
                  {message.role === 'user' ? <div>{message.text}</div> : (
                    <>
                      {message.response ? <Guidance response={message.response} /> : null}
                      {!message.response?.part ? <div className={message.response ? 'mt-3 whitespace-pre-line text-sm leading-6' : 'whitespace-pre-line text-sm leading-6'}>{message.text}</div> : null}
                      {message.response ? <Interpretation response={message.response} /> : null}
                      {message.response && !message.response.part ? <ReliabilityDetails response={message.response}/> : null}
                      {message.response?.part ? (
                        <ResultCard
                          response={message.response}
                          onCopyCode={() => void copy(message.response?.part?.partNumber || '')}
                          onCopySummary={() => copySummary(message.response!)}
                          onAccess={mode => void access(message.response?.part?.documentId || '', mode, message.response?.part?.page ?? null, message.response?.part?.filename || 'Catálogo')}
                        />
                      ) : null}

                      {message.response?.pncOptions?.length ? <div className="mt-3"><div className="mb-2 text-xs font-semibold text-slate-600">Selecione o PNC da etiqueta</div><div className="flex flex-wrap gap-2">{message.response.pncOptions.map(option => <button type="button" key={option} onClick={() => choosePnc(message, option)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs">PNC {option}</button>)}</div></div> : null}
                      {message.response?.modelOptions?.length ? <div className="mt-3"><div className="mb-2 text-xs font-semibold text-slate-600">Confirmar modelo</div><div className="flex flex-wrap gap-2">{message.response.modelOptions.map(option => <button type="button" key={option} onClick={() => chooseModel(message, option)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs">{option}</button>)}</div></div> : null}
                      {message.response?.serialRequired ? <SerialFollowUp disabled={loading} onSubmit={nextSerial => continueWithSerial(message, nextSerial)} /> : null}
                      {message.response?.status === 'AMBIGUOUS' && message.response.options?.length ? <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3"><div className="text-xs font-semibold text-slate-700">Qual item da vista corresponde à peça?</div><div className="mt-2 grid gap-2">{message.response.options.map(option => <button type="button" key={option.id} onClick={() => chooseAmbiguousOption(message, option)} className="rounded-lg border border-slate-200 p-2 text-left text-xs hover:bg-slate-50"><b>{option.name}</b><span className="mt-0.5 block font-semibold text-[#1d4f91]">Código {option.partNumber}</span><span className="block text-slate-500">{option.model} · PNC {option.pnc || 'não informado'} · posição {option.position || '—'}</span>{option.section ? <span className="mt-1 block text-slate-500">Vista: {option.section}</span> : null}{option.notes ? <span className="mt-1 block font-semibold text-amber-700">Aplicação: {option.notes}</span> : null}</button>)}</div></div> : null}

                      {message.response?.part && !message.feedback ? <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-3"><span className="text-xs text-slate-500">Este resultado ajudou?</span><button type="button" disabled={message.feedbackPending} onClick={() => void positiveFeedback(index)} className="rounded-lg bg-emerald-50 px-2 py-1 text-emerald-700 disabled:opacity-50">👍 Sim</button><button type="button" disabled={message.feedbackPending} onClick={() => void startNegative(index)} className="rounded-lg bg-rose-50 px-2 py-1 text-rose-700 disabled:opacity-50">👎 Não</button>{message.feedbackPending ? <span className="text-xs text-slate-400">Salvando…</span> : null}</div> : null}
                      {message.showReasons ? <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3"><div className="text-xs font-semibold text-slate-700">Feedback negativo salvo. O que estava errado?</div><div className="mt-1 text-[11px] text-slate-400">Detalhar é opcional e ajuda o ranking das próximas buscas.</div><div className="mt-2 flex flex-wrap gap-2">{reasons.map(([reason, label]) => <button type="button" disabled={message.feedbackPending} key={reason} onClick={() => void chooseReason(index, reason)} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50">{label}</button>)}</div><button type="button" onClick={() => setMessages(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, showReasons: false } : item))} className="mt-2 text-xs font-semibold text-slate-400 underline">Concluir sem detalhar</button></div> : null}
                      {message.showCorrections ? <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3"><div className="text-xs font-semibold text-slate-700">Selecione a peça correta, se ela aparecer abaixo.</div><div className="mt-2 grid gap-2">{message.response?.feedbackOptions?.filter(option => option.id !== message.response?.part?.id).map(option => <button type="button" key={option.id} onClick={() => void negativeFeedback(index, option)} className="rounded-lg border border-slate-200 p-2 text-left text-xs"><b>{option.name}</b><span className="block font-semibold text-[#1d4f91]">{option.partNumber}</span><span className="block text-slate-500">{option.model} · PNC {option.pnc || 'não informado'} · posição {option.position || '—'}</span>{option.notes ? <span className="mt-1 block font-semibold text-amber-700">Aplicação: {option.notes}</span> : null}</button>)}</div><button type="button" onClick={() => void negativeFeedback(index)} className="mt-2 text-xs font-semibold text-slate-500 underline">Nenhuma dessas / apenas registrar o erro</button></div> : null}
                      {message.feedback && !message.showReasons && !message.showCorrections ? <div className="mt-2 text-xs text-slate-500">{message.feedback === 'correct' ? '✓ Confirmação salva e considerada no ranking' : message.feedback === 'corrected' ? '✓ Correção salva e considerada no ranking' : '✓ Feedback salvo e considerado no ranking'}</div> : null}
                      {message.feedbackError ? <div role="alert" className="mt-2 text-xs font-medium text-rose-600">{message.feedbackError}</div> : null}
                    </>
                  )}
                </div>
              </div>
            ))}

            {loading ? <div role="status" className="flex items-center gap-3 text-sm text-slate-400"><span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-[#1d4f91]" />Interpretando e cruzando com os catálogos… <button type="button" onClick={cancel} className="text-xs font-semibold text-slate-500 underline">Cancelar</button></div> : null}
            <div ref={messagesEndRef} />
          </div>

          <form onSubmit={submit} className="flex gap-3 border-t border-slate-200 p-4">
            <label htmlFor="assistant-question" className="sr-only">Digite a peça, descrição ou código</label>
            <input ref={questionRef} id="assistant-question" value={question} onChange={event => setQuestion(event.target.value)} placeholder="Digite a peça, descrição ou código…" minLength={2} required className="cv-field min-w-0 flex-1 text-sm" />
            <button type="submit" disabled={loading} className="cv-primary px-5 font-semibold disabled:opacity-50">Pesquisar</button>
          </form>
        </div>

        <aside className="space-y-4">
          <div className="cv-surface rounded-[22px] p-5">
            <div className="text-sm font-semibold">Equipamentos salvos</div>
            <p className="mt-1 text-xs text-slate-400">Reaplique modelo, PNC e S/N usados com frequência nesta estação.</p>
            <div className="mt-4 grid gap-2">
              {!equipment.length ? <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-400">Nenhum equipamento salvo.</div> : null}
              {equipment.map(item => <div key={item.id} className="flex items-center gap-2 rounded-xl border border-slate-200 p-2"><button type="button" onClick={() => { setManufacturer(item.manufacturer); setModel(item.model); setPnc(item.pnc); setSerial(item.serial || ''); notify('Equipamento aplicado.'); }} className="min-w-0 flex-1 rounded-lg p-1 text-left text-xs hover:bg-slate-50"><b className="block truncate text-slate-700">{item.label}</b><span className="mt-1 block text-slate-400">Usar nesta busca</span></button><button type="button" onClick={() => removeEquipment(item.id)} aria-label={`Remover ${item.label}`} title="Remover equipamento" className="rounded-lg px-2 py-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600">×</button></div>)}
            </div>
          </div>

          <div className="cv-surface rounded-[22px] p-5">
            <div className="text-sm font-semibold">Buscas rápidas</div>
            <p className="mt-1 text-xs text-slate-400">Atalhos locais desta estação; o histórico completo fica salvo no sistema.</p>
            <div className="mt-4 grid gap-2">
              {!recent.length ? <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-400">As novas buscas aparecerão aqui.</div> : null}
              {recent.map(item => <button type="button" key={item.id} onClick={() => void ask(item.query, item.pnc, false)} className="rounded-xl border border-slate-200 p-3 text-left text-xs hover:bg-slate-50"><b className="block text-slate-700">{item.query}</b><span className="mt-1 block text-slate-400">{item.pnc ? `PNC ${item.pnc}` : 'Sem PNC informado'}</span></button>)}
            </div>
          </div>

          <div className="rounded-[22px] bg-[#0d2348] p-5 text-white">
            <div className="text-xs font-bold text-amber-200">REGRA DE SEGURANÇA</div>
            <p className="mt-2 text-sm leading-6 text-slate-300">O assistente nunca cria códigos. Quando a IA externa estiver indisponível, o CogniVault tenta uma busca textual segura e avisa que o resultado exige conferência.</p>
          </div>
        </aside>
      </div>

      {pdf ? <div className="fixed inset-0 z-[90] bg-slate-950/90 p-3 md:p-6"><div role="dialog" aria-modal="true" aria-labelledby="assistant-pdf-title" className="mx-auto flex h-full max-w-[1500px] flex-col overflow-hidden rounded-[22px] bg-white"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3"><div><div id="assistant-pdf-title" className="text-sm font-semibold">{pdf.title}</div><div className="text-xs text-slate-400">{pdf.page ? `Página ${pdf.page}` : 'Visualização do catálogo'}</div></div><div className="flex gap-2"><a href={pdfPageUrl(pdf.url, pdf.page)} target="_blank" rel="noreferrer" className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-[#1d4f91]">Nova aba</a><button type="button" autoFocus onClick={() => setPdf(null)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">Fechar <span className="ml-1 text-[10px] text-slate-400">Esc</span></button></div></div><iframe title={pdf.title} src={pdfPageUrl(pdf.url, pdf.page)} className="h-full w-full border-0" /></div></div> : null}
    </section>
  );
}
