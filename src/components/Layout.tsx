import React, { useState, ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Bell,
  Calendar,
  ChevronDown,
  LogOut,
  Menu,
  MessageSquare,
  Settings,
  Users,
  DollarSign,
  X,
  Sun,
  Moon,
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useThemeStore } from '../store/themeStore';

interface LayoutProps {
  children: ReactNode;
}

function Layout({ children }: LayoutProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const signOut = useAuthStore((state) => state.signOut);
  const user = useAuthStore((state) => state.user);
  const { isDarkMode, toggleTheme } = useThemeStore();

  const navItems = [
    { id: '/', label: 'Dashboard', icon: Calendar },
    { id: '/appointments', label: 'Agendamentos', icon: Calendar },
    { id: '/clients', label: 'Clientes', icon: Users },
    { id: '/services', label: 'Serviços', icon: DollarSign },
    { id: '/whatsapp', label: 'WhatsApp', icon: MessageSquare },
    { id: '/settings', label: 'Configurações', icon: Settings },
  ];

  React.useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
  }, [isDarkMode]);

  const handleLogout = () => {
    setIsLogoutModalOpen(true);
  };

  const confirmLogout = async () => {
    await signOut();
    setIsLogoutModalOpen(false);
  };

  return (
    <div className={`min-h-screen ${isDarkMode ? 'dark bg-gray-900' : 'bg-gray-50'}`}>
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow-sm fixed w-full z-10">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
            >
              {isSidebarOpen ? (
                <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
              ) : (
                <Menu className="w-5 h-5 text-gray-500 dark:text-gray-400" />
              )}
            </button>
            <h1 className="text-xl font-semibold text-gray-800 dark:text-white">Agenda Pro</h1>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={toggleTheme}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full"
            >
              {isDarkMode ? (
                <Sun className="w-5 h-5 text-gray-500 dark:text-gray-400" />
              ) : (
                <Moon className="w-5 h-5 text-gray-500" />
              )}
            </button>
            <button className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full relative">
              <Bell className="w-5 h-5 text-gray-500 dark:text-gray-400" />
              <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
            </button>
            <div className="flex items-center gap-2">
              <img
                src="https://images.pexels.com/photos/614810/pexels-photo-614810.jpeg"
                alt="Profile"
                className="w-8 h-8 rounded-full object-cover"
              />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{user?.email}</span>
              <ChevronDown className="w-4 h-4 text-gray-500 dark:text-gray-400" />
            </div>
            <button 
              onClick={handleLogout}
              className="p-2 hover:bg-red-50 dark:hover:bg-red-900 rounded-full"
            >
              <LogOut className="w-5 h-5 text-red-500" />
            </button>
          </div>
        </div>
      </header>

      {/* Sidebar */}
      <aside
        className={`fixed left-0 top-[57px] h-[calc(100vh-57px)] bg-white dark:bg-gray-800 shadow-sm transition-all duration-300 ${
          isSidebarOpen ? 'w-64' : 'w-16'
        }`}
      >
        <nav className="p-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => navigate(item.id)}
                title={!isSidebarOpen ? item.label : undefined}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  location.pathname === item.id
                    ? 'bg-blue-50 dark:bg-blue-900 text-blue-600 dark:text-blue-300'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                } ${!isSidebarOpen ? 'justify-center' : ''}`}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                {isSidebarOpen && <span>{item.label}</span>}
              </button>
            );
          })}
        </nav>
      </aside>

      {/* Main Content */}
      <main
        className={`pt-[73px] min-h-screen transition-all duration-300 ${
          isSidebarOpen ? 'ml-64' : 'ml-16'
        }`}
      >
        {children}
      </main>

      {/* Logout Confirmation Modal */}
      {isLogoutModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-sm">
            <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
              Confirmar Logout
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Tem certeza que deseja sair do sistema?
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setIsLogoutModalOpen(false)}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Cancelar
              </button>
              <button
                onClick={confirmLogout}
                className="px-4 py-2 bg-red-600 text-white rounded-md text-sm font-medium hover:bg-red-700"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Layout;