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
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useThemeStore } from '../store/themeStore';

interface LayoutProps {
  children: ReactNode;
}

function Layout({ children }: LayoutProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true); // Desktop: expanded by default
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false); // Collapsed state for desktop
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false); // Mobile menu state
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

  // Handle responsive behavior
  React.useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1024) {
        setIsSidebarOpen(false);
        setIsMobileMenuOpen(false);
      } else {
        setIsSidebarOpen(true);
        setIsMobileMenuOpen(false);
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleLogout = () => {
    setIsLogoutModalOpen(true);
  };

  const confirmLogout = async () => {
    await signOut();
    setIsLogoutModalOpen(false);
  };

  const handleNavigation = (path: string) => {
    navigate(path);
    // Close mobile menu after navigation
    if (window.innerWidth < 1024) {
      setIsMobileMenuOpen(false);
    }
  };

  const toggleSidebar = () => {
    if (window.innerWidth >= 1024) {
      // Desktop: toggle collapsed state
      setIsSidebarCollapsed(!isSidebarCollapsed);
    } else {
      // Mobile: toggle mobile menu
      setIsMobileMenuOpen(!isMobileMenuOpen);
    }
  };

  const sidebarWidth = isSidebarCollapsed ? 'w-16' : 'w-64';
  const isCollapsed = isSidebarCollapsed && window.innerWidth >= 1024;

  return (
    <div className={`min-h-screen ${isDarkMode ? 'dark bg-gray-900' : 'bg-gray-50'} transition-colors duration-200`}>
      {/* Mobile Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow-sm fixed w-full z-30 transition-colors duration-200">
        <div className="flex items-center justify-between px-3 sm:px-4 py-3">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button
              onClick={toggleSidebar}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors duration-200 flex-shrink-0"
              aria-label={window.innerWidth >= 1024 ? (isSidebarCollapsed ? 'Expandir menu' : 'Recolher menu') : (isMobileMenuOpen ? 'Fechar menu' : 'Abrir menu')}
            >
              {window.innerWidth >= 1024 ? (
                isSidebarCollapsed ? (
                  <ChevronRight className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                ) : (
                  <ChevronLeft className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                )
              ) : (
                isMobileMenuOpen ? (
                  <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                ) : (
                  <Menu className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                )
              )}
            </button>
            <h1 className="text-lg sm:text-xl font-semibold text-gray-800 dark:text-white truncate">
              Agenda Pro
            </h1>
          </div>
          
          <div className="flex items-center gap-2 sm:gap-4">
            <button
              onClick={toggleTheme}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors duration-200"
              aria-label={isDarkMode ? 'Ativar modo claro' : 'Ativar modo escuro'}
            >
              {isDarkMode ? (
                <Sun className="w-5 h-5 text-gray-500 dark:text-gray-400" />
              ) : (
                <Moon className="w-5 h-5 text-gray-500" />
              )}
            </button>
            
            <button 
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full relative transition-colors duration-200 hidden sm:block"
              aria-label="Notificações"
            >
              <Bell className="w-5 h-5 text-gray-500 dark:text-gray-400" />
              <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
            </button>
            
            <div className="hidden sm:flex items-center gap-2">
              <img
                src="https://images.pexels.com/photos/614810/pexels-photo-614810.jpeg"
                alt="Profile"
                className="w-8 h-8 rounded-full object-cover"
              />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300 hidden md:block max-w-32 truncate">
                {user?.email}
              </span>
              <ChevronDown className="w-4 h-4 text-gray-500 dark:text-gray-400 hidden md:block" />
            </div>
            
            <button 
              onClick={handleLogout}
              className="p-2 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full transition-colors duration-200"
              aria-label="Sair do sistema"
            >
              <LogOut className="w-5 h-5 text-red-500" />
            </button>
          </div>
        </div>
      </header>

      {/* Sidebar */}
      <aside
        className={`fixed left-0 top-[57px] h-[calc(100vh-57px)] bg-white dark:bg-gray-800 shadow-sm transition-all duration-300 ease-in-out z-50 ${
          // Mobile behavior
          window.innerWidth < 1024 
            ? (isMobileMenuOpen ? 'translate-x-0 w-64' : '-translate-x-full w-64')
            // Desktop behavior
            : `translate-x-0 ${sidebarWidth}`
        }`}
        style={{ zIndex: 999 }}
      >
        <nav className="p-4 space-y-1" role="navigation" aria-label="Menu principal">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.id;
            
            return (
              <div key={item.id} className="relative group">
                <button
                  onClick={() => handleNavigation(item.id)}
                  className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 shadow-sm'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-gray-200'
                  } ${isCollapsed ? 'justify-center px-3' : ''}`}
                  aria-label={isCollapsed ? item.label : undefined}
                  title={isCollapsed ? item.label : undefined}
                >
                  <Icon className={`flex-shrink-0 transition-transform duration-200 ${
                    isActive ? 'scale-110' : 'group-hover:scale-105'
                  } ${isCollapsed ? 'w-6 h-6' : 'w-5 h-5'}`} />
                  
                  {/* Label with smooth transition */}
                  <span className={`transition-all duration-300 ease-in-out overflow-hidden whitespace-nowrap ${
                    isCollapsed ? 'w-0 opacity-0' : 'w-auto opacity-100'
                  }`}>
                    {item.label}
                  </span>
                </button>

                {/* Tooltip for collapsed state */}
                {isCollapsed && (
                  <div className="absolute left-full top-1/2 transform -translate-y-1/2 ml-2 px-3 py-2 bg-gray-900 dark:bg-gray-700 text-white text-sm rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 pointer-events-none z-50 whitespace-nowrap">
                    {item.label}
                    <div className="absolute top-1/2 left-0 transform -translate-y-1/2 -translate-x-1 w-2 h-2 bg-gray-900 dark:bg-gray-700 rotate-45"></div>
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Sidebar Footer - User Info (only when expanded) */}
        {!isCollapsed && (
          <div className="absolute bottom-4 left-4 right-4 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg transition-all duration-300">
            <div className="flex items-center gap-3">
              <img
                src="https://images.pexels.com/photos/614810/pexels-photo-614810.jpeg"
                alt="Profile"
                className="w-8 h-8 rounded-full object-cover flex-shrink-0"
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                  {user?.email?.split('@')[0] || 'Usuário'}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Online
                </p>
              </div>
            </div>
          </div>
        )}
      </aside>

      {/* Main Content */}
      <main
        className={`pt-[73px] min-h-screen transition-all duration-300 ease-in-out ${
          window.innerWidth >= 1024 
            ? (isSidebarCollapsed ? 'lg:ml-16' : 'lg:ml-64')
            : 'ml-0'
        }`}
      >
        <div className="px-4 sm:px-6">
          {children}
        </div>
      </main>

      {/* Logout Confirmation Modal */}
      {isLogoutModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-sm transition-colors duration-200">
            <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
              Confirmar Logout
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Tem certeza que deseja sair do sistema?
            </p>
            <div className="flex flex-col sm:flex-row justify-end gap-3">
              <button
                onClick={() => setIsLogoutModalOpen(false)}
                className="w-full sm:w-auto px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors duration-200"
              >
                Cancelar
              </button>
              <button
                onClick={confirmLogout}
                className="w-full sm:w-auto px-4 py-2 bg-red-600 text-white rounded-md text-sm font-medium hover:bg-red-700 transition-colors duration-200"
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