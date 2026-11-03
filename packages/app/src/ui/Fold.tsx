import type { ReactNode } from "react";
import { useLayout } from "../state/layout.ts";

/**
 * A section that folds to its title line, with a one-line summary of what is
 * inside so a folded section still says something. Open or closed is
 * remembered per viewer (state/layout.ts). `forceOpen` keeps it open, for the
 * guided tour or for an error that must stay in sight. The content stays
 * mounted while folded, so half-typed values are kept.
 */
export function Fold({
  id,
  title,
  summary,
  defaultOpen = false,
  forceOpen = false,
  className,
  children,
}: {
  id: string;
  title: ReactNode;
  summary?: ReactNode;
  defaultOpen?: boolean;
  forceOpen?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const stored = useLayout((s) => s.sections[id]);
  const setSection = useLayout((s) => s.setSection);
  const open = forceOpen || (stored ?? defaultOpen);
  return (
    <details
      className={className === undefined ? "fold" : `fold ${className}`}
      open={open}
      onToggle={(e) => {
        // Also fires when React sets `open` itself; only a change by the viewer is stored.
        if (e.target !== e.currentTarget) return;
        const now = e.currentTarget.open;
        if (now !== open) setSection(id, now);
      }}
    >
      <summary>
        <svg className="fold-chevron" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M4.5 2.5L8 6L4.5 9.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="fold-title">{title}</span>
        {summary !== undefined && <span className="fold-summary">{summary}</span>}
      </summary>
      <div className="fold-body">{children}</div>
    </details>
  );
}
