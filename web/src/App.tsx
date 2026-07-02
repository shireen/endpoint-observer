import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchIncidents } from './lib/api';
import { useEventStream } from './hooks/useEventStream';
import { ConnectionBadge } from './components/ConnectionBadge';
import { Dashboard } from './components/Dashboard';
import { IncidentsPanel } from './components/IncidentsPanel';
import { ChatPanel } from './components/ChatPanel';

const TABS = ['Dashboard', 'Incidents', 'Ask AI'] as const;
type Tab = (typeof TABS)[number];

export default function App() {
  const [tab, setTab] = useState<Tab>('Dashboard');
  const connection = useEventStream();
  const incidents = useQuery({ queryKey: ['incidents'], queryFn: fetchIncidents });
  const incidentCount = incidents.data?.items.length ?? 0;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-line bg-paper/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-8">
          <div className="flex items-center gap-3">
            <span
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-gold font-display text-lg font-bold text-ink"
              aria-hidden
            >
              E
            </span>
            <div>
              <h1 className="font-display text-lg font-bold uppercase tracking-tight text-ink">
                Endpoint <span className="rounded-sm bg-gold px-1.5 py-0.5 text-ink">Observer</span>
              </h1>
              <p className="mt-0.5 text-xs text-muted">
                synthetic monitoring for <code className="text-ink/70">httpbin.org/anything</code>
              </p>
            </div>
          </div>
          <ConnectionBadge state={connection} />
        </div>
      </header>

      <nav className="border-b border-line px-4 sm:px-8">
        <div className="mx-auto flex max-w-6xl gap-1">
          {TABS.map((name) => (
            <button
              key={name}
              onClick={() => setTab(name)}
              className={`relative px-4 py-3 font-display text-sm font-medium tracking-wide transition-colors ${
                tab === name
                  ? 'text-ink after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:bg-gold'
                  : 'text-muted hover:text-ink'
              }`}
            >
              {name}
              {name === 'Incidents' && incidentCount > 0 && (
                <span className="ml-1.5 rounded-full bg-gold/25 px-1.5 py-0.5 text-[10px] font-semibold text-ink">
                  {incidentCount}
                </span>
              )}
            </button>
          ))}
        </div>
      </nav>

      <main className="mx-auto max-w-6xl px-4 py-7 sm:px-8">
        {tab === 'Dashboard' && <Dashboard />}
        {tab === 'Incidents' && <IncidentsPanel />}
        {tab === 'Ask AI' && <ChatPanel />}
      </main>
    </div>
  );
}
