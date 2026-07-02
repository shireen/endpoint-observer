import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';

/*
 * Renders model-generated markdown (incident analyses, chat answers) with the
 * app's design tokens. react-markdown is used deliberately: it never uses
 * dangerouslySetInnerHTML, so LLM output can't inject markup. remark-breaks
 * preserves single newlines (the deterministic fallback summaries rely on
 * them); remark-gfm adds lists/tables/etc.
 *
 * `node` is stripped from each override so it doesn't land on the DOM element.
 */
const components: Components = {
  h1: ({ node: _n, ...p }) => (
    <h3 className="mb-1 mt-4 font-display text-sm font-semibold text-ink first:mt-0" {...p} />
  ),
  h2: ({ node: _n, ...p }) => (
    <h4
      className="mb-1 mt-4 font-display text-[11px] font-semibold uppercase tracking-widest text-gold-deep first:mt-0"
      {...p}
    />
  ),
  h3: ({ node: _n, ...p }) => (
    <h4
      className="mb-1 mt-3 font-display text-xs font-semibold uppercase tracking-wide text-ink first:mt-0"
      {...p}
    />
  ),
  p: ({ node: _n, ...p }) => <p className="mb-2 last:mb-0" {...p} />,
  ul: ({ node: _n, ...p }) => (
    <ul className="mb-2 list-disc space-y-1 pl-5 marker:text-gold last:mb-0" {...p} />
  ),
  ol: ({ node: _n, ...p }) => <ol className="mb-2 list-decimal space-y-1 pl-5 last:mb-0" {...p} />,
  li: ({ node: _n, ...p }) => <li {...p} />,
  strong: ({ node: _n, ...p }) => <strong className="font-semibold text-ink" {...p} />,
  em: ({ node: _n, ...p }) => <em className="italic text-muted" {...p} />,
  a: ({ node: _n, ...p }) => (
    <a className="text-gold-deep underline" target="_blank" rel="noreferrer" {...p} />
  ),
  code: ({ node: _n, ...p }) => (
    <code className="rounded bg-surface-2 px-1 py-0.5 text-[0.85em]" {...p} />
  ),
};

export function Markdown({ children }: { children: string }) {
  return (
    <div className="text-sm leading-relaxed">
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
