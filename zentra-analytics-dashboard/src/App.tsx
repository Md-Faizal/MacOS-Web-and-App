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
      if (!session.token) {
        setIsAuthenticated(false);
        return;
      }

      const valid = await verifySession(session.token);
      if (!valid) {
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
    <div className="min-h-screen w-full bg-[#EDEDEB] p-3 sm:p-5 md:p-6 lg:p-7 flex flex-col items-center justify-start text-[#111111] antialiased">
      <div
        className="w-full max-w-[1480px] flex flex-col gap-4 sm:gap-5 relative"
        id="zentra-dashboard-root"
      >
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

        <main className="w-full flex flex-col gap-4 sm:gap-5" id="dashboard-main-grid">
          <section className="w-full grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5 items-stretch" aria-label="Payments and Volume">
            <div className="lg:col-span-8 flex flex-col">
              <PaymentsCard />
            </div>
            <div className="lg:col-span-4 flex flex-col">
              <GrossVolumeCard />
            </div>
          </section>

          <section className="w-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-4 sm:gap-5 items-stretch" aria-label="Secondary Metrics">
            <div className="lg:col-span-3 flex flex-col">
              <RetentionCard />
            </div>

            <div className="lg:col-span-5 flex flex-col gap-4 sm:gap-5 justify-between">
              <TransactionsCard />
              <CustomersCard />
            </div>

            <div className="md:col-span-2 lg:col-span-4 flex flex-col">
              <InsightCard />
            </div>
          </section>
        </main>
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
