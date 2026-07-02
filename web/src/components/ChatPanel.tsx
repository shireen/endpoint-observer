import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { sendChat } from '../lib/api';
import type { ChatMessage } from '../types';

const SUGGESTIONS = [
  'What were the slowest response times today?',
  'Summarize any issues in the last 24 hours',
  'How is the success rate looking?',
];

const SOURCE_LABEL: Record<NonNullable<ChatMessage['source']>, string> = {
  llm: 'AI',
  cache: 'AI · cached (free)',
  fallback: 'automatic summary',
};

export function ChatPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  async function submit(question: string) {
    const trimmed = question.trim();
    if (!trimmed || busy) return;
    setError(null);
    setBusy(true);
    setInput('');

    const history = messages;
    setMessages((prev) => [
      ...prev,
      { role: 'user', content: trimmed },
      { role: 'assistant', content: '' },
    ]);

    const appendDelta = (delta: string) => {
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1]!;
        next[next.length - 1] = { ...last, content: last.content + delta };
        return next;
      });
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    };

    try {
      const source = await sendChat(trimmed, history, appendDelta);
      setMessages((prev) => {
        const next = [...prev];
        next[next.length - 1] = { ...next[next.length - 1]!, source };
        return next;
      });
      void queryClient.invalidateQueries({ queryKey: ['llmUsage'] });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chat failed');
      setMessages((prev) => prev.slice(0, -1)); // drop the empty assistant stub
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-[70vh] flex-col rounded-2xl border border-line bg-surface">
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-5">
        {messages.length === 0 && (
          <div className="mt-10 text-center">
            <p className="font-display text-base font-medium text-ink">
              Ask questions about the monitoring data
            </p>
            <p className="mt-1 text-xs text-muted">Answers are grounded in the recorded checks.</p>
            <div className="mx-auto mt-5 flex max-w-md flex-col gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => void submit(s)}
                  className="rounded-lg border border-line bg-paper px-3 py-2.5 text-left text-sm text-ink/80 transition-colors hover:border-gold/60 hover:text-ink"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((message, i) => (
          <div
            key={i}
            className={message.role === 'user' ? 'flex justify-end' : 'flex justify-start'}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                message.role === 'user'
                  ? 'bg-gold font-medium text-ink'
                  : 'border border-line bg-paper text-ink'
              }`}
            >
              <pre className="whitespace-pre-wrap font-sans">
                {message.content || (busy && i === messages.length - 1 ? 'Thinking…' : '')}
              </pre>
              {message.source && (
                <p
                  className={`mt-1.5 font-display text-[10px] uppercase tracking-widest ${
                    message.role === 'user' ? 'text-ink/60' : 'text-muted'
                  }`}
                >
                  {SOURCE_LABEL[message.source]}
                </p>
              )}
            </div>
          </div>
        ))}
        {error && (
          <p className="rounded-lg border border-danger/30 bg-danger/5 p-3 text-xs text-danger">
            {error}
          </p>
        )}
      </div>
      <form
        className="flex gap-2 border-t border-line p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void submit(input);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="e.g. Why did latency spike this afternoon?"
          maxLength={2000}
          className="flex-1 rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-gold focus:outline-none"
        />
        <button
          type="submit"
          disabled={busy || input.trim().length === 0}
          className="rounded-lg bg-gold px-5 py-2 font-display text-sm font-semibold text-ink transition-colors hover:bg-gold-soft disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? '…' : 'Send'}
        </button>
      </form>
    </div>
  );
}
