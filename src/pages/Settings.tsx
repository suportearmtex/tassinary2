import React, { useState, useEffect } from 'react';
import { Calendar, Bell, Smartphone, Loader2, AlertCircle } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import toast from 'react-hot-toast';

function Settings() {
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDisconnectModalOpen, setIsDisconnectModalOpen] = useState(false);
  const user = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();

  const { data: googleToken, isLoading: isLoadingToken } = useQuery({
    queryKey: ['google-token', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_google_tokens')
        .select('*')
        .eq('user_id', user?.id)
        .limit(1);

      if (error) throw error;
      return data?.[0] || null;
    },
    enabled: !!user?.id,
  });

  const disconnectGoogleMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('user_google_tokens')
        .delete()
        .eq('user_id', user?.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['google-token', user?.id] });
      setIsDisconnectModalOpen(false);
      toast.success('Google Calendar desconectado com sucesso!');
    },
    onError: () => {
      setIsDisconnectModalOpen(false);
      toast.error('Erro ao desconectar Google Calendar');
    },
  });

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data === 'google-calendar-connected') {
        setIsConnecting(false);
        queryClient.invalidateQueries({ queryKey: ['google-token', user?.id] });
        toast.success('Google Calendar conectado com sucesso!');
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [queryClient, user?.id]);

  const handleGoogleConnect = async () => {
    try {
      setIsConnecting(true);
      
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Usuário não autenticado');
      }

      // URL com API key
      const redirectUri = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-oauth-callback`;
      const scope = encodeURIComponent('https://www.googleapis.com/auth/calendar');
      const state = session.access_token;

      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth` +
        `?client_id=${encodeURIComponent(import.meta.env.VITE_GOOGLE_CLIENT_ID)}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&response_type=code` +
        `&scope=${scope}` +
        `&access_type=offline` +
        `&prompt=consent` +
        `&state=${encodeURIComponent(state)}`;

      const width = 600;
      const height = 700;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;

      window.open(
        authUrl,
        'google-oauth',
        `width=${width},height=${height},left=${left},top=${top}`
      );

    } catch (error) {
      console.error('Error starting OAuth flow:', error);
      setIsConnecting(false);
      toast.error('Erro ao iniciar processo de conexão');
    }
  };

  const handleGoogleDisconnect = () => {
    setIsDisconnectModalOpen(true);
  };

  const confirmDisconnect = () => {
    disconnectGoogleMutation.mutate();
  };

  return (
    <div className="p-6">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
        <div className="p-6 border-b border-gray-100 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Configurações</h2>
        </div>
        <div className="divide-y divide-gray-100 dark:divide-gray-700">
          {/* Google Calendar Integration */}
          <div className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Calendar className="w-8 h-8 text-blue-600" />
                <div>
                  <h3 className="text-sm font-medium text-gray-900 dark:text-white">
                    Google Calendar
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Sincronize seus agendamentos com o Google Calendar
                  </p>
                  {googleToken && (
                    <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                      ✓ Conectado e sincronizando
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3">
                {isLoadingToken ? (
                  <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
                ) : googleToken ? (
                  <button
                    onClick={handleGoogleDisconnect}
                    disabled={disconnectGoogleMutation.isPending}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    {disconnectGoogleMutation.isPending && (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    )}
                    Desconectar
                  </button>
                ) : (
                  <button
                    onClick={handleGoogleConnect}
                    disabled={isConnecting}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    {isConnecting && <Loader2 className="w-4 h-4 animate-spin" />}
                    {isConnecting ? 'Conectando...' : 'Conectar'}
                  </button>
                )}
              </div>
            </div>
            
            {/* Status e informações adicionais */}
            {isConnecting && (
              <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
                  <p className="text-sm text-blue-800 dark:text-blue-200">
                    Aguardando autorização do Google Calendar...
                  </p>
                </div>
                <p className="text-xs text-blue-600 dark:text-blue-300 mt-1">
                  Uma nova janela foi aberta. Complete a autorização e retorne aqui.
                </p>
              </div>
            )}
          </div>

          {/* Notification Settings */}
          <div className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Bell className="w-8 h-8 text-yellow-600" />
                <div>
                  <h3 className="text-sm font-medium text-gray-900 dark:text-white">
                    Notificações
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Configure suas preferências de notificação
                  </p>
                </div>
              </div>
              <button className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                Configurar
              </button>
            </div>
          </div>

          {/* WhatsApp Settings */}
          <div className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Smartphone className="w-8 h-8 text-green-600" />
                <div>
                  <h3 className="text-sm font-medium text-gray-900 dark:text-white">
                    WhatsApp
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Gerencie suas configurações do WhatsApp
                  </p>
                </div>
              </div>
              <button 
                onClick={() => window.location.href = '/whatsapp'}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Configurar
              </button>
            </div>
          </div>

          {/* Debug Information (apenas em desenvolvimento) */}
          {import.meta.env.DEV && (
            <div className="p-6 bg-gray-50 dark:bg-gray-900">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-gray-400 mt-0.5" />
                <div>
                  <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Informações de Debug
                  </h4>
                  <div className="mt-2 text-xs text-gray-500 dark:text-gray-400 space-y-1">
                    <p>User ID: {user?.id || 'N/A'}</p>
                    <p>Google Client ID: {import.meta.env.VITE_GOOGLE_CLIENT_ID ? '✓ Configurado' : '✗ Não configurado'}</p>
                    <p>Supabase URL: {import.meta.env.VITE_SUPABASE_URL ? '✓ Configurado' : '✗ Não configurado'}</p>
                    <p>Token Google: {googleToken ? '✓ Existe' : '✗ Não existe'}</p>
                    <p>Callback URL: {`${import.meta.env.VITE_SUPABASE_URL}/rest/v1/rpc/handle_google_oauth`}</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Disconnect Confirmation Modal */}
      {isDisconnectModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-sm">
            <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
              Confirmar Desconexão
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Tem certeza que deseja desconectar o Google Calendar? Seus agendamentos não serão mais sincronizados automaticamente.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setIsDisconnectModalOpen(false)}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Cancelar
              </button>
              <button
                onClick={confirmDisconnect}
                disabled={disconnectGoogleMutation.isPending}
                className="px-4 py-2 bg-red-600 text-white rounded-md text-sm font-medium hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
              >
                {disconnectGoogleMutation.isPending && (
                  <Loader2 className="w-4 h-4 animate-spin" />
                )}
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Settings;