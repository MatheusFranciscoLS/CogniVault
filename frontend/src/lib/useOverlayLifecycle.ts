import { useEffect } from 'react';

type OverlayLifecycleOptions = {
  open?: boolean;
  onClose: () => void;
};

export function useOverlayLifecycle({ open = true, onClose }: OverlayLifecycleOptions) {
  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onClose();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose, open]);
}
