// Shared dialog behavior — one hook, all overlays:
//   · locks body scroll while open
//   · sets initial focus (explicit target, else first focusable)
//   · traps Tab inside the dialog (full keyboard containment)
//   · Escape closes
//   · restores focus to the trigger element on unmount
// No libraries; mount-only effect — these components fully unmount on close.

import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useDialogA11y(
  containerRef: RefObject<HTMLElement | null>,
  onClose: () => void,
  initialFocus?: RefObject<HTMLElement | null>,
) {
  // Keep callbacks in refs so the effect runs exactly once per mount —
  // parents pass inline closures that would otherwise retrigger it.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    const prevFocus = document.activeElement as HTMLElement | null;
    document.body.style.overflow = 'hidden';

    const focusTimer = window.setTimeout(() => {
      const target =
        initialFocus?.current ??
        root.querySelector<HTMLElement>(FOCUSABLE);
      target?.focus();
    }, 40);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const box = containerRef.current;
      if (!box) return;
      // Visible focusables only (offsetParent is null inside display:none /
      // hidden subtrees like hover drawers).
      const items = Array.from(box.querySelectorAll<HTMLElement>(FOCUSABLE))
        .filter(el => el.offsetParent !== null || el === document.activeElement);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (!box.contains(active)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      prevFocus?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
