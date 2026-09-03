import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { motion } from 'framer-motion';
import { api, json } from '../lib';
import { pdfPageUrl } from '../pdf';
import type { ChatResponse, FavoriteItem, FeedbackOption } from '../types';

import Guidance from './chat/Guidance';
import SerialFollowUp from './chat/SerialFollowUp';
import Interpretation from './chat/Interpretation';
import ReliabilityDetails from './chat/ReliabilityDetails';
import ResultCard from './chat/ResultCard';

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
type Recent = { id: string; query: string; pnc: string; serial?: string };

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
const extractSerialFromQuery = (value: string) => value.match(/\bS\s*\/\s*N\s*[:#.-]?\s*(\d{6,16})\b/i)?.[1] || '';


export default function ChatPanel({
  storageScope,
  initialPrompt,
  onClose,
  isDrawer,
}: {
  storageScope: string;
  initialPrompt?: string;
  onClose?: () => void;
  isDrawer?: boolean;
}) {
  const equipmentKey = `${EQUIPMENT_KEY}:${storageScope}`;
  const recentKey = `${RECENT_KEY}:${storageScope}`;
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState(initialPrompt || '');
  const [manufacturer, setManufacturer] = useState('');
  const [model, setModel] = useState('');
  const [pnc, setPnc] = useState('');
  const [serial, setSerial] = useState('');
  const [loading, setLoading] = useState(false);
  const [equipment, setEquipment] = useState<Equipment[]>(() => read<Equipment[]>(equipmentKey, []));
  const [recent, setRecent] = useState<Recent[]>(() => read<Recent[]>(recentKey, []));
  const [favoriteByPartId, setFavoriteByPartId] = useState<Record<string,string>>({});
  const [favoritePendingId, setFavoritePendingId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [pdf, setPdf] = useState<{ url: string; page: number | null; title: string } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const questionRef = useRef<HTMLInputElement | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const noticeTimerRef = useRef<number | null>(null);
  const conversationVersionRef = useRef(0);

  const askedPromptRef = useRef<string | null>(null);
  const askRef = useRef<((query: string, forcedPnc?: string, store?: boolean, selectedPartId?: string) => Promise<void>) | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, loading]);

  useEffect(() => {
    if (initialPrompt && initialPrompt.trim() && askedPromptRef.current !== initialPrompt.trim()) {
      askedPromptRef.current = initialPrompt.trim();
      void askRef.current?.(initialPrompt.trim());
    }
  }, [initialPrompt]);

  useEffect(() => {
    if (!pdf) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPdf(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pdf]);

  useEffect(() => {
    let active = true;
    void api('/api/favorites')
      .then(response => json<{ favorites: FavoriteItem[] }>(response))
      .then(data => {
        if (!active) return;
        const next: Record<string,string> = {};
        for (const item of data.favorites) if (item.partId) next[item.partId] = item.id;
        setFavoriteByPartId(next);
      })
      .catch(() => { /* Favoritos indisponíveis não devem bloquear uma consulta. */ });
    return () => { active = false; };
  }, []);

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
    const usedSerial = extractSerialFromQuery(query);
    const nextItem: Recent = { id: createId(), query, pnc: usedPnc, serial: usedSerial || undefined };
    const next = [nextItem, ...recent.filter(item => item.query !== query || item.pnc !== usedPnc || (item.serial || '') !== usedSerial)].slice(0, 6);
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
      
      // The backend now provides data.b2bPortal directly via HusqvarnaPortalService
      // No need to query localhost:3000 companion app anymore.

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
  askRef.current = ask;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!composed) return;
    const query = composed;
    setQuestion('');
    void ask(query);
  };

  const cancel = () => requestRef.current?.abort();

  const toggleFavorite = async (partId: string) => {
    if (!partId || favoritePendingId) return;
    setFavoritePendingId(partId);
    const currentFavoriteId = favoriteByPartId[partId];
    try {
      if (currentFavoriteId) {
        await json(await api(`/api/favorites/${currentFavoriteId}`, { method: 'DELETE' }));
        setFavoriteByPartId(current => {
          const next = { ...current };
          delete next[partId];
          return next;
        });
        notify('Peça removida dos favoritos.');
      } else {
        const result = await json<{ favorite: { id: string } }>(await api('/api/favorites', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ partId }),
        }));
        setFavoriteByPartId(current => ({ ...current, [partId]: result.favorite.id }));
        notify('Peça adicionada aos favoritos.');
      }
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Não foi possível atualizar o favorito.');
    } finally {
      setFavoritePendingId(null);
    }
  };

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

  const messagesContent = (
    <>
      {!messages.length ? (
        <div className="grid h-[320px] place-items-center text-center">
          <div className="max-w-md">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-blue-50 dark:bg-blue-900/20 text-xl text-[#1d4f91] dark:text-blue-400">✦</div>
            <h2 className="mt-3 font-semibold text-slate-900 dark:text-white">Dúvida sobre uma peça?</h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Informe uma descrição ou código para tirar dúvidas técnicas sobre compatibilidade e aplicação.</p>
            <div className="mt-3 flex flex-wrap justify-center gap-1.5">
              {quickPrompts.map(prompt => <button type="button" key={prompt} onClick={() => { setQuestion(prompt); questionRef.current?.focus(); }} className="rounded-full border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-800/60 px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 transition hover:border-blue-200 dark:hover:border-blue-500/50 hover:bg-blue-50 dark:hover:bg-blue-500/10 hover:text-[#1d4f91] dark:hover:text-blue-300">{prompt}</button>)}
            </div>
          </div>
        </div>
      ) : null}

      {messages.map((message, index) => (
        <motion.div 
          key={message.id} 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className={message.role === 'user' ? 'flex justify-end' : 'flex justify-start'}
        >
          <div className={`max-w-[94%] rounded-2xl px-4 py-3 text-sm shadow-sm ${message.role === 'user' ? 'bg-[#1d4f91] text-white rounded-br-sm' : 'bg-white dark:bg-slate-800/80 text-slate-800 dark:text-slate-200 rounded-bl-sm border border-slate-200/60 dark:border-slate-700/50'}`}>
            {message.role === 'user' ? <div>{message.text}</div> : (
              <>
                {message.response ? <Guidance response={message.response} /> : null}
                {!message.response?.part ? <div className={message.response ? 'mt-3 whitespace-pre-line text-sm leading-6' : 'whitespace-pre-line text-sm leading-6'}>{message.text}</div> : null}
                {message.response ? <Interpretation response={message.response} /> : null}
                {message.response && !message.response.part ? <ReliabilityDetails response={message.response}/> : null}
                {message.response?.part ? (
                  <ResultCard
                    response={message.response}
                    favorite={Boolean(favoriteByPartId[message.response.part.id])}
                    favoritePending={favoritePendingId===message.response.part.id}
                    onToggleFavorite={() => void toggleFavorite(message.response!.part!.id)}
                    onCopyCode={() => void copy(message.response?.part?.partNumber || '')}
                    onCopySummary={() => copySummary(message.response!)}
                    onAccess={mode => void access(message.response?.part?.documentId || '', mode, message.response?.part?.page ?? null, message.response?.part?.filename || 'Catálogo')}
                  />
                ) : null}

                {message.response?.pncOptions?.length ? <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-3"><div className="mb-2 text-xs font-semibold text-slate-600 dark:text-slate-400">Selecione o PNC da etiqueta</div><div className="flex flex-wrap gap-2">{message.response.pncOptions.map(option => <button type="button" key={option} onClick={() => choosePnc(message, option)} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs hover:border-[#1d4f91] hover:text-[#1d4f91] dark:text-blue-300 transition">PNC {option}</button>)}</div></motion.div> : null}
                {message.response?.modelOptions?.length ? <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-3"><div className="mb-2 text-xs font-semibold text-slate-600 dark:text-slate-400">Confirmar modelo</div><div className="flex flex-wrap gap-2">{message.response.modelOptions.map(option => <button type="button" key={option} onClick={() => chooseModel(message, option)} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs hover:border-[#1d4f91] hover:text-[#1d4f91] dark:text-blue-300 transition">{option}</button>)}</div></motion.div> : null}
                {message.response?.serialRequired ? <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}><SerialFollowUp disabled={loading} onSubmit={nextSerial => continueWithSerial(message, nextSerial)} /></motion.div> : null}
                {message.response?.status === 'AMBIGUOUS' && message.response.options?.length ? <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3"><div className="text-xs font-semibold text-slate-700 dark:text-slate-300">Qual item da vista corresponde à peça?</div><div className="mt-2 grid gap-2">{message.response.options.map(option => <button type="button" key={option.id} onClick={() => chooseAmbiguousOption(message, option)} className="rounded-lg border border-slate-200 dark:border-slate-700 p-2 text-left text-xs hover:bg-slate-50 dark:bg-slate-800/50 transition"><b>{option.name}</b><span className="mt-0.5 block font-semibold text-[#1d4f91] dark:text-blue-300">Código {option.partNumber}</span><span className="block text-slate-500 dark:text-slate-400">{option.model} · PNC {option.pnc || 'não informado'} · posição {option.position || '—'}</span>{option.section ? <span className="mt-1 block text-slate-500 dark:text-slate-400">Vista: {option.section}</span> : null}{option.notes ? <span className="mt-1 block font-semibold text-amber-700 dark:text-amber-300">Aplicação: {option.notes}</span> : null}</button>)}</div></motion.div> : null}

                {message.response?.part && !message.feedback ? <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-200 dark:border-slate-700 pt-3"><span className="text-xs text-slate-500 dark:text-slate-400">Este resultado ajudou?</span><button type="button" disabled={message.feedbackPending} onClick={() => void positiveFeedback(index)} className="rounded-lg bg-emerald-50 dark:bg-emerald-900/30 px-2 py-1 text-emerald-700 dark:text-emerald-300 transition hover:bg-emerald-100 disabled:opacity-50">👍 Sim</button><button type="button" disabled={message.feedbackPending} onClick={() => void startNegative(index)} className="rounded-lg bg-rose-50 dark:bg-rose-900/30 px-2 py-1 text-rose-700 dark:text-rose-300 transition hover:bg-rose-100 disabled:opacity-50">👎 Não</button>{message.feedbackPending ? <span className="text-xs text-slate-400">Salvando…</span> : null}</div> : null}
                {message.showReasons ? <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3"><div className="text-xs font-semibold text-slate-700 dark:text-slate-300">Feedback negativo salvo. O que estava errado?</div><div className="mt-1 text-[11px] text-slate-400">Detalhar é opcional e ajuda o ranking das próximas buscas.</div><div className="mt-2 flex flex-wrap gap-2">{reasons.map(([reason, label]) => <button type="button" disabled={message.feedbackPending} key={reason} onClick={() => void chooseReason(index, reason)} className="rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:bg-slate-800/50 disabled:opacity-50 transition">{label}</button>)}</div><button type="button" onClick={() => setMessages(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, showReasons: false } : item))} className="mt-2 text-xs font-semibold text-slate-400 underline">Concluir sem detalhar</button></motion.div> : null}
                {message.showCorrections ? <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3"><div className="text-xs font-semibold text-slate-700 dark:text-slate-300">Selecione a peça correta, se ela aparecer abaixo.</div><div className="mt-2 grid gap-2">{message.response?.feedbackOptions?.filter(option => option.id !== message.response?.part?.id).map(option => <button type="button" key={option.id} onClick={() => void negativeFeedback(index, option)} className="rounded-lg border border-slate-200 dark:border-slate-700 p-2 text-left text-xs transition hover:bg-slate-50 dark:bg-slate-800/50"><b>{option.name}</b><span className="block font-semibold text-[#1d4f91] dark:text-blue-300">{option.partNumber}</span><span className="block text-slate-500 dark:text-slate-400">{option.model} · PNC {option.pnc || 'não informado'} · posição {option.position || '—'}</span>{option.notes ? <span className="mt-1 block font-semibold text-amber-700 dark:text-amber-300">Aplicação: {option.notes}</span> : null}</button>)}</div><button type="button" onClick={() => void negativeFeedback(index)} className="mt-2 text-xs font-semibold text-slate-500 dark:text-slate-400 underline">Nenhuma dessas / apenas registrar o erro</button></motion.div> : null}
                {message.feedback && !message.showReasons && !message.showCorrections ? <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-2 text-xs text-slate-500 dark:text-slate-400">{message.feedback === 'correct' ? '✓ Confirmação salva e considerada no ranking' : message.feedback === 'corrected' ? '✓ Correção salva e considerada no ranking' : '✓ Feedback salvo e considerado no ranking'}</motion.div> : null}
                {message.feedbackError ? <div role="alert" className="mt-2 text-xs font-medium text-rose-600">{message.feedbackError}</div> : null}
              </>
            )}
          </div>
        </motion.div>
      ))}

      {loading ? (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          role="status"
          className="flex items-center gap-3 rounded-xl border border-blue-100 dark:border-blue-900/50 bg-blue-50/70 dark:bg-blue-950/30 px-4 py-3 text-sm text-blue-900 dark:text-blue-200"
        >
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-blue-200 dark:border-blue-700 border-t-[#1d4f91] dark:border-t-blue-400" />
          <span className="font-medium text-xs sm:text-sm">Consultando catálogo e portal Husqvarna…</span>
          <button type="button" onClick={cancel} className="ml-auto text-xs font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 underline">
            Cancelar
          </button>
        </motion.div>
      ) : null}
      <div ref={messagesEndRef} />
    </>
  );

  const formContent = (
    <form onSubmit={submit} className="flex gap-2 sm:gap-3 border-t border-slate-200 dark:border-slate-800/60 p-3 sm:p-4">
      <label htmlFor="assistant-question" className="sr-only">Digite a peça, descrição ou código</label>
      <input
        ref={questionRef}
        id="assistant-question"
        value={question}
        onChange={event => setQuestion(event.target.value)}
        placeholder="Digite a dúvida sobre a peça…"
        minLength={2}
        required
        className="rounded-xl border-none bg-slate-100/50 dark:bg-slate-800/40 px-3.5 py-2.5 sm:px-4 sm:py-3 text-sm outline-none transition-all focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-[#1d4f91]/20 dark:focus:ring-blue-500/30 min-w-0 flex-1"
      />
      {question ? (
        <button
          type="button"
          onClick={() => { setQuestion(''); questionRef.current?.focus(); }}
          className="flex items-center rounded-xl px-2 text-xs font-semibold text-slate-400 transition hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-700 dark:text-slate-300"
        >
          Limpar
        </button>
      ) : null}
      <button type="submit" disabled={loading} className="cv-primary px-4 sm:px-5 text-xs sm:text-sm font-semibold disabled:opacity-50">
        Enviar
      </button>
    </form>
  );

  const pdfModal = pdf ? (
    <div onMouseDown={e => { if (e.target === e.currentTarget) setPdf(null); }} className="fixed inset-0 z-[90] bg-slate-950/90 p-3 md:p-6">
      <div role="dialog" aria-modal="true" aria-labelledby="assistant-pdf-title" className="mx-auto flex h-full max-w-[1500px] flex-col overflow-hidden rounded-[22px] bg-white dark:bg-slate-800">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-700 px-4 py-3">
          <div>
            <div id="assistant-pdf-title" className="text-sm font-semibold">{pdf.title}</div>
            <div className="text-xs text-slate-400">{pdf.page ? `Página ${pdf.page}` : 'Visualização do catálogo'}</div>
          </div>
          <div className="flex gap-2">
            <a href={pdfPageUrl(pdf.url, pdf.page)} target="_blank" rel="noreferrer" className="rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs font-semibold text-[#1d4f91] dark:text-blue-300">Nova aba</a>
            <button type="button" autoFocus onClick={() => setPdf(null)} className="rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm">Fechar <span className="ml-1 text-[10px] text-slate-400">Esc</span></button>
          </div>
        </div>
        <iframe title={pdf.title} src={pdfPageUrl(pdf.url, pdf.page)} className="h-full w-full border-0" />
      </div>
    </div>
  ) : null;

  if (isDrawer) {
    return (
      <section className="flex h-full flex-col overflow-hidden bg-white dark:bg-slate-900">
        {notice ? <div role="status" aria-live="polite" className="fixed right-5 top-20 z-[100] rounded-xl bg-slate-900 px-4 py-2.5 text-sm text-white shadow-lg">{notice}</div> : null}

        {/* Drawer Header */}
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-800/90 px-4 py-3 backdrop-blur">
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-blue-100 dark:bg-blue-900/60 text-[#1d4f91] dark:text-blue-300 font-bold text-sm">✦</span>
            <div>
              <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">Assistente IA de Peças</div>
              <div className="text-[10px] text-slate-400">Dúvidas técnicas e compatibilidade</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {messages.length ? (
              <button
                type="button"
                onClick={newConversation}
                title="Limpar conversa"
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1 text-xs font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
              >
                Limpar
              </button>
            ) : null}
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Fechar assistente"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-700 dark:hover:text-slate-200 transition"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Drawer Messages list */}
        <div className="cv-scrollbar flex-1 space-y-4 overflow-y-auto p-4" aria-busy={loading}>
          {messagesContent}
        </div>

        {/* Drawer Form */}
        <div className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          {formContent}
        </div>

        {pdfModal}
      </section>
    );
  }

  return (
    <section>
      {notice ? <div role="status" aria-live="polite" className="fixed right-5 top-20 z-[100] rounded-xl bg-slate-900 px-4 py-2.5 text-sm text-white shadow-lg">{notice}</div> : null}

      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="cv-kicker">Assistente técnico</p>
          <h1 className="cv-page-title">Encontre o código certo com segurança</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500 dark:text-slate-400">O assistente interpreta a solicitação, mas somente retorna códigos existentes nos catálogos técnicos da empresa.</p>
        </div>
        {messages.length ? <button type="button" onClick={newConversation} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 transition hover:border-blue-200 dark:border-blue-600 hover:text-[#1d4f91] dark:text-blue-300">Nova conversa</button> : null}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_330px]">
        <div className="cv-surface overflow-hidden rounded-[24px]">
          <div className="grid gap-4 border-b border-slate-200 dark:border-slate-800/60 bg-transparent p-5 sm:grid-cols-2 lg:grid-cols-4">
            <label className="group flex flex-col gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 transition-colors group-focus-within:text-[#1d4f91] dark:group-focus-within:text-blue-400">Fabricante</span>
              <input value={manufacturer} onChange={event => setManufacturer(event.target.value)} placeholder="Ex.: Husqvarna" className="rounded-xl border-none bg-slate-100/50 dark:bg-slate-800/40 px-3 py-2.5 text-sm outline-none transition-all focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-[#1d4f91]/20 dark:focus:ring-blue-500/30" />
            </label>
            <label className="group flex flex-col gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 transition-colors group-focus-within:text-[#1d4f91] dark:group-focus-within:text-blue-400">Modelo</span>
              <input value={model} onChange={event => setModel(event.target.value)} placeholder="Ex.: 143RS" className="rounded-xl border-none bg-slate-100/50 dark:bg-slate-800/40 px-3 py-2.5 text-sm outline-none transition-all focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-[#1d4f91]/20 dark:focus:ring-blue-500/30" />
            </label>
            <label className="group flex flex-col gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 transition-colors group-focus-within:text-[#1d4f91] dark:group-focus-within:text-blue-400">PNC</span>
              <input value={pnc} onChange={event => setPnc(event.target.value)} placeholder="Ex.: 967 33 26-01" className="rounded-xl border-none bg-slate-100/50 dark:bg-slate-800/40 px-3 py-2.5 text-sm outline-none transition-all focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-[#1d4f91]/20 dark:focus:ring-blue-500/30" />
            </label>
            <label className="group flex flex-col gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 transition-colors group-focus-within:text-[#1d4f91] dark:group-focus-within:text-blue-400 flex justify-between">S/N <span className="normal-case tracking-normal opacity-60">opcional</span></span>
              <input inputMode="numeric" autoComplete="off" value={serial} onChange={event => setSerial(event.target.value.replace(/\D/g, '').slice(0, 16))} placeholder="Ex.: 20240200001" className="rounded-xl border-none bg-slate-100/50 dark:bg-slate-800/40 px-3 py-2.5 text-sm outline-none transition-all focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-[#1d4f91]/20 dark:focus:ring-blue-500/30" />
            </label>
            <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-4 mt-1">
              <button type="button" onClick={saveEquipment} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-slate-800/50 px-3 py-1.5 text-[11px] font-semibold transition-colors hover:bg-white dark:hover:bg-slate-700">☆ Salvar para próximas buscas</button>
              {(manufacturer || model || pnc || serial) ? <button type="button" onClick={() => { setManufacturer(''); setModel(''); setPnc(''); setSerial(''); }} className="rounded-xl px-3 py-1.5 text-[11px] font-medium text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">Limpar campos</button> : null}
            </div>
          </div>

          <div className="cv-scrollbar min-h-[480px] max-h-[62vh] space-y-4 overflow-auto p-5" aria-busy={loading}>
            {messagesContent}
          </div>

          {formContent}
        </div>

        <aside className="space-y-4">
          <div className="cv-surface rounded-[22px] p-5">
            <div className="text-sm font-semibold">Equipamentos salvos</div>
            <p className="mt-1 text-xs text-slate-400">Reaplique modelo, PNC e S/N usados com frequência nesta estação.</p>
            <div className="mt-4 grid gap-2">
              {!equipment.length ? <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 p-3 text-xs text-slate-400">Nenhum equipamento salvo.</div> : null}
              {equipment.map(item => <div key={item.id} className="flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 p-2"><button type="button" onClick={() => { setManufacturer(item.manufacturer); setModel(item.model); setPnc(item.pnc); setSerial(item.serial || ''); notify('Equipamento aplicado.'); }} className="min-w-0 flex-1 rounded-lg p-1 text-left text-xs hover:bg-slate-50 dark:bg-slate-800/50"><b className="block truncate text-slate-700 dark:text-slate-300">{item.label}</b><span className="mt-1 block text-slate-400">Usar nesta busca</span></button><button type="button" onClick={() => removeEquipment(item.id)} aria-label={`Remover ${item.label}`} title="Remover equipamento" className="rounded-lg px-2 py-1 text-slate-400 hover:bg-rose-50 dark:bg-rose-900/30 hover:text-rose-600">×</button></div>)}
            </div>
          </div>

          <div className="cv-surface rounded-[22px] p-5">
            <div className="text-sm font-semibold">Buscas rápidas</div>
            <p className="mt-1 text-xs text-slate-400">Atalhos locais desta estação; o histórico completo fica salvo no sistema.</p>
            <div className="mt-4 grid gap-2">
              {!recent.length ? <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 p-3 text-xs text-slate-400">As novas buscas aparecerão aqui.</div> : null}
              {recent.map(item => {
                const itemSerial = item.serial || extractSerialFromQuery(item.query);
                const context = [item.pnc ? `PNC ${item.pnc}` : '', itemSerial ? `S/N ${itemSerial}` : ''].filter(Boolean).join(' · ') || 'Sem PNC/S/N informado';
                return <button type="button" key={item.id} onClick={() => { setPnc(item.pnc); setSerial(itemSerial); void ask(item.query, item.pnc, false); }} className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 text-left text-xs hover:bg-slate-50 dark:bg-slate-800/50"><b className="block text-slate-700 dark:text-slate-300">{item.query}</b><span className="mt-1 block text-slate-400">{context}</span></button>;
              })}
            </div>
          </div>

          <div className="rounded-[22px] bg-[#0d2348] p-5 text-white">
            <div className="text-xs font-bold text-amber-200">REGRA DE SEGURANÇA</div>
            <p className="mt-2 text-sm leading-6 text-slate-300">O assistente nunca cria códigos. Quando a IA externa estiver indisponível, o CogniVault tenta uma busca textual segura e avisa que o resultado exige conferência.</p>
          </div>
        </aside>
      </div>

      {pdfModal}
    </section>
  );
}
