/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { Header } from './components/Header';
import { PageHeading } from './components/PageHeading';
import { PaymentsCard } from './components/cards/PaymentsCard';
import { GrossVolumeCard } from './components/cards/GrossVolumeCard';
import { RetentionCard } from './components/cards/RetentionCard';
import { TransactionsCard } from './components/cards/TransactionsCard';
import { CustomersCard } from './components/cards/CustomersCard';
import { InsightCard } from './components/cards/InsightCard';
import { AddWidgetModal } from './components/modals/AddWidgetModal';
import { LoginScreen } from './components/LoginScreen';
import { readStoredSession, verifySession, clearSession } from './lib/auth';

export default function App() {
  const [activeTab, setActiveTab] = useState('Home');
  const [isAddWidgetOpen, setIsAddWidgetOpen] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const session = readStoredSession();

    async function bootstrap() {
      const isLocalhostDemo = typeof window !== 'undefined' && window.location.hostname === 'localhost';

      if (!session.token) {
        if (isLocalhostDemo) {
          setUser({ username: 'owner', role: 'owner' });
          setIsAuthenticated(true);
          return;
        }

        setIsAuthenticated(false);
        return;
      }

      const valid = await verifySession(session.token);
      if (!valid) {
        if (isLocalhostDemo) {
          setUser(session.user || { username: 'owner', role: 'owner' });
          setIsAuthenticated(true);
          return;
        }

        clearSession();
        setIsAuthenticated(false);
        return;
      }

      setUser(session.user || { username: 'owner', role: 'owner' });
      setIsAuthenticated(true);
    }

    bootstrap();
  }, []);

  if (isAuthenticated === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#ecece9] text-[#111111]">
        <div className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm shadow-[0_8px_24px_rgba(0,0,0,0.06)]">
          Initializing workspace…
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginScreen onAuthenticated={(nextUser) => {
      setUser(nextUser);
      setIsAuthenticated(true);
    }} />;
  }

  return (
    <div className="min-h-[100dvh] w-full bg-[#efefe9] p-2 sm:p-3 lg:p-4">
      <div className="min-h-[calc(100dvh-16px)] rounded-[32px] border border-white/80 bg-[radial-gradient(circle_at_top_left,rgba(255,146,63,0.08),transparent_24%),linear-gradient(180deg,rgba(255,255,255,0.42),rgba(241,241,238,0.96))] shadow-[0_26px_90px_-38px_rgba(17,17,17,0.38)] backdrop-blur-sm sm:min-h-[calc(100dvh-24px)] sm:rounded-[32px] lg:min-h-[calc(100dvh-32px)]">
        <div className="mx-auto w-full max-w-[1760px] px-5 pb-6 pt-4 sm:px-6 sm:pt-5 lg:px-7">
          <Header
            activeTab={activeTab}
            onTabChange={setActiveTab}
            user={user}
            onSignOut={() => {
              clearSession();
              setUser(null);
              setIsAuthenticated(false);
            }}
          />

          <PageHeading
            title="Overview"
            onAddWidget={() => setIsAddWidgetOpen(true)}
          />

          <main id="dashboard-main-grid" className="w-full">
            <div className="dashboard-grid gap-5">
              <section className="lg:col-span-8 flex flex-col" aria-label="Payments and Volume">
                <PaymentsCard />
              </section>

              <section className="lg:col-span-4 flex flex-col" aria-label="Gross Volume">
                <GrossVolumeCard />
              </section>

              <section className="lg:col-span-3 flex flex-col" aria-label="Retention">
                <RetentionCard />
              </section>

              <div className="lg:col-span-5 flex flex-col gap-5 justify-between" aria-label="Transaction and customer metrics">
                <TransactionsCard />
                <CustomersCard />
              </div>

              <section className="lg:col-span-4 flex flex-col" aria-label="Insights">
                <InsightCard />
              </section>
            </div>
          </main>
        </div>
      </div>

      <AddWidgetModal
        isOpen={isAddWidgetOpen}
        onClose={() => setIsAddWidgetOpen(false)}
        onAdd={(widgetName) => {
          console.log('Added widget:', widgetName);
        }}
      />
    </div>
  );
}
