export type IconName =
  | 'search' | 'machine' | 'catalog' | 'quote' | 'history' | 'favorite'
  | 'dashboard' | 'users' | 'feedback' | 'quality' | 'audit' | 'bell'
  | 'sun' | 'moon' | 'sound' | 'mute' | 'logout' | 'menu' | 'close' | 'chevron'
  | 'cart' | 'trash' | 'plus' | 'minus' | 'whatsapp' | 'printer' | 'save'
  | 'pdf' | 'wrench' | 'clipboard' | 'warning' | 'phone'
  | 'cloud' | 'cloudOff' | 'check' | 'download' | 'trendUp' | 'trendDown'
  | 'money' | 'calendar' | 'tag' | 'spark' | 'refresh' | 'edit';

export function Icon({ name, className = 'h-5 w-5' }: { name: IconName; className?: string }) {
  const common = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, className, 'aria-hidden': true };
  switch (name) {
    case 'search': return <svg {...common}><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>;
    case 'machine': return <svg {...common}><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M16.9 16.9l2.2 2.2M19.1 4.9 17 7M7 17l-2.1 2.1"/></svg>;
    case 'catalog': return <svg {...common}><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v16H6.5A2.5 2.5 0 0 0 4 21.5z"/><path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H13v16h4.5a2.5 2.5 0 0 1 2.5 2.5z"/></svg>;
    case 'quote': return <svg {...common}><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6M9 16h3"/></svg>;
    case 'history': return <svg {...common}><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/></svg>;
    case 'favorite': return <svg {...common}><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9z"/></svg>;
    case 'dashboard': return <svg {...common}><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>;
    case 'users': return <svg {...common}><circle cx="9" cy="8" r="3"/><path d="M3 20c.5-4 2.5-6 6-6s5.5 2 6 6"/><path d="M16 5.5a3 3 0 0 1 0 5.5M17 14c2.3.6 3.7 2.6 4 6"/></svg>;
    case 'feedback': return <svg {...common}><path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5"/></svg>;
    case 'quality': return <svg {...common}><path d="m12 3 2.3 4.7 5.2.8-3.8 3.7.9 5.2-4.6-2.5-4.6 2.5.9-5.2-3.8-3.7 5.2-.8z"/></svg>;
    case 'audit': return <svg {...common}><path d="M6 3h12v18H6z"/><path d="M9 8h6M9 12h6M9 16h4"/></svg>;
    case 'bell': return <svg {...common}><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg>;
    case 'sun': return <svg {...common}><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2"/></svg>;
    case 'moon': return <svg {...common}><path d="M20 15.5A8.5 8.5 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z"/></svg>;
    case 'sound': return <svg {...common}><path d="M5 9v6h4l5 4V5L9 9z"/><path d="M17 9.5a4 4 0 0 1 0 5"/></svg>;
    case 'mute': return <svg {...common}><path d="M5 9v6h4l5 4V5L9 9z"/><path d="m17 9 4 4M21 9l-4 4"/></svg>;
    case 'logout': return <svg {...common}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/></svg>;
    case 'menu': return <svg {...common}><path d="M4 6h16M4 12h16M4 18h16"/></svg>;
    case 'close': return <svg {...common}><path d="m6 6 12 12M18 6 6 18"/></svg>;
    case 'chevron': return <svg {...common}><path d="m9 18 6-6-6-6"/></svg>;
    case 'cart': return <svg {...common}><circle cx="9" cy="20" r="1.4" fill="currentColor" stroke="none"/><circle cx="18" cy="20" r="1.4" fill="currentColor" stroke="none"/><path d="M2.5 3h2.3l2.1 11.4a2 2 0 0 0 2 1.6h8.4a2 2 0 0 0 2-1.6L21 7H6"/></svg>;
    case 'trash': return <svg {...common}><path d="M4 7h16M9 7V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V7M6 7l1 13a2 2 0 0 0 2 1.9h6a2 2 0 0 0 2-1.9l1-13"/></svg>;
    case 'plus': return <svg {...common}><path d="M12 5v14M5 12h14"/></svg>;
    case 'minus': return <svg {...common}><path d="M5 12h14"/></svg>;
    case 'whatsapp': return <svg {...common}><path d="M4 20l1.4-4.2A8 8 0 1 1 8.7 19z"/><path d="M9 10c0 3 2 5 5 5"/></svg>;
    case 'phone': return <svg {...common}><path d="M6 3h3l2 5-2 1.5a11 11 0 0 0 5.5 5.5L16 13l5 2v3a2 2 0 0 1-2 2C11 20 4 13 4 5a2 2 0 0 1 2-2z"/></svg>;
    case 'printer': return <svg {...common}><path d="M6 8V4h12v4"/><rect x="4" y="8" width="16" height="8" rx="1.5"/><path d="M6 16h12v5H6z"/></svg>;
    case 'save': return <svg {...common}><path d="M5 3h11l3 3v15H5z"/><path d="M8 3v6h8V3M8 21v-7h8v7"/></svg>;
    case 'pdf': return <svg {...common}><path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4"/><path d="M9.5 13.5h1.2c.7 0 1.2.5 1.2 1.2s-.5 1.2-1.2 1.2H9.5zM9.5 13.5V17M13.5 17v-3.5h1.6M13.5 15h1.3M17 13.5V17M17 13.5h1.3"/></svg>;
    case 'wrench': return <svg {...common}><path d="M14.7 6.3a4 4 0 0 0-5.4 5l-6 6 2.4 2.4 6-6a4 4 0 0 0 5-5.4l-2.6 2.6-2-2z"/></svg>;
    case 'clipboard': return <svg {...common}><rect x="6" y="4" width="12" height="17" rx="1.5"/><path d="M9 4V3h6v1"/><path d="M9 11h6M9 15h4"/></svg>;
    case 'warning': return <svg {...common}><path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17h.01"/></svg>;
    case 'cloud': return <svg {...common}><path d="M7 18a4 4 0 0 1-.4-8A5.5 5.5 0 0 1 17 9.5a3.5 3.5 0 0 1 .5 7z"/><path d="m9.5 14.5 2 2 3.5-3.5"/></svg>;
    case 'cloudOff': return <svg {...common}><path d="M7 18a4 4 0 0 1-.4-8A5.5 5.5 0 0 1 14 7.3"/><path d="M17 10a3.5 3.5 0 0 1 .5 7H12"/><path d="m3 3 18 18"/></svg>;
    case 'check': return <svg {...common}><path d="m4 12.5 5 5L20 6.5"/></svg>;
    case 'download': return <svg {...common}><path d="M12 3v12"/><path d="m7 11 5 5 5-5"/><path d="M4 20h16"/></svg>;
    case 'trendUp': return <svg {...common}><path d="m3 17 6-6 4 4 8-8"/><path d="M15 7h6v6"/></svg>;
    case 'trendDown': return <svg {...common}><path d="m3 7 6 6 4-4 8 8"/><path d="M15 17h6v-6"/></svg>;
    case 'money': return <svg {...common}><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/></svg>;
    case 'calendar': return <svg {...common}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>;
    case 'tag': return <svg {...common}><path d="M3 12V5a2 2 0 0 1 2-2h7l9 9-9 9z"/><circle cx="7.5" cy="7.5" r="1.3"/></svg>;
    case 'spark': return <svg {...common}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18"/></svg>;
    case 'refresh': return <svg {...common}><path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v5h-5"/></svg>;
    case 'edit': return <svg {...common}><path d="M4 20h4l10-10-4-4L4 16z"/><path d="m14 6 4 4"/></svg>;
  }
}
