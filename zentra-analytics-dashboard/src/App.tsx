/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { Header } from './components/Header';
import { HomeView } from './views/HomeView';
import { PaymentsView } from './views/PaymentsView';
import { BalancesView } from './views/BalancesView';
import { CustomersView } from './views/CustomersView';
import { ProductsView } from './views/ProductsView';
import { BillingView } from './views/BillingView';
import { ReportsView } from './views/ReportsView';
import { ConnectView } from './views/ConnectView';
import { AddWidgetModal } from './components/modals/AddWidgetModal';
import { LoginScreen } from './components/LoginScreen';
import { DynamicHalftoneBackground } from './components/DynamicHalftoneBackground';
import { readStoredSession, verifySession, clearSession } from './lib/auth';

export default function App() {
  const [activeTab, setActiveTab] = useState('Home');
  const [currentView, setCurrentView] = useState('Home');
  const [pagePhase, setPagePhase] = useState<'idle' | 'exiting' | 'entering'>('idle');
  const transitionTimerRef = useRef<NodeJS.Timeout | null>(null);
  const finishTimerRef = useRef<NodeJS.Timeout | null>(null);

  const [isAddWidgetOpen, setIsAddWidgetOpen] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    async function bootstrap() {
      const session = readStoredSession();

      if (!session.token) {
        clearSession();
        setUser(null);
        setIsAuthenticated(false);
        return;
      }

      const res = await verifySession(session.token);
      if (!res.valid || !res.user) {
        clearSession();
        setUser(null);
        setIsAuthenticated(false);
        return;
      }

      setUser(res.user);
      setIsAuthenticated(true);
    }

    bootstrap();

    const handleUnauthorized = () => {
      clearSession();
      setUser(null);
      setIsAuthenticated(false);
    };

    window.addEventListener('zentra:unauthorized', handleUnauthorized);
    return () => {
      window.removeEventListener('zentra:unauthorized', handleUnauthorized);
    };
  }, []);

  const [dashPhase, setDashPhase] = useState<'entering' | 'idle' | 'exiting'>('entering');
  const [justLoggedOut, setJustLoggedOut] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0, opacity: 0 });

  // Transition dashPhase to idle once the top-to-bottom login entrance finishes
  useEffect(() => {
    if (dashPhase === 'entering' && isAuthenticated) {
      const timer = setTimeout(() => {
        setDashPhase('idle');
      }, 950);
      return () => clearTimeout(timer);
    }
  }, [dashPhase, isAuthenticated]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setMousePos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      opacity: 1,
    });
  };

  const handleMouseLeave = () => {
    setMousePos((prev) => ({ ...prev, opacity: 0 }));
  };

  const handleSignOut = () => {
    setDashPhase('exiting');
    
    // 3-layer bottom-to-top disappear (exit animation 500ms + 200ms delay = 700ms) + smooth container contraction
    setTimeout(() => {
      clearSession();
      setUser(null);
      setJustLoggedOut(true);
      setIsAuthenticated(false);
      setDashPhase('entering');
    }, 750);
  };

  // ─── TAB SWITCH TRANSITION (Header stays, bottom 2 layers animate) ───
  const handleTabChange = (nextTab: string) => {
    if (nextTab === activeTab || pagePhase === 'exiting') return;

    // Immediately update header tab selector
    setActiveTab(nextTab);

    if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
    if (finishTimerRef.current) clearTimeout(finishTimerRef.current);

    // Step 1: Disappear from bottom to top (Layer 3 at 0ms, Layer 2 at 75ms)
    setPagePhase('exiting');

    // Step 2: Swap content and enter from top to bottom (Layer 2 at 0ms, Layer 3 at 90ms)
    transitionTimerRef.current = setTimeout(() => {
      setCurrentView(nextTab);
      setPagePhase('entering');

      // Step 3: Complete transition to idle
      finishTimerRef.current = setTimeout(() => {
        setPagePhase('idle');
      }, 440);
    }, 260);
  };

  // ─── ANIMATION CLASS COMPUTATION ───
  // Layer 1 (Header): Animates on login/logout; stays fixed in place during tab changes
  let headerClass = '';
  if (dashPhase === 'exiting') {
    headerClass = 'animate-logout-layer1';
  } else if (dashPhase === 'entering') {
    headerClass = 'animate-login-layer1';
  }

  // Layer 2 & 3: Animate top-to-bottom on login, bottom-to-top on logout, and during tab changes
  let layer2Class = '';
  let layer3Class = '';

  if (dashPhase === 'exiting') {
    layer2Class = 'animate-logout-layer2';
    layer3Class = 'animate-logout-layer3';
  } else if (dashPhase === 'entering') {
    layer2Class = 'animate-login-layer2';
    layer3Class = 'animate-login-layer3';
  } else if (pagePhase === 'exiting') {
    layer2Class = 'animate-page-exit-layer2';
    layer3Class = 'animate-page-exit-layer3';
  } else if (pagePhase === 'entering') {
    layer2Class = 'animate-page-enter-layer2';
    layer3Class = 'animate-page-enter-layer3';
  }

  const renderCurrentView = () => {
    switch (currentView) {
      case 'Payments':
        return <PaymentsView layer2Class={layer2Class} layer3Class={layer3Class} />;
      case 'Balances':
        return <BalancesView layer2Class={layer2Class} layer3Class={layer3Class} />;
      case 'Customers':
        return <CustomersView layer2Class={layer2Class} layer3Class={layer3Class} />;
      case 'Products':
        return <ProductsView layer2Class={layer2Class} layer3Class={layer3Class} />;
      case 'Billing':
        return <BillingView layer2Class={layer2Class} layer3Class={layer3Class} />;
      case 'Reports':
        return <ReportsView layer2Class={layer2Class} layer3Class={layer3Class} />;
      case 'Connect':
        return <ConnectView layer2Class={layer2Class} layer3Class={layer3Class} />;
      case 'Home':
      default:
        return (
          <HomeView
            layer2Class={layer2Class}
            layer3Class={layer3Class}
            onAddWidget={() => setIsAddWidgetOpen(true)}
          />
        );
    }
  };

  if (isAuthenticated === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#ecece9] text-[#111111]">
        <div className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm shadow-[0_8px_24px_rgba(0,0,0,0.06)]">
          Initializing workspace…
        </div>
      </div>
    );
  }

  return (
    <>
      <DynamicHalftoneBackground />
      {!isAuthenticated ? (
        <LoginScreen 
          justLoggedOut={justLoggedOut}
          onAuthenticated={(nextUser) => {
            setUser(nextUser);
            setJustLoggedOut(false);
            setDashPhase('entering');
            setIsAuthenticated(true);
          }} 
        />
      ) : (
        <div className={`min-h-[100dvh] w-full flex items-center justify-center transition-all duration-[750ms] ease-[cubic-bezier(0.16,1,0.3,1)] ${
          dashPhase === 'exiting' ? 'px-4 py-8' : 'p-2 sm:p-3 lg:p-4'
        }`}>
          <div 
            className={`w-full transition-all duration-[750ms] ease-[cubic-bezier(0.16,1,0.3,1)] relative rounded-[32px] overflow-hidden backdrop-blur-[24px] sm:backdrop-blur-[28px] backdrop-saturate-[180%] bg-[linear-gradient(135deg,rgba(255,255,255,0.32)_0%,rgba(244,242,238,0.18)_50%,rgba(255,255,255,0.36)_100%)] border border-white/80 ${
              dashPhase === 'exiting'
                ? 'max-w-[1280px] min-h-[600px] shadow-[0_2px_4px_rgba(0,0,0,0.02),0_12px_28px_-6px_rgba(17,17,17,0.08),0_28px_80px_-16px_rgba(17,17,17,0.14)]'
                : 'max-w-[1760px] min-h-[calc(100dvh-16px)] sm:min-h-[calc(100dvh-24px)] lg:min-h-[calc(100dvh-32px)] shadow-[0_28px_80px_-20px_rgba(17,17,17,0.16),0_0_0_1px_rgba(255,255,255,0.7)_inset,0_2px_4px_rgba(0,0,0,0.02)]'
            }`}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
          >
            {/* ─── INTERACTIVE ANGULAR GLASS REFLECTION BORDER (DYNAMIC ALL EDGES) ─── */}
            <div 
              className="pointer-events-none absolute -inset-[1px] rounded-[33px] z-30 overflow-hidden" 
              aria-hidden="true"
            >
              {/* Base Angular Glass Bevel Edge */}
              <div 
                className="absolute inset-0 rounded-[33px]" 
                style={{
                  padding: '1.4px',
                  background: 'linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.4) 25%, rgba(17,17,17,0.06) 50%, rgba(255,255,255,0.3) 75%, rgba(255,255,255,0.85) 100%)',
                  WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                  WebkitMaskComposite: 'xor',
                  maskComposite: 'exclude',
                }}
              />

              {/* Dynamic Mouse-Following Blue Specular Edge Stroke (Smaller & subtle, yet clearly visible) */}
              <div 
                className="absolute inset-0 rounded-[33px] transition-opacity duration-300 ease-out" 
                style={{
                  padding: '1.5px',
                  background: `radial-gradient(260px circle at ${mousePos.x}px ${mousePos.y}px, rgba(255,255,255,0.92) 0%, rgba(56,189,248,0.65) 24%, rgba(37,99,235,0.4) 48%, rgba(37,99,235,0.1) 68%, transparent 82%)`,
                  WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                  WebkitMaskComposite: 'xor',
                  maskComposite: 'exclude',
                  opacity: mousePos.opacity ? 0.82 : 0,
                }}
              />
            </div>

        <div 
          id="dashboard-workspace" 
          data-workspace="zentra-main"
          className="mx-auto w-full max-w-[1760px] px-3.5 pb-6 pt-3 sm:px-6 sm:pt-5 lg:px-7"
        >
          {/* ═════════════════════════════════════════════════════════════════════════
              LAYER 1: APPLICATION SHELL HEADER (Global Navigation & Utilities)
              Industry Standard: Global App Header / Shell Nav
              Role: Persistent navigation across all dashboard routes & user session dock
              Behavior: Remains mounted & fixed in place when switching pages.
             ═════════════════════════════════════════════════════════════════════════ */}
          <section 
            id="layer-app-header"
            data-layer="app-header"
            data-layer-order="1"
            className={`relative z-50 ${headerClass}`} 
          >
            <Header
              activeTab={activeTab}
              onTabChange={handleTabChange}
              user={user}
              onSignOut={handleSignOut}
            />
          </section>

          {/* ═════════════════════════════════════════════════════════════════════════
              LAYER 2 & LAYER 3: DYNAMIC PAGE VIEW (Controlled Transitions)
              Bottom-to-top disappear (Layer 3 then Layer 2)
              Top-to-bottom appear (Layer 2 then Layer 3)
             ═════════════════════════════════════════════════════════════════════════ */}
          {renderCurrentView()}
        </div>
      </div>
    </div>
  )}

  <AddWidgetModal
    isOpen={isAddWidgetOpen}
    onClose={() => setIsAddWidgetOpen(false)}
    onAdd={(widgetName) => {
      console.log('Added widget:', widgetName);
    }}
  />
</>
);
}
