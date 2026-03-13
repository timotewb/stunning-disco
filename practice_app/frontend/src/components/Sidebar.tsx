import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Grid3X3,
  CalendarRange,
  Inbox,
  BarChart3,
  NotebookPen,
  Settings,
  ChevronRight,
  ChevronLeft,
} from 'lucide-react';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/team', icon: Users, label: 'Team & Contacts' },
  { to: '/matrices', icon: Grid3X3, label: 'Matrices' },
  { to: '/timeline', icon: CalendarRange, label: 'Timeline' },
  { to: '/requests', icon: Inbox, label: 'Requests' },
  { to: '/capabilities', icon: BarChart3, label: 'Capabilities' },
  { to: '/notes', icon: NotebookPen, label: 'Notes' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ isOpen, onToggle }) => {
  return (
    <aside 
      className={`bg-white border-r border-gray-200 flex flex-col py-6 flex-shrink-0 transition-all duration-300 ${
        isOpen ? 'w-56' : 'w-16'
      }`}
    >
      {isOpen ? (
        <>
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
          <div className="px-3 mt-4">
            <button
              onClick={onToggle}
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
              aria-label="Collapse sidebar"
            >
              <ChevronLeft size={18} />
              Collapse
            </button>
          </div>
        </>
      ) : (
        <>
          <nav className="flex-1 space-y-1 px-2">
            {navItems.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  `flex items-center justify-center p-3 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-indigo-50 text-indigo-600'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`
                }
                title={label}
              >
                <Icon size={20} />
              </NavLink>
            ))}
          </nav>
          <div className="px-2 mt-4">
            <button
              onClick={onToggle}
              className="w-full flex items-center justify-center p-3 rounded-lg text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
              aria-label="Expand sidebar"
              title="Expand"
            >
              <ChevronRight size={20} />
            </button>
          </div>
        </>
      )}
    </aside>
  );
};

export default Sidebar;
