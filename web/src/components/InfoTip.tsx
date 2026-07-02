import { useEffect, useId, useRef, useState } from 'react';

/**
 * Small info affordance that reveals an explanation across every input mode:
 * hover (mouse), focus (keyboard), and tap (touch — a tap both focuses the
 * button and fires click, so it opens). Closes on mouse-leave, blur, Escape,
 * or an outside click/tap. The trigger is a real <button> with an accessible
 * label, and the popover is linked via aria-describedby. Visibility is driven
 * by conditional rendering (not a CSS class) so it's unambiguous to assistive
 * tech and tests.
 */
export function InfoTip({ label, text }: { label: string; text: string }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const tipId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <span
      ref={wrapRef}
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label={`What is ${label}?`}
        aria-expanded={open}
        aria-describedby={open ? tipId : undefined}
        onClick={() => setOpen(true)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="text-muted transition-colors hover:text-ink focus-visible:text-ink focus:outline-none"
      >
        <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="h-4 w-4">
          <path
            fillRule="evenodd"
            d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-7-4a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM9 9a.75.75 0 0 0 0 1.5h.253a.25.25 0 0 1 .244.304l-.459 2.066A1.75 1.75 0 0 0 10.747 15H11a.75.75 0 0 0 0-1.5h-.253a.25.25 0 0 1-.244-.304l.459-2.066A1.75 1.75 0 0 0 9.253 9H9Z"
            clipRule="evenodd"
          />
        </svg>
      </button>
      {open && (
        <span
          id={tipId}
          role="tooltip"
          className="absolute left-1/2 top-6 z-30 w-56 max-w-[75vw] -translate-x-1/2 rounded-lg border border-line bg-paper p-3 text-xs font-normal normal-case leading-relaxed tracking-normal text-ink shadow-lg"
        >
          {text}
        </span>
      )}
    </span>
  );
}
