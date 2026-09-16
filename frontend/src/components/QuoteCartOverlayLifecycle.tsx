import { useCallback } from 'react';
import { useQuoteCart } from '../context/QuoteCartContext';
import { useOverlayLifecycle } from '../lib/useOverlayLifecycle';

export default function QuoteCartOverlayLifecycle() {
  const { isOpen, setIsOpen } = useQuoteCart();
  const close = useCallback(() => setIsOpen(false), [setIsOpen]);
  useOverlayLifecycle({ open: isOpen, onClose: close });
  return null;
}
