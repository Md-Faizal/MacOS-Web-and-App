import React, { useState } from 'react';
import { BrandLogo } from './common/BrandLogo';
import { Search, Bell, X, CheckCircle, ArrowUpRight } from 'lucide-react';

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
  const [searchQuery, setSearchQuery] = useState('');

  const navItems = [
    'Home',
    'Payments',
    'Balances',
    'Customers',
    'Products',
    'Billing',
    'Reports',
    'Connect',
  ];

  const handleTabClick = (tab: string) => {
    setCurrentTab(tab);
    if (onTabChange) {
      onTabChange(tab);
    }
  };

  return (
    <header className="w-full flex items-center justify-between py-1 px-1 select-none relative z-30" id="main-header">
      {/* Left side: Brand Logo + Nav Items */}
      <div className="flex items-center gap-6 lg:gap-8">
        <BrandLogo size={30} />

        {/* Navigation Tabs */}
        <nav className="hidden md:flex items-center gap-1" aria-label="Main Navigation">
          {navItems.map((item) => {
            const isActive = currentTab === item;
            return (
              <button
                key={item}
                type="button"
                onClick={() => handleTabClick(item)}
                id={`nav-item-${item.toLowerCase()}`}
                className={`px-3.5 py-1.5 text-[13.5px] transition-all cursor-pointer ${
                  isActive
                    ? 'bg-[#18181B] text-white rounded-full font-medium shadow-xs'
                    : 'text-[#505050] hover:text-[#111111] hover:bg-black/[0.04] rounded-full font-normal'
                }`}
              >
                {item}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Right side: Search, Notification Bell, User Avatar */}
      <div className="flex items-center gap-2.5">
        {/* Search button */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowSearch(!showSearch)}
            aria-label="Search"
            id="header-search-btn"
            className="w-9 h-9 rounded-full bg-white hover:bg-black/[0.02] border border-black/[0.08] flex items-center justify-center text-[#555555] hover:text-[#111111] transition-all shadow-[0_1px_2px_rgba(0,0,0,0.03)] cursor-pointer active:scale-95"
          >
            <Search className="w-4 h-4 stroke-[2]" />
          </button>

          {/* Search Dropdown */}
          {showSearch && (
            <div className="absolute right-0 top-12 w-80 sm:w-96 bg-white/95 backdrop-blur-md rounded-2xl shadow-[0_16px_40px_-6px_rgba(0,0,0,0.18)] border border-black/[0.08] p-3 z-50 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center gap-2 border-b border-black/[0.06] pb-2 px-1">
                <Search className="w-4 h-4 text-[#888888]" />
                <input
                  type="text"
                  placeholder="Search payments, customers, metrics..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  autoFocus
                  className="w-full text-sm bg-transparent outline-none text-[#111111] placeholder:text-[#999999]"
                />
                <button onClick={() => setShowSearch(false)} className="text-[#888888] hover:text-[#111111]">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="mt-2 space-y-1">
                <div className="text-[11px] font-semibold uppercase text-[#888888] px-2 py-1">Quick Links</div>
                {['Successful Payments (48.6k)', 'Gross Volume ($41,540)', 'Retention Report (42%)', 'Top Customer Accounts'].map((item, idx) => (
                  <div
                    key={idx}
                    onClick={() => setShowSearch(false)}
                    className="px-2.5 py-1.5 text-xs text-[#333333] hover:bg-[#F3F3F2] rounded-lg cursor-pointer flex items-center justify-between"
                  >
                    <span>{item}</span>
                    <ArrowUpRight className="w-3 h-3 text-[#999999]" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Notifications button */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowNotifications(!showNotifications)}
            aria-label="Notifications"
            id="header-notifications-btn"
            className="w-9 h-9 rounded-full bg-white hover:bg-black/[0.02] border border-black/[0.08] flex items-center justify-center text-[#555555] hover:text-[#111111] transition-all shadow-[0_1px_2px_rgba(0,0,0,0.03)] relative cursor-pointer active:scale-95"
          >
            <Bell className="w-4 h-4 stroke-[2]" />
            {/* Red notification dot */}
            <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-[#FF453A] ring-1.5 ring-white" />
          </button>

          {/* Notifications dropdown */}
          {showNotifications && (
            <div className="absolute right-0 top-12 w-80 bg-white/95 backdrop-blur-md rounded-2xl shadow-[0_16px_40px_-6px_rgba(0,0,0,0.18)] border border-black/[0.08] p-3 z-50 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between pb-2 border-b border-black/[0.06] px-1">
                <span className="font-semibold text-xs text-[#111111]">Notifications (2 new)</span>
                <button onClick={() => setShowNotifications(false)} className="text-[#888888] hover:text-[#111111]">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="mt-2 space-y-2">
                <div className="p-2.5 rounded-xl bg-blue-50/60 border border-blue-100/80 text-xs">
                  <div className="font-medium text-blue-900 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span>
                    Authorization rate +4%
                  </div>
                  <div className="text-blue-700/80 mt-0.5 text-[11.5px]">Projected to recover $12,400 this week.</div>
                </div>
                <div className="p-2.5 rounded-xl bg-emerald-50/60 border border-emerald-100/80 text-xs">
                  <div className="font-medium text-emerald-900 flex items-center gap-1.5">
                    <CheckCircle className="w-3 h-3 text-emerald-600" />
                    Payout of $38.3k initiated
                  </div>
                  <div className="text-emerald-700/80 mt-0.5 text-[11.5px]">Transferred to 1,284 merchant accounts.</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* User Profile Avatar */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowUserMenu(!showUserMenu)}
            aria-label="User Profile"
            id="header-user-avatar-btn"
            className="w-9 h-9 rounded-full overflow-hidden border-2 border-white ring-1 ring-black/10 hover:ring-black/20 transition-all shadow-[0_1px_3px_rgba(0,0,0,0.08)] cursor-pointer"
          >
            <img
              src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=160&h=160&q=80"
              alt="User Avatar"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
          </button>

          {/* User Profile menu */}
          {showUserMenu && (
            <div className="absolute right-0 top-12 w-60 bg-white/95 backdrop-blur-md rounded-2xl shadow-[0_16px_40px_-6px_rgba(0,0,0,0.18)] border border-black/[0.08] p-3 z-50 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center gap-2.5 pb-2.5 border-b border-black/[0.06]">
                <div className="w-9 h-9 rounded-full overflow-hidden bg-gray-100">
                  <img
                    src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=160&h=160&q=80"
                    alt="User Profile"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div>
                  <div className="text-xs font-semibold text-[#111111]">{user?.full_name || user?.username || 'Workspace Owner'}</div>
                  <div className="text-[11px] text-[#777777]">{user?.email || 'owner@zentra.io'}</div>
                </div>
              </div>
              <div className="mt-2 space-y-0.5 text-xs text-[#333333]">
                <div className="px-2 py-1.5 rounded-lg hover:bg-black/[0.04] cursor-pointer">Workspace Settings</div>
                <div className="px-2 py-1.5 rounded-lg hover:bg-black/[0.04] cursor-pointer">API Keys & Webhooks</div>
                <button
                  type="button"
                  onClick={() => {
                    setShowUserMenu(false);
                    onSignOut?.();
                  }}
                  className="w-full rounded-lg px-2 py-1.5 text-left text-red-600 hover:bg-black/[0.04] cursor-pointer"
                >
                  Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
