// Ajudantes dos mockups (dados de EXEMPLO; nada real). Cada página monta o que precisa a partir disto.
const THEME = new URLSearchParams(location.search).get('tema');
if (THEME === 'dark') document.documentElement.dataset.theme = 'dark';

function topBar(active = 'Administração') {
  const items = ['Atendimento', 'Catálogos', 'Orçamentos', 'Conserto', 'Tabela de preços', 'Administração'];
  return `<header class="top"><div class="logo"><i></i>CogniVault</div><nav>${items.map(name => `<a class="${name === active ? 'on' : ''}">${name}</a>`).join('')}</nav><div class="grow"></div><div class="search">Buscar peça ou código</div><div class="avatar">AD</div></header>`;
}

// 30 dias de orçamentos (exemplo): quantidade e valor
const DAYS = Array.from({ length: 30 }, (_, i) => {
  const wave = Math.sin(i / 2.3) * 2.2 + Math.cos(i / 5.1) * 1.8;
  const weekend = [5, 6].includes((i + 3) % 7) ? -2.2 : 0;
  const count = Math.max(1, Math.round(6 + wave + weekend + (i * 7 % 5) * 0.5));
  return { count, value: Math.round(count * (235 + ((i * 37) % 90))) };
});

/** Linha + barras dos 30 dias. */
function chart({ w = 860, h = 230, bars = true, color = 'var(--chart)', soft = 'var(--chart-2)', highlight = null } = {}) {
  const pad = { l: 44, r: 12, t: 12, b: 28 };
  const max = Math.max(...DAYS.map(d => d.value)) * 1.1;
  const step = (w - pad.l - pad.r) / DAYS.length;
  const y = v => pad.t + (h - pad.t - pad.b) * (1 - v / max);
  const grid = [0, .25, .5, .75, 1].map(f => { const v = max * f; return `<line x1="${pad.l}" x2="${w - pad.r}" y1="${y(v)}" y2="${y(v)}" stroke="var(--grid)"/><text x="${pad.l - 8}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="var(--faint)">${v >= 1000 ? Math.round(v / 1000) + ' mil' : Math.round(v)}</text>`; }).join('');
  const rects = bars ? DAYS.map((d, i) => `<rect x="${pad.l + i * step + 3}" y="${y(d.value)}" width="${step - 6}" height="${h - pad.b - y(d.value)}" rx="3" fill="${i === highlight ? 'var(--chart)' : soft}" opacity="${i === highlight ? 1 : .9}"/>`).join('') : '';
  const pts = DAYS.map((d, i) => `${pad.l + i * step + step / 2},${y(d.value)}`);
  const line = `<polyline points="${pts.join(' ')}" fill="none" stroke="${color}" stroke-width="2.4" stroke-linejoin="round"/>`;
  const labels = [0, 7, 14, 21, 29].map(i => `<text x="${pad.l + i * step + step / 2}" y="${h - 8}" text-anchor="middle" font-size="11" fill="var(--faint)">${String(9 + i > 30 ? 9 + i - 30 : 9 + i).padStart(2, '0')}/${9 + i > 30 ? '10' : '09'}</text>`).join('');
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="Orçamentos nos últimos 30 dias">${grid}${rects}${line}${labels}</svg>`;
}

function spark(values, { w = 120, h = 34, color = 'var(--chart)' } = {}) {
  const max = Math.max(...values), min = Math.min(...values);
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - 3 - ((v - min) / (max - min || 1)) * (h - 8)}`).join(' ');
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/></svg>`;
}
const SERIES = {
  quotes: DAYS.map(d => d.count),
  value: DAYS.map(d => d.value),
  ticket: DAYS.map(d => Math.round(d.value / d.count)),
};
const brl = n => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const ICON = {
  doc: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2h9l5 5v15H6z"/><path d="M14 2v6h6"/><path d="M9 13h6M9 17h6"/></svg>',
  money: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/></svg>',
  tag: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12V3h9l9 9-9 9z"/><circle cx="7.5" cy="7.5" r="1.5"/></svg>',
  alert: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 2 21h20z"/><path d="M12 10v5M12 18h.01"/></svg>',
  list: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>',
  up: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',
  dl: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M6 11l6 6 6-6M4 21h16"/></svg>',
  chevron: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>',
};
