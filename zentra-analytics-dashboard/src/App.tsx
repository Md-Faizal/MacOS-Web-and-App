/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Suspense, useEffect, useRef, useState } from 'react';
import { Header } from './components/Header';
import { LoginScreen } from './components/LoginScreen';
import { DynamicHalftoneBackground } from './components/DynamicHalftoneBackground';
import { CustomScrollbarTrack } from './components/common/CustomScrollbar';
import { AIBubble } from './components/AIBubble';
import { readStoredSession, clearSession } from './lib/auth';
import { ProfileView } from './views/ProfileView';

// ─── CODE SPLITTING: DYNAMIC LAZY LOADING OF DASHBOARD VIEWS & MODALS ───
const HomeView = React.lazy(() => import('./views/HomeView').then(m => ({ default: m.HomeView })));
const PaymentsView = React.lazy(() => import('./views/PaymentsView').then(m => ({ default: m.PaymentsView })));
const BalancesView = React.lazy(() => import('./views/BalancesView').then(m => ({ default: m.BalancesView })));
const CustomersView = React.lazy(() => import('./views/CustomersView').then(m => ({ default: m.CustomersView })));
const ProductsView = React.lazy(() => import('./views/ProductsView').then(m => ({ default: m.ProductsView })));
const BillingView = React.lazy(() => import('./views/BillingView').then(m => ({ default: m.BillingView })));
const ReportsView = React.lazy(() => import('./views/ReportsView').then(m => ({ default: m.ReportsView })));
const ConnectView = React.lazy(() => import('./views/ConnectView').then(m => ({ default: m.ConnectView })));
const WorkspaceSettingsView = React.lazy(() => import('./views/WorkspaceSettingsView').then(m => ({ default: m.WorkspaceSettingsView })));
const AddWidgetModal = React.lazy(() => import('./components/modals/AddWidgetModal').then(m => ({ default: m.AddWidgetModal })));

export default function App() {
  const [activeTab, setActiveTab] = useState('Home');
  const [currentView, setCurrentView] = useState('Home');
  const [workspaceSettingsSection, setWorkspaceSettingsSection] = useState<'general' | 'profile' | 'security' | 'workers' | 'integrations'>('general');
  const [pagePhase, setPagePhase] = useState<'idle' | 'exiting' | 'entering'>('idle');
  const transitionTimerRef = useRef<NodeJS.Timeout | null>(null);
  const finishTimerRef = useRef<NodeJS.Timeout | null>(null);

  const [isAddWidgetOpen, setIsAddWidgetOpen] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return Boolean(readStoredSession().token);
  });
  const [user, setUser] = useState<any>(() => {
    return readStoredSession().user;
  });
  const [matrixDrawn, setMatrixDrawn] = useState<boolean>(() => {
    return Boolean(readStoredSession().token);
  });

  const cardRef = useRef<HTMLDivElement>(null);
  const [exitingHeight, setExitingHeight] = useState<number | null>(null);

  // When user is already authenticated on initial load, remove static preloader
  useEffect(() => {
    if (!isAuthenticated) return;
    const loader = (window as any).__ZENTRA_LOADER__;
    if (loader) {
      if (typeof loader.stop === 'function') loader.stop();
      delete (window as any).__ZENTRA_LOADER__;
      const el = document.getElementById('zentra-preloader');
      if (el) el.remove();
    }
    setMatrixDrawn(true);
  }, [isAuthenticated]);

  useEffect(() => {
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

  const [dashPhase, setDashPhase] = useState<'entering' | 'idle' | 'exiting' | 'contracting'>('idle');
  const [justLoggedOut, setJustLoggedOut] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0, opacity: 0 });

  // Transition dashPhase to idle once the top-to-bottom login entrance finishes
  useEffect(() => {
    if (dashPhase === 'entering' && isAuthenticated) {
      // 280ms base + 720ms last sublayer delay + 750ms animation = ~1750ms total, idle after 1400ms
      const timer = setTimeout(() => {
        setDashPhase('idle');
      }, 1400);
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
    // Smoothly scroll window to top so scaling happens centered in viewport
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Step 1: All dashboard elements gracefully float upwards with blur and disappear (3-section cascade)
    // The outer dashboard card remains completely full-sized (1760px) and static during this time
    setDashPhase('exiting');

    // Step 2: Once elements have cleanly dissolved (~680ms), start contracting the empty shell
    // This shaves ~600ms off the wait, making the animation snappy and responsive
    setTimeout(() => {
      const padY = window.innerWidth >= 1024 ? 32 : window.innerWidth >= 640 ? 24 : 16;
      const currentH = cardRef.current ? cardRef.current.offsetHeight : (window.innerHeight - padY);
      const targetH = Math.min(720, window.innerHeight - padY);

      // Lock current starting height in exact pixels
      setExitingHeight(currentH);
      setDashPhase('contracting');

      // Next animation frame: animate height & width down to login card dimensions over 650ms
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setExitingHeight(targetH);
        });
      });
    }, 680);

    // Step 3: Complete logout handover right as the 650ms shell contraction finishes (680ms + 650ms = 1330ms)
    setTimeout(() => {
      clearSession();
      setUser(null);
      setJustLoggedOut(true);
      setIsAuthenticated(false);
      setDashPhase('idle');
      setExitingHeight(null);
    }, 1350);
  };

  // ─── TAB SWITCH TRANSITION (Header stays, bottom 2 layers animate) ───
  const handleBackHome = () => {
    setCurrentView('Home');
    setActiveTab('Home');
    setPagePhase('idle');
    if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
    if (finishTimerRef.current) clearTimeout(finishTimerRef.current);
  };

  const handleOpenProfile = () => {
    if (pagePhase === 'exiting') return;
    setWorkspaceSettingsSection('profile');
    setCurrentView('WorkspaceSettings');
    setActiveTab('Home');
    setPagePhase('entering');
    if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
    if (finishTimerRef.current) clearTimeout(finishTimerRef.current);
    finishTimerRef.current = setTimeout(() => setPagePhase('idle'), 450);
  };

  const handleOpenWorkspaceSettings = (section: 'general' | 'profile' | 'security' | 'workers' | 'integrations' = 'general') => {
    if (pagePhase === 'exiting') return;
    setWorkspaceSettingsSection(section);
    setCurrentView('WorkspaceSettings');
    setActiveTab('Home');
    setPagePhase('entering');
    if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
    if (finishTimerRef.current) clearTimeout(finishTimerRef.current);
    finishTimerRef.current = setTimeout(() => setPagePhase('idle'), 450);
  };

  const handleTabChange = (nextTab: string) => {
    if (pagePhase === 'exiting') return;
    if (nextTab === activeTab && currentView === 'Home') return;
    if (nextTab === 'Home' && (currentView === 'Profile' || currentView === 'WorkspaceSettings')) {
      handleBackHome();
      return;
    }

    // Immediately update header tab selector
    setActiveTab(nextTab);

    if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
    if (finishTimerRef.current) clearTimeout(finishTimerRef.current);

    // Step 1: Disappear — layer2 exits at 120ms delay (130ms exit = 250ms total)
    setPagePhase('exiting');

    // Step 2: Swap content and enter from top to bottom
    // Wait for exit to complete: 120ms delay + 300ms exit = 420ms
    transitionTimerRef.current = setTimeout(() => {
      setCurrentView(nextTab);
      setPagePhase('entering');

      // Step 3: Complete transition to idle
      // Layer2 enter: 550ms + layer3f enter: 420ms delay + 650ms = 1070ms total
      finishTimerRef.current = setTimeout(() => {
        setPagePhase('idle');
      }, 750);
    }, 430);
  };

  // ─── ANIMATION CLASS COMPUTATION ───
  // Layer 1 (Header): Animates on login/logout; stays fixed in place during tab changes
  let headerClass = '';
  if (dashPhase === 'exiting' || dashPhase === 'contracting') {
    headerClass = 'animate-logout-layer1';
  } else if (dashPhase === 'entering') {
    headerClass = 'animate-login-layer1';
  }

  // Layer 2 & 3: Animate top-to-bottom on login, bottom-to-top on logout, and during tab changes
  let layer2Class = '';
  let layer3Class = '';

  if (dashPhase === 'exiting' || dashPhase === 'contracting') {
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
    return (
      <Suspense fallback={null}>
        {(() => {
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
            case 'Profile':
              return <WorkspaceSettingsView layer2Class={layer2Class} layer3Class={layer3Class} initialSection="profile" onBackHome={handleBackHome} />;
            case 'WorkspaceSettings':
              return <WorkspaceSettingsView layer2Class={layer2Class} layer3Class={layer3Class} initialSection={workspaceSettingsSection} onBackHome={handleBackHome} />;
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
        })()}
      </Suspense>
    );
  };

  return (
    <>
      <DynamicHalftoneBackground drawFromBottom={matrixDrawn} />
      {isAuthenticated && <AIBubble user={user} />}
      {!isAuthenticated ? (
        <LoginScreen 
          justLoggedOut={justLoggedOut}
          onStartMatrixDraw={() => setMatrixDrawn(true)}
          onAuthenticated={(nextUser) => {
            setUser(nextUser);
            setJustLoggedOut(false);
            setMatrixDrawn(true);
            setDashPhase('entering');
            setIsAuthenticated(true);
          }} 
        />
      ) : (
        <div 
          className={`min-h-[100dvh] w-full flex items-center justify-center transition-all duration-[650ms] ease-[cubic-bezier(0.16,1,0.3,1)] ${
            dashPhase === 'contracting' ? 'p-4 sm:p-5 lg:p-6 overflow-hidden' : 'p-2 sm:p-3 lg:p-4'
          }`}
          style={dashPhase === 'contracting' ? { height: '100dvh', overflow: 'hidden' } : undefined}
        >
          <div 
            ref={cardRef}
            className={`w-full transition-all duration-[650ms] ease-[cubic-bezier(0.16,1,0.3,1)] relative rounded-[32px] sm:rounded-[36px] overflow-hidden backdrop-blur-[24px] sm:backdrop-blur-[28px] backdrop-saturate-[180%] bg-[linear-gradient(135deg,rgba(255,255,255,0.32)_0%,rgba(244,242,238,0.18)_50%,rgba(255,255,255,0.36)_100%)] border border-white/80 shadow-[0_28px_80px_-20px_rgba(17,17,17,0.16),0_0_0_1px_rgba(255,255,255,0.7)_inset,0_2px_4px_rgba(0,0,0,0.02)] ${
              dashPhase === 'contracting'
                ? 'max-w-[1280px]'
                : 'max-w-[1760px] min-h-[calc(100dvh-16px)] sm:min-h-[calc(100dvh-24px)] lg:min-h-[calc(100dvh-32px)] scale-100 opacity-100'
            }`}
            style={
              dashPhase === 'contracting' && exitingHeight !== null
                ? {
                    height: `${exitingHeight}px`,
                    maxHeight: `${exitingHeight}px`,
                    overflow: 'hidden',
                  }
                : undefined
            }
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

            {/* ─── DASHBOARD WORKSPACE (EXPANDS TO BOTTOM OF PAGE, HEADER SCROLLS NATURALLY) ─── */}
            <div 
              id="dashboard-workspace" 
              data-workspace="zentra-main"
              className="mx-auto w-full max-w-[1760px] px-3.5 pb-6 pt-3 sm:px-6 sm:pt-5 lg:px-7"
            >
              {/* ═══════════════════════════════════════════════════════════════════
                  LAYER 1: APPLICATION SHELL HEADER — scrolls WITH content
                 ═══════════════════════════════════════════════════════════════════ */}
              <section 
                id="layer-app-header"
                data-layer="app-header"
                data-layer-order="1"
                className={`relative z-50 ${headerClass}`} 
              >
                <Header
                  activeTab={activeTab}
                  isSettingsView={currentView === 'Profile' || currentView === 'WorkspaceSettings'}
                  onTabChange={handleTabChange}
                  user={user}
                  onSignOut={handleSignOut}
                  onProfileClick={handleOpenProfile}
                  onWorkspaceSettingsClick={() => handleOpenWorkspaceSettings('general')}
                />
              </section>

              {/* ═══════════════════════════════════════════════════════════════════
                  LAYER 2 & LAYER 3: DYNAMIC PAGE VIEW
                 ═══════════════════════════════════════════════════════════════════ */}
              {renderCurrentView()}
            </div>
          </div>

          {/* ─── CUSTOM SCROLLBAR TRACK: OUTSIDE THE MAIN GLASS BOX (SYNCED TO WINDOW) ─── */}
          <CustomScrollbarTrack useWindow />
        </div>
  )}

  <Suspense fallback={null}>
    <AddWidgetModal
      isOpen={isAddWidgetOpen}
      onClose={() => setIsAddWidgetOpen(false)}
      onAdd={(widgetName) => {
        console.log('Added widget:', widgetName);
      }}
    />
  </Suspense>
</>
);
}
