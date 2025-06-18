import { useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

interface SecurityConfig {
  sessionTimeout: number; // em minutos
  maxIdleTime: number; // em minutos
  requireReauth: boolean;
}

const DEFAULT_CONFIG: SecurityConfig = {
  sessionTimeout: 120, // 2 horas
  maxIdleTime: 30, // 30 minutos
  requireReauth: true,
};

export function useAdminSecurity(config: Partial<SecurityConfig> = {}) {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  const user = useAuthStore((state) => state.user);
  const signOut = useAuthStore((state) => state.signOut);

  // Verificar se o usuário é admin
  const { data: isAdmin } = useQuery({
    queryKey: ['is-admin', user?.id],
    queryFn: async () => {
      if (!user?.id) return false;
      
      const { data, error } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single();

      if (error) return false;
      return data.role === 'admin';
    },
    enabled: !!user?.id,
  });

  useEffect(() => {
    if (!isAdmin) return;

    let sessionTimer: NodeJS.Timeout;
    let idleTimer: NodeJS.Timeout;
    let lastActivity = Date.now();

    // Função para resetar o timer de inatividade
    const resetIdleTimer = () => {
      lastActivity = Date.now();
      clearTimeout(idleTimer);
      
      idleTimer = setTimeout(() => {
        signOut();
        alert('Sessão expirada por inatividade. Faça login novamente.');
      }, finalConfig.maxIdleTime * 60 * 1000);
    };

    // Função para verificar timeout da sessão
    const checkSessionTimeout = () => {
      const sessionStart = localStorage.getItem('admin_session_start');
      if (sessionStart) {
        const elapsed = Date.now() - parseInt(sessionStart);
        if (elapsed > finalConfig.sessionTimeout * 60 * 1000) {
          signOut();
          alert('Sessão administrativa expirada. Faça login novamente.');
          return;
        }
      } else {
        localStorage.setItem('admin_session_start', Date.now().toString());
      }

      sessionTimer = setTimeout(checkSessionTimeout, 60 * 1000); // Verificar a cada minuto
    };

    // Eventos para detectar atividade do usuário
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
    
    const activityHandler = () => resetIdleTimer();
    
    events.forEach(event => {
      document.addEventListener(event, activityHandler, true);
    });

    // Iniciar timers
    resetIdleTimer();
    checkSessionTimeout();

    // Cleanup
    return () => {
      clearTimeout(sessionTimer);
      clearTimeout(idleTimer);
      events.forEach(event => {
        document.removeEventListener(event, activityHandler, true);
      });
    };
  }, [isAdmin, finalConfig, signOut]);

  // Função para registrar ação administrativa
  const logAdminAction = async (action: string, details: any = {}) => {
    if (!isAdmin || !user?.id) return;

    try {
      await supabase.rpc('log_admin_action', {
        admin_id: user.id,
        target_id: details.targetUserId || user.id,
        action_type: action,
        action_details: {
          ...details,
          timestamp: new Date().toISOString(),
          user_agent: navigator.userAgent,
        },
      });
    } catch (error) {
      console.error('Failed to log admin action:', error);
    }
  };

  // Função para validar ação crítica
  const validateCriticalAction = async (action: string): Promise<boolean> => {
    if (!finalConfig.requireReauth) return true;

    const lastAuth = localStorage.getItem('last_admin_auth');
    const now = Date.now();
    
    // Requer reautenticação se passou mais de 15 minutos da última validação
    if (!lastAuth || (now - parseInt(lastAuth)) > 15 * 60 * 1000) {
      const password = prompt('Por favor, confirme sua senha para continuar com esta ação:');
      if (!password) return false;

      try {
        // Verificar senha atual
        const { error } = await supabase.auth.signInWithPassword({
          email: user?.email || '',
          password,
        });

        if (error) {
          alert('Senha incorreta. Ação cancelada.');
          return false;
        }

        localStorage.setItem('last_admin_auth', now.toString());
        await logAdminAction('critical_action_validated', { action });
        return true;
      } catch (error) {
        alert('Erro na validação. Ação cancelada.');
        return false;
      }
    }

    return true;
  };

  return {
    isAdmin: !!isAdmin,
    logAdminAction,
    validateCriticalAction,
  };
}