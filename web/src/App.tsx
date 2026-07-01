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
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900/60 px-4 py-3 sm:px-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">HTTP Response Monitor</h1>
            <p className="text-xs text-slate-400">
              pings <code className="text-slate-300">httpbin.org/anything</code> every 5 minutes
            </p>
          </div>
          <ConnectionBadge state={connection} />
        </div>
      </header>

      <nav className="border-b border-slate-800 px-4 sm:px-8">
        <div className="mx-auto flex max-w-6xl gap-1">
          {TABS.map((name) => (
            <button
              key={name}
              onClick={() => setTab(name)}
              className={`relative px-4 py-2.5 text-sm font-medium transition-colors ${
                tab === name
                  ? 'text-sky-400 after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:bg-sky-400'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {name}
              {name === 'Incidents' && incidentCount > 0 && (
                <span className="ml-1.5 rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-400">
                  {incidentCount}
                </span>
              )}
            </button>
          ))}
        </div>
      </nav>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-8">
        {tab === 'Dashboard' && <Dashboard />}
        {tab === 'Incidents' && <IncidentsPanel />}
        {tab === 'Ask AI' && <ChatPanel />}
      </main>
    </div>
  );
}
