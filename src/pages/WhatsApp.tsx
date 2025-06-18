import React, { useEffect, useState } from 'react';
import { QrCode, RefreshCw, Smartphone, Loader2, Save, Plus, Trash2 } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { MessageTemplate, EvolutionInstance } from '../lib/types';
import toast from 'react-hot-toast';

const messageTypes = {
  confirmation: 'Confirmação',
  reminder_24h: 'Lembrete 24h',
  reminder_1h: 'Lembrete 1h',
  cancellation: 'Cancelamento',
};

const variablesList = [
  { name: '{name}', description: 'Nome do cliente' },
  { name: '{email}', description: 'Email do cliente' },
  { name: '{date}', description: 'Data do agendamento' },
  { name: '{service}', description: 'Nome do serviço' },
  { name: '{time}', description: 'Horário do agendamento' },
];

function WhatsApp() {
  const [editingTemplate, setEditingTemplate] = useState<MessageTemplate | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: instance, isLoading: isLoadingInstance, error: instanceError, refetch } = useQuery({
    queryKey: ['evolution-instance'],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No session');

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/evolution-api`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        throw new Error('Failed to fetch Evolution instance');
      }

      return response.json() as Promise<EvolutionInstance>;
    },
    refetchInterval: (data) => {
      if (data && data.status !== 'connected') {
        return 5000;
      }
      return 30000;
    },
  });

  const createInstanceMutation = useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No session');

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/evolution-api`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to create instance');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['evolution-instance'] });
      setIsCreateModalOpen(false);
      toast.success('Configuração criada com sucesso!');
    },
    onError: () => {
      toast.error('Erro ao criar configuração');
    },
  });

  const refreshQrCodeMutation = useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No session');

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/evolution-api`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to refresh QR code');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['evolution-instance'] });
      toast.success('QR Code atualizado com sucesso!');
    },
    onError: () => {
      toast.error('Erro ao atualizar QR Code');
    },
  });

  const deleteInstanceMutation = useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No session');

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/evolution-api`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to delete instance');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['evolution-instance'] });
      setIsDeleteModalOpen(false);
      toast.success('Configuração excluída com sucesso!');
    },
    onError: () => {
      setIsDeleteModalOpen(false);
      toast.error('Erro ao excluir configuração');
    },
  });

  const { data: templates, isLoading: isLoadingTemplates } = useQuery({
    queryKey: ['message-templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('message_templates')
        .select('*')
        .order('type');

      if (error) throw error;
      return data as MessageTemplate[];
    },
  });

  const updateTemplateMutation = useMutation({
    mutationFn: async (template: MessageTemplate) => {
      const { data, error } = await supabase
        .from('message_templates')
        .update({ content: template.content })
        .eq('id', template.id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['message-templates'] });
      setEditingTemplate(null);
      toast.success('Modelo de mensagem atualizado com sucesso!');
    },
    onError: () => {
      toast.error('Erro ao atualizar modelo de mensagem');
    },
  });

  useEffect(() => {
    if (instanceError) {
      if (instanceError instanceof Error && instanceError.message === 'Instance not found') {
        if (instance) {
          deleteInstanceMutation.mutate();
        }
      } else {
        toast.error('Erro ao carregar configuração do WhatsApp');
      }
    }
  }, [instanceError, instance]);

  const handleCreateInstance = () => {
    createInstanceMutation.mutate();
  };

  const handleRefreshQrCode = () => {
    refreshQrCodeMutation.mutate();
  };

  const handleDeleteInstance = () => {
    deleteInstanceMutation.mutate();
  };

  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingTemplate) {
      await updateTemplateMutation.mutateAsync(editingTemplate);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'connected':
        return 'text-green-500';
      case 'disconnected':
        return 'text-red-500';
      case 'connecting':
        return 'text-yellow-500';
      default:
        return 'text-gray-500';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'connected':
        return 'Dispositivo conectado';
      case 'disconnected':
        return 'Dispositivo desconectado';
      case 'connecting':
        return 'Conectando...';
      default:
        return 'Status desconhecido';
    }
  };

  const renderQrCodeSection = () => {
    if (isLoadingInstance || refreshQrCodeMutation.isPending) {
      return <Loader2 className="w-12 h-12 text-gray-400 animate-spin" />;
    }

    if (!instance) {
      return <QrCode className="w-48 h-48 text-gray-400" />;
    }

    if (instance.status === 'connected') {
      return (
        <div className="flex flex-col items-center">
          <Smartphone className="w-48 h-48 text-green-500" />
          <p className="text-lg font-medium text-green-500 mt-4">
            WhatsApp conectado com sucesso!
          </p>
        </div>
      );
    }

    if (instance.qr_code) {
      return (
        <img
          src={instance.qr_code}
          alt="WhatsApp QR Code"
          className="w-48 h-48 object-contain"
        />
      );
    }

    return <QrCode className="w-48 h-48 text-gray-400" />;
  };

  const getQrCodeMessage = () => {
    if (isLoadingInstance || refreshQrCodeMutation.isPending) {
      return 'Carregando QR Code...';
    }

    if (!instance) {
      return 'Clique em "Criar Configuração" para começar';
    }

    if (instance.status === 'connected') {
      return 'WhatsApp conectado e pronto para uso';
    }

    if (instance.qr_code) {
      return 'Escaneie o código QR com seu WhatsApp para conectar';
    }

    return 'QR Code não disponível';
  };

  return (
    <div className="p-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* QR Code Section */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Configuração WhatsApp
            </h2>
            <div className="flex items-center gap-2">
              {instance ? (
                <>
                  {instance.status !== 'connected' && (
                    <button
                      onClick={handleRefreshQrCode}
                      disabled={isLoadingInstance || refreshQrCodeMutation.isPending}
                      className="flex items-center gap-2 px-4 py-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                    >
                      <RefreshCw className={`w-4 h-4 ${(isLoadingInstance || refreshQrCodeMutation.isPending) ? 'animate-spin' : ''}`} />
                      Atualizar QR
                    </button>
                  )}
                  <button
                    onClick={() => setIsDeleteModalOpen(true)}
                    className="flex items-center gap-2 px-4 py-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg text-sm font-medium transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    Excluir Configuração
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setIsCreateModalOpen(true)}
                  disabled={createInstanceMutation.isPending}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  <Plus className="w-4 h-4" />
                  Criar Configuração
                </button>
              )}
            </div>
          </div>
          <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-lg">
            {renderQrCodeSection()}
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center mt-4">
              {getQrCodeMessage()}
            </p>
          </div>
          {instance && (
            <div className="mt-6 flex items-center justify-center gap-2 text-sm">
              <Smartphone className={`w-4 h-4 ${getStatusColor(instance?.status || 'disconnected')}`} />
              <span className={`font-medium ${getStatusColor(instance?.status || 'disconnected')}`}>
                {getStatusText(instance?.status || 'disconnected')}
              </span>
            </div>
          )}
        </div>

        {/* Messages Section */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">
            Mensagens Automáticas
          </h2>
          {isLoadingTemplates ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
            </div>
          ) : (
            <div className="space-y-4">
              {templates?.map((template) => (
                <div
                  key={template.id}
                  className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg"
                >
                  <h3 className="font-medium text-gray-900 dark:text-white mb-2">
                    {messageTypes[template.type]}
                  </h3>
                  {editingTemplate?.id === template.id ? (
                    <form onSubmit={handleSaveTemplate} className="space-y-4">
                      <textarea
                        value={editingTemplate.content}
                        onChange={(e) =>
                          setEditingTemplate({
                            ...editingTemplate,
                            content: e.target.value,
                          })
                        }
                        className="w-full h-32 p-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
                      />
                      <div className="flex items-center justify-between">
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                          Variáveis disponíveis:
                          <div className="flex flex-wrap gap-2 mt-1">
                            {variablesList.map((variable) => (
                              <span
                                key={variable.name}
                                title={variable.description}
                                className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-xs cursor-help"
                              >
                                {variable.name}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingTemplate(null)}
                            className="px-3 py-1 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md"
                          >
                            Cancelar
                          </button>
                          <button
                            type="submit"
                            disabled={updateTemplateMutation.isPending}
                            className="px-3 py-1 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1"
                          >
                            {updateTemplateMutation.isPending && (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            )}
                            <Save className="w-3 h-3" />
                            Salvar
                          </button>
                        </div>
                      </div>
                    </form>
                  ) : (
                    <>
                      <p className="text-sm text-gray-500 dark:text-gray-400 whitespace-pre-line mb-4">
                        {template.content}
                      </p>
                      <button
                        onClick={() => setEditingTemplate(template)}
                        className="text-blue-600 text-sm font-medium hover:text-blue-800 dark:hover:text-blue-400"
                      >
                        Editar mensagem
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Create Configuration Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-sm">
            <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
              Criar Nova Configuração
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Você está prestes a criar uma nova configuração do WhatsApp. Depois de criar, você poderá conectar seu dispositivo escaneando o QR Code.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreateInstance}
                disabled={createInstanceMutation.isPending}
                className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
              >
                {createInstanceMutation.isPending && (
                  <Loader2 className="w-4 h-4 animate-spin" />
                )}
                Criar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-sm">
            <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
              Confirmar Exclusão
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Tem certeza que deseja excluir esta configuração do WhatsApp? Esta ação não pode ser desfeita.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setIsDeleteModalOpen(false)}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Cancelar
              </button>
              <button
                onClick={handleDeleteInstance}
                disabled={deleteInstanceMutation.isPending}
                className="px-4 py-2 bg-red-600 text-white rounded-md text-sm font-medium hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
              >
                {deleteInstanceMutation.isPending && (
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

export default WhatsApp;