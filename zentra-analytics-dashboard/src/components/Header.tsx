import React, { useEffect, useRef, useState } from 'react';
import { BrandLogo } from './common/BrandLogo';
import { Search, Bell, X, CheckCircle, ArrowUpRight, Menu } from 'lucide-react';

interface HeaderProps {
  activeTab?: string;
  onTabChange?: (tab: string) => void;
  user?: {
    username?: string;
    email?: string;
    full_name?: string;
    role?: string;
  };
  onSignOut?: () => void;
}

const NAV_ITEMS = ['Home', 'Payments', 'Balances', 'Customers', 'Products', 'Billing', 'Reports', 'Connect'] as const;

export const Header: React.FC<HeaderProps> = ({
  activeTab = 'Home',
  onTabChange,
  user,
  onSignOut,
}) => {
  const [currentTab, setCurrentTab] = useState(activeTab);
  const [showSearch, setShowSearch] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showNavMenu, setShowNavMenu] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectorStyle, setSelectorStyle] = useState({ left: 0, width: 0, top: 0, height: 0 });
  const [menuSelectorStyle, setMenuSelectorStyle] = useState({ left: 0, width: 0, top: 0, height: 0 });
  const navButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const menuButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const dragStartX = useRef<number | null>(null);

  const navItems = NAV_ITEMS;

  useEffect(() => {
    setCurrentTab(activeTab);
  }, [activeTab]);

  const closeAllHeaderPopups = () => {
    setShowSearch(false);
    setShowNotifications(false);
    setShowUserMenu(false);
  };

  const toggleHeaderPopup = (type: 'search' | 'notifications' | 'user') => {
    const nextSearch = type === 'search' ? !showSearch : false;
    const nextNotifications = type === 'notifications' ? !showNotifications : false;
    const nextUser = type === 'user' ? !showUserMenu : false;

    setShowSearch(nextSearch);
    setShowNotifications(nextNotifications);
    setShowUserMenu(nextUser);
  };

  const handleTabClick = (tab: string) => {
    setCurrentTab(tab);
    if (onTabChange) {
      onTabChange(tab);
    }
  };

  const moveToTab = (direction: 'prev' | 'next') => {
    const index = navItems.indexOf(currentTab as any);
    const nextIndex = direction === 'next'
      ? Math.min(index + 1, navItems.length - 1)
      : Math.max(index - 1, 0);
    const nextTab = navItems[nextIndex];
    if (nextTab && nextTab !== currentTab) {
      handleTabClick(nextTab);
    }
  };

  useEffect(() => {
    const activeIndex = navItems.indexOf(currentTab as any);
    const activeButton = navButtonRefs.current[activeIndex];

    if (!activeButton) return;

    const parent = activeButton.parentElement;
    if (!parent) return;

    const parentRect = parent.getBoundingClientRect();
    const buttonRect = activeButton.getBoundingClientRect();
    const newLeft = buttonRect.left - parentRect.left;
    const newWidth = buttonRect.width;
    const newHeight = parentRect.height;

    setSelectorStyle((prev) => {
      if (prev.left === newLeft && prev.width === newWidth && prev.height === newHeight) {
        return prev;
      }
      return {
        left: newLeft,
        width: newWidth,
        top: 0,
        height: newHeight,
      };
    });
  }, [currentTab]);

  useEffect(() => {
    if (!showNavMenu) return;

    const activeIndex = navItems.indexOf(currentTab as any);
    const activeButton = menuButtonRefs.current[activeIndex];

    if (!activeButton) return;

    const parent = activeButton.parentElement;
    if (!parent) return;

    const parentRect = parent.getBoundingClientRect();
    const buttonRect = activeButton.getBoundingClientRect();
    const newLeft = buttonRect.left - parentRect.left;
    const newTop = buttonRect.top - parentRect.top;
    const newWidth = buttonRect.width;
    const newHeight = buttonRect.height;

    setMenuSelectorStyle((prev) => {
      if (
        prev.left === newLeft &&
        prev.top === newTop &&
        prev.width === newWidth &&
        prev.height === newHeight
      ) {
        return prev;
      }
      return {
        left: newLeft,
        width: newWidth,
        top: newTop,
        height: newHeight,
      };
    });
  }, [currentTab, showNavMenu]);

  return (
    <header 
      id="app-header" 
      data-component="AppHeader"
      data-section="global-header"
      role="banner"
      className="relative z-[100] w-full select-none pb-3 pt-1.5 sm:pb-4 sm:pt-2"
    >
      <div 
        id="app-header-shell"
        data-slot="shell-pill"
        className="flex w-full flex-wrap items-center gap-2 rounded-[26px] border border-black/[0.09] bg-white px-2.5 py-2.5 shadow-[0_14px_36px_-12px_rgba(17,17,17,0.12),0_2px_6px_rgba(17,17,17,0.04)] sm:gap-3 sm:px-3 sm:py-3"
      >
        {/* ─── GROUP A: BRAND IDENTITY & PRIMARY NAVIGATION ─── */}
        <div 
          id="header-nav-group"
          data-slot="brand-and-nav"
          className="flex min-w-0 flex-1 items-center gap-2.5 sm:gap-3"
        >
          {/* Sub-group 1: Brand Logo & Mobile Drawer Triggers */}
          <div 
            id="header-brand-group"
            data-slot="brand-identity"
            className="flex shrink-0 items-center gap-3"
          >
            <div className="flex items-center gap-2.5 rounded-[16px] border border-black/[0.08] bg-neutral-100/90 px-1.5 py-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] sm:px-2 sm:py-1.5">
              <BrandLogo size={28} />
            </div>

            <button
              type="button"
              aria-label="Open navigation"
              onClick={() => {
                closeAllHeaderPopups();
                setShowNavMenu((prev) => !prev);
              }}
              className="hidden min-h-[42px] items-center gap-2 rounded-[12px] border border-[#111111]/10 bg-[#111111] px-3.5 py-2.5 text-[12px] font-semibold tracking-[0.04em] text-white shadow-[0_8px_18px_rgba(17,17,17,0.16)] transition hover:bg-[#171717] active:scale-[0.98] md:flex xl:hidden"
            >
              <Menu className="h-4 w-4 stroke-[2.2]" />
              <span>Menu</span>
            </button>

            <button
              type="button"
              aria-label="Open navigation"
              onClick={() => {
                closeAllHeaderPopups();
                setShowNavMenu((prev) => !prev);
              }}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-[#111111]/10 bg-[#111111] text-white shadow-[0_8px_18px_rgba(17,17,17,0.16)] transition hover:bg-[#171717] active:scale-[0.98] md:hidden"
            >
              <Menu className="h-4 w-4 stroke-[2.2]" />
            </button>
          </div>

          {/* Sub-group 2: Desktop Primary Route Tabs */}
          <nav
            id="header-primary-nav"
            data-slot="primary-nav"
            aria-label="Main Navigation"
            className="relative hidden min-w-0 items-center gap-2 overflow-hidden xl:flex"
            onPointerDown={(event) => {
              dragStartX.current = event.clientX;
            }}
            onPointerUp={(event) => {
              if (dragStartX.current == null) return;

              const delta = event.clientX - dragStartX.current;
              if (delta > 60) {
                moveToTab('prev');
              } else if (delta < -60) {
                moveToTab('next');
              }
              dragStartX.current = null;
            }}
          >
            <div
              className="absolute top-1 left-0 h-[calc(100%-8px)] rounded-[12px] bg-[#171717] shadow-[0_8px_18px_rgba(17,17,17,0.16)] transition-[left,width,transform] duration-300 ease-out"
              style={{
                left: `${selectorStyle.left}px`,
                width: `${selectorStyle.width}px`,
              }}
            />
            {navItems.map((item, index) => (
              <button
                key={item}
                type="button"
                data-tab-name={item.toLowerCase()}
                ref={(element) => {
                  navButtonRefs.current[index] = element;
                }}
                onClick={() => handleTabClick(item)}
                className={`relative z-10 rounded-[12px] px-4 py-2.5 text-[14px] font-medium transition-all duration-300 ${
                  currentTab === item
                    ? 'text-white'
                    : 'text-[#2b2b2b] hover:bg-black/[0.04]'
                }`}
              >
                {item}
              </button>
            ))}
          </nav>
        </div>

        {/* ─── GROUP B: UTILITIES DOCK (Global Actions & User Session) ─── */}
        <div 
          id="header-utilities-dock"
          data-slot="utilities-dock"
          className="ml-auto flex shrink-0 items-center gap-2 sm:gap-2.5 sm:gap-3"
        >
          {/* Sub-group 1: Global Search */}
          <div 
            id="header-search-control"
            data-utility-slot="search"
            className="relative flex shrink-0"
          >
            <button
              type="button"
              onClick={() => {
                setShowNavMenu(false);
                toggleHeaderPopup('search');
              }}
              aria-label="Search"
              id="header-search-btn"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-black/5 bg-white/90 text-[#555555] shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition hover:bg-white hover:text-[#111111] active:scale-[0.98] sm:h-12 sm:w-12"
            >
              <Search className="h-4 w-4 stroke-[2.2] sm:h-5 sm:w-5" />
            </button>

            {showSearch && (
              <div className="absolute right-0 top-14 w-[min(80vw,20rem)] rounded-2xl border border-black/[0.08] bg-white/95 p-3 shadow-[0_16px_40px_-6px_rgba(0,0,0,0.18)] backdrop-blur-md z-50">
                <div className="flex items-center gap-2 border-b border-black/[0.06] px-1 pb-2">
                  <Search className="h-4 w-4 text-[#888888]" />
                  <input
                    type="text"
                    placeholder="Search payments, customers, metrics..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    autoFocus
                    className="w-full bg-transparent text-sm text-[#111111] outline-none placeholder:text-[#999999]"
                  />
                  <button onClick={() => setShowSearch(false)} className="text-[#888888] hover:text-[#111111]">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-2 space-y-1">
                  <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#888888]">Quick Links</div>
                  {['Successful Payments (48.6k)', 'Gross Volume ($41,540)', 'Retention Report (42%)', 'Top Customer Accounts'].map((item, idx) => (
                    <div
                      key={idx}
                      onClick={() => setShowSearch(false)}
                      className="flex cursor-pointer items-center justify-between rounded-lg px-2.5 py-1.5 text-xs text-[#333333] hover:bg-[#F3F3F2]"
                    >
                      <span>{item}</span>
                      <ArrowUpRight className="h-3 w-3 text-[#999999]" />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Sub-group 2: Notifications */}
          <div 
            id="header-notifications-control"
            data-utility-slot="notifications"
            className="relative flex shrink-0"
          >
            <button
              type="button"
              onClick={() => {
                setShowNavMenu(false);
                toggleHeaderPopup('notifications');
              }}
              aria-label="Notifications"
              id="header-notifications-btn"
              className="relative flex h-9 w-9 items-center justify-center rounded-full border border-black/5 bg-white/90 text-[#555555] shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition hover:bg-white hover:text-[#111111] active:scale-[0.98] sm:h-12 sm:w-12"
            >
              <Bell className="h-4 w-4 stroke-[2.2] sm:h-5 sm:w-5" />
              <span className="absolute right-2 top-2.5 h-2.5 w-2.5 rounded-full bg-[#FF453A] ring-1.5 ring-white sm:right-2.5" />
            </button>

            {showNotifications && (
              <div className="absolute right-0 top-14 w-[min(82vw,20rem)] rounded-2xl border border-black/[0.08] bg-white/95 p-3 shadow-[0_16px_40px_-6px_rgba(0,0,0,0.18)] backdrop-blur-md z-50">
                <div className="flex items-center justify-between border-b border-black/[0.06] px-1 pb-2">
                  <span className="text-xs font-semibold text-[#111111]">Notifications (2 new)</span>
                  <button onClick={() => setShowNotifications(false)} className="text-[#888888] hover:text-[#111111]">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="mt-2 space-y-2">
                  <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-2.5 text-xs">
                    <div className="flex items-center gap-1.5 font-medium text-blue-900">
                      <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />
                      Authorization rate +4%
                    </div>
                    <div className="mt-0.5 text-[11.5px] text-blue-700/80">Projected to recover $12,400 this week.</div>
                  </div>
                  <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-2.5 text-xs">
                    <div className="flex items-center gap-1.5 font-medium text-emerald-900">
                      <CheckCircle className="h-3 w-3 text-emerald-600" />
                      Payout of $38.3k initiated
                    </div>
                    <div className="mt-0.5 text-[11.5px] text-emerald-700/80">Transferred to 1,284 merchant accounts.</div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Sub-group 3: User Profile & Session Menu */}
          <div 
            id="header-user-profile-control"
            data-utility-slot="user-profile"
            className="relative flex shrink-0"
          >
            <button
              type="button"
              onClick={() => {
                setShowNavMenu(false);
                toggleHeaderPopup('user');
              }}
              aria-label="User Profile"
              id="header-user-avatar-btn"
              className="flex h-9 w-9 overflow-hidden rounded-full border-2 border-white bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08)] ring-[3px] ring-[#f4f4f1] ring-offset-0 active:scale-[0.98] sm:h-12 sm:w-12"
              style={{
                background: 'linear-gradient(135deg, #ffb960 0%, #ff7a1a 25%, #1f9eff 50%, #6d5ef8 75%, #ff5ca8 100%)',
              }}
            >
              <img
                src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=160&h=160&q=80"
                alt="User Avatar"
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover rounded-full border-2 border-white"
              />
            </button>

            {showUserMenu && (
              <div className="absolute right-0 top-14 w-60 rounded-2xl border border-black/[0.08] bg-white/95 p-3 shadow-[0_16px_40px_-6px_rgba(0,0,0,0.18)] backdrop-blur-md z-50">
                <div className="flex items-center gap-2.5 border-b border-black/[0.06] pb-2.5">
                  <div className="h-9 w-9 overflow-hidden rounded-full bg-gray-100">
                    <img
                      src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=160&h=160&q=80"
                      alt="User Profile"
                      referrerPolicy="no-referrer"
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-[#111111]">{user?.full_name || user?.username || 'Workspace Owner'}</div>
                    <div className="text-[11px] text-[#777777]">{user?.email || 'owner@zentra.io'}</div>
                  </div>
                </div>
                <div className="mt-2 space-y-0.5 text-xs text-[#333333]">
                  <div className="cursor-pointer rounded-lg px-2 py-1.5 hover:bg-black/[0.04]">Workspace Settings</div>
                  <div className="cursor-pointer rounded-lg px-2 py-1.5 hover:bg-black/[0.04]">API Keys & Webhooks</div>
                  <button
                    type="button"
                    onClick={() => {
                      setShowUserMenu(false);
                      onSignOut?.();
                    }}
                    className="w-full rounded-lg px-2 py-1.5 text-left text-red-600 hover:bg-black/[0.04]"
                  >
                    Sign out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      {showNavMenu && (
        <div 
          id="header-mobile-drawer"
          data-slot="mobile-navigation-drawer"
          className="absolute left-0 top-[calc(100%+0.75rem)] z-[9999] w-64 rounded-[20px] border border-black/[0.08] bg-white/95 p-2.5 shadow-[0_20px_42px_-18px_rgba(0,0,0,0.28)] backdrop-blur-md md:block xl:hidden"
        >
          <div className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#7A7A7A]">Navigation</div>
          <div className="relative space-y-1.5 px-1 py-0.5">
            <div
              className="absolute left-0 rounded-[12px] bg-[#171717] shadow-[0_8px_18px_rgba(17,17,17,0.16)] transition-[left,top,width,height,transform] duration-300 ease-out"
              style={{
                left: `${menuSelectorStyle.left + 4}px`,
                top: `${menuSelectorStyle.top}px`,
                width: `${Math.max(menuSelectorStyle.width - 8, 0)}px`,
                height: `${menuSelectorStyle.height}px`,
              }}
            />
            {navItems.map((item, index) => (
              <button
                key={item}
                type="button"
                ref={(element) => {
                  menuButtonRefs.current[index] = element;
                }}
                onClick={() => {
                  handleTabClick(item);
                  setShowNavMenu(false);
                }}
                className={`relative z-10 flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left text-sm transition-all duration-300 ${
                  currentTab === item ? 'text-white' : 'text-[#333333] hover:bg-black/[0.04]'
                }`}
              >
                <span>{item}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </header>
  );
};
