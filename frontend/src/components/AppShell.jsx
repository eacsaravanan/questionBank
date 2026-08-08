import React from 'react';
import { NavLink, useNavigate, Link } from 'react-router-dom';
import { LogOut, UserCircle2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';

export default function AppShell({ title, navItems, children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex bg-paper">
      <aside className="w-64 shrink-0 bg-ink-900 text-paper flex flex-col">
        <div className="px-6 py-6 border-b border-white/10">
          <div className="flex items-center gap-2">
            <img src="/dturn-logo.png" alt="dturn" className="h-6 w-auto" />
            <span className="font-display font-bold text-lg tracking-tight">dturn Question Bank</span>
          </div>
          <p className="text-xs text-white/50 mt-1 font-mono">{title}</p>
        </div>

        <nav className="flex-1 py-4">
          {navItems.map((item, idx) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-6 py-3 text-sm border-l-2 transition-colors ${
                  isActive
                    ? 'border-gold-500 bg-white/5 text-white font-medium'
                    : 'border-transparent text-white/60 hover:text-white hover:bg-white/5'
                }`
              }
              style={{ paddingLeft: `${24 + (item.depth || 0) * 12}px` }}
            >
              <item.icon size={17} />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="px-6 py-4 border-t border-white/10">
          <p className="text-sm font-medium truncate">{user?.fullName}</p>
          <p className="text-xs text-white/50 truncate">{user?.roles?.join(', ')}</p>
          <Link
            to="/profile"
            className="mt-3 flex items-center gap-2 text-xs text-white/60 hover:text-gold-400 transition-colors"
          >
            <UserCircle2 size={14} /> My Profile
          </Link>
          <button
            onClick={async () => { await logout(); navigate('/login'); }}
            className="mt-2 flex items-center gap-2 text-xs text-white/60 hover:text-gold-400 transition-colors"
          >
            <LogOut size={14} /> Sign out
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
