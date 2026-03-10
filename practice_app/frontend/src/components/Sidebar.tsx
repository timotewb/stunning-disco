import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Grid3X3,
  CalendarRange,
  BarChart3,
  NotebookPen,
  Settings,
} from 'lucide-react';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/team', icon: Users, label: 'Team' },
  { to: '/matrices', icon: Grid3X3, label: 'Matrices' },
  { to: '/timeline', icon: CalendarRange, label: 'Timeline' },
  { to: '/capabilities', icon: BarChart3, label: 'Capabilities' },
  { to: '/notes', icon: NotebookPen, label: 'Notes' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

const Sidebar: React.FC = () => {
  return (
    <aside className="w-56 bg-white border-r border-gray-200 flex flex-col py-6 flex-shrink-0">
      <div className="px-5 mb-8">
        <h1 className="text-lg font-bold text-indigo-600 tracking-tight">kaimahi</h1>
      </div>
      <nav className="flex-1 space-y-1 px-3">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-indigo-50 text-indigo-600'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
};

export default Sidebar;
