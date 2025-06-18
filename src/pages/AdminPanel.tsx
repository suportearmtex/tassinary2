import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Shield, 
  Key, 
  Search, 
  Filter, 
  MoreVertical, 
  Edit2, 
  Trash2, 
  RefreshCw,
  Eye,
  EyeOff,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  Download,
  Calendar
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

interface AdminUser {
  id: string;
  email: string;
  full_name: string | null;
  role: 'admin' | 'professional' | 'receptionist';
  created_at: string;
  updated_at: string;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
}

interface AdminLog {
  id: string;
  admin_user_id: string;
  target_user_id: string;
  action: string;
  details: any;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  admin_user: { email: string; full_name: string | null };
  target_user: { email: string; full_name: string | null };
}

interface PasswordResetForm {
  userId: string;
  newPassword: string;
  confirmPassword: string;
}

function AdminPanel() {
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isLogsModalOpen, setIsLogsModalOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [passwordForm, setPasswordForm] = useState<PasswordResetForm>({
    userId: '',
    newPassword: '',
    confirmPassword: ''
  });

  const user = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();

  // Verificar se o usuário atual é admin
  const { data: currentUserData } = useQuery({
    queryKey: ['current-user', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('users')
        .select('role')
        .eq('id', user?.id)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  // Buscar todos os usuários (apenas para admins)
  const { data: users, isLoading: isLoadingUsers } = useQuery({
    queryKey: ['admin-users'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('users')
        .select(`
          id,
          email,
          full_name,
          role,
          created_at,
          updated_at
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Buscar dados adicionais do auth.users
      const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers();
      if (authError) throw authError;

      // Combinar dados
      const combinedUsers = data.map(user => {
        const authUser = authUsers.users.find(au => au.id === user.id);
        return {
          ...user,
          last_sign_in_at: authUser?.last_sign_in_at || null,
          email_confirmed_at: authUser?.email_confirmed_at || null,
        };
      });

      return combinedUsers as AdminUser[];
    },
    enabled: currentUserData?.role === 'admin',
  });

  // Buscar logs administrativos
  const { data: adminLogs } = useQuery({
    queryKey: ['admin-logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('admin_logs')
        .select(`
          *,
          admin_user:users!admin_user_id(email, full_name),
          target_user:users!target_user_id(email, full_name)
        `)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      return data as AdminLog[];
    },
    enabled: currentUserData?.role === 'admin',
  });

  // Mutation para alterar senha
  const changePasswordMutation = useMutation({
    mutationFn: async (form: PasswordResetForm) => {
      // Gerar token de reset
      const { data: tokenData, error: tokenError } = await supabase
        .rpc('generate_password_reset_token', { target_user_id: form.userId });

      if (tokenError) throw tokenError;

      // Usar o token para alterar a senha
      const { error: updateError } = await supabase.auth.admin.updateUserById(
        form.userId,
        { password: form.newPassword }
      );

      if (updateError) throw updateError;

      // Log da ação
      await supabase.rpc('log_admin_action', {
        admin_id: user?.id,
        target_id: form.userId,
        action_type: 'password_changed_by_admin',
        action_details: { changed_at: new Date().toISOString() }
      });

      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-logs'] });
      setIsPasswordModalOpen(false);
      setPasswordForm({ userId: '', newPassword: '', confirmPassword: '' });
      toast.success('Senha alterada com sucesso!');
    },
    onError: (error: Error) => {
      toast.error(`Erro ao alterar senha: ${error.message}`);
    },
  });

  // Mutation para alterar role do usuário
  const changeRoleMutation = useMutation({
    mutationFn: async ({ userId, newRole }: { userId: string; newRole: string }) => {
      const { error } = await supabase
        .from('users')
        .update({ role: newRole })
        .eq('id', userId);

      if (error) throw error;

      // Log da ação
      await supabase.rpc('log_admin_action', {
        admin_id: user?.id,
        target_id: userId,
        action_type: 'role_changed',
        action_details: { new_role: newRole, changed_at: new Date().toISOString() }
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      queryClient.invalidateQueries({ queryKey: ['admin-logs'] });
      toast.success('Nível de acesso alterado com sucesso!');
    },
    onError: (error: Error) => {
      toast.error(`Erro ao alterar nível de acesso: ${error.message}`);
    },
  });

  // Mutation para deletar usuário
  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      // Deletar do auth.users (cascata irá deletar da tabela users)
      const { error } = await supabase.auth.admin.deleteUser(userId);
      if (error) throw error;

      // Log da ação
      await supabase.rpc('log_admin_action', {
        admin_id: user?.id,
        target_id: userId,
        action_type: 'user_deleted_by_admin',
        action_details: { deleted_at: new Date().toISOString() }
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      queryClient.invalidateQueries({ queryKey: ['admin-logs'] });
      setIsDeleteModalOpen(false);
      setSelectedUser(null);
      toast.success('Usuário excluído com sucesso!');
    },
    onError: (error: Error) => {
      toast.error(`Erro ao excluir usuário: ${error.message}`);
    },
  });

  // Filtrar usuários
  const filteredUsers = users?.filter(user => {
    const matchesSearch = user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         user.full_name?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = roleFilter === 'all' || user.role === roleFilter;
    const matchesStatus = statusFilter === 'all' || 
                         (statusFilter === 'confirmed' && user.email_confirmed_at) ||
                         (statusFilter === 'unconfirmed' && !user.email_confirmed_at);
    
    return matchesSearch && matchesRole && matchesStatus;
  });

  const handlePasswordChange = (userId: string) => {
    setPasswordForm({ ...passwordForm, userId });
    setIsPasswordModalOpen(true);
  };

  const handleDeleteUser = (user: AdminUser) => {
    setSelectedUser(user);
    setIsDeleteModalOpen(true);
  };

  const validatePassword = (password: string) => {
    const minLength = password.length >= 8;
    const hasUpper = /[A-Z]/.test(password);
    const hasLower = /[a-z]/.test(password);
    const hasNumber = /\d/.test(password);
    const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password);
    
    return {
      isValid: minLength && hasUpper && hasLower && hasNumber && hasSpecial,
      checks: { minLength, hasUpper, hasLower, hasNumber, hasSpecial }
    };
  };

  const passwordValidation = validatePassword(passwordForm.newPassword);

  const exportLogs = () => {
    if (!adminLogs) return;

    const csvContent = [
      ['Data', 'Admin', 'Usuário Alvo', 'Ação', 'Detalhes', 'IP'],
      ...adminLogs.map(log => [
        format(new Date(log.created_at), 'dd/MM/yyyy HH:mm:ss'),
        log.admin_user?.email || 'N/A',
        log.target_user?.email || 'N/A',
        log.action,
        JSON.stringify(log.details),
        log.ip_address || 'N/A'
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `admin-logs-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  // Verificar se o usuário atual é admin
  if (currentUserData?.role !== 'admin') {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Shield className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            Acesso Negado
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            Você não tem permissão para acessar o painel administrativo.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 mb-6">
        <div className="p-4 sm:p-6 border-b border-gray-100 dark:border-gray-700">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Shield className="w-8 h-8 text-blue-600" />
              <div>
                <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
                  Painel Administrativo
                </h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Gerencie usuários e monitore atividades do sistema
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsLogsModalOpen(true)}
                className="px-4 py-2 bg-gray-600 text-white rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors flex items-center gap-2"
              >
                <Eye className="w-4 h-4" />
                Ver Logs
              </button>
              <button
                onClick={exportLogs}
                className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                Exportar
              </button>
            </div>
          </div>
        </div>

        {/* Filtros */}
        <div className="p-4 sm:p-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar por email ou nome..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="w-full px-3 py-2 rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500"
            >
              <option value="all">Todos os níveis</option>
              <option value="admin">Administrador</option>
              <option value="professional">Profissional</option>
              <option value="receptionist">Recepcionista</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2 rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500"
            >
              <option value="all">Todos os status</option>
              <option value="confirmed">Email confirmado</option>
              <option value="unconfirmed">Email não confirmado</option>
            </select>
          </div>
        </div>
      </div>

      {/* Tabela de Usuários */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Usuário
                </th>
                <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Nível de Acesso
                </th>
                <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Cadastro
                </th>
                <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Último Acesso
                </th>
                <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {filteredUsers?.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                  <td className="px-4 sm:px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900 dark:text-white">
                        {user.full_name || 'Nome não informado'}
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        {user.email}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 sm:px-6 py-4 whitespace-nowrap">
                    <select
                      value={user.role}
                      onChange={(e) => changeRoleMutation.mutate({ 
                        userId: user.id, 
                        newRole: e.target.value 
                      })}
                      disabled={user.id === user?.id} // Não pode alterar próprio nível
                      className="text-sm rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white disabled:opacity-50"
                    >
                      <option value="admin">Administrador</option>
                      <option value="professional">Profissional</option>
                      <option value="receptionist">Recepcionista</option>
                    </select>
                  </td>
                  <td className="px-4 sm:px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      {user.email_confirmed_at ? (
                        <>
                          <CheckCircle className="w-4 h-4 text-green-500" />
                          <span className="text-sm text-green-600 dark:text-green-400">
                            Confirmado
                          </span>
                        </>
                      ) : (
                        <>
                          <XCircle className="w-4 h-4 text-red-500" />
                          <span className="text-sm text-red-600 dark:text-red-400">
                            Não confirmado
                          </span>
                        </>
                      )}
                    </div>
                  </td>
                  <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4" />
                      {format(new Date(user.created_at), 'dd/MM/yyyy')}
                    </div>
                  </td>
                  <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      {user.last_sign_in_at 
                        ? format(new Date(user.last_sign_in_at), 'dd/MM/yyyy HH:mm')
                        : 'Nunca'
                      }
                    </div>
                  </td>
                  <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handlePasswordChange(user.id)}
                        className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                        title="Alterar senha"
                      >
                        <Key className="w-4 h-4" />
                      </button>
                      {user.id !== user?.id && (
                        <button
                          onClick={() => handleDeleteUser(user)}
                          className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                          title="Excluir usuário"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Alteração de Senha */}
      {isPasswordModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
              Alterar Senha do Usuário
            </h3>
            <form onSubmit={(e) => {
              e.preventDefault();
              if (passwordForm.newPassword !== passwordForm.confirmPassword) {
                toast.error('As senhas não coincidem');
                return;
              }
              if (!passwordValidation.isValid) {
                toast.error('A senha não atende aos critérios de segurança');
                return;
              }
              changePasswordMutation.mutate(passwordForm);
            }}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Nova Senha
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={passwordForm.newPassword}
                      onChange={(e) => setPasswordForm({ 
                        ...passwordForm, 
                        newPassword: e.target.value 
                      })}
                      className="w-full px-3 py-2 pr-10 rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center"
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4 text-gray-400" />
                      ) : (
                        <Eye className="h-4 w-4 text-gray-400" />
                      )}
                    </button>
                  </div>
                  
                  {/* Validação da senha */}
                  {passwordForm.newPassword && (
                    <div className="mt-2 space-y-1">
                      <div className={`text-xs flex items-center gap-1 ${
                        passwordValidation.checks.minLength ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {passwordValidation.checks.minLength ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                        Mínimo 8 caracteres
                      </div>
                      <div className={`text-xs flex items-center gap-1 ${
                        passwordValidation.checks.hasUpper ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {passwordValidation.checks.hasUpper ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                        Letra maiúscula
                      </div>
                      <div className={`text-xs flex items-center gap-1 ${
                        passwordValidation.checks.hasLower ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {passwordValidation.checks.hasLower ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                        Letra minúscula
                      </div>
                      <div className={`text-xs flex items-center gap-1 ${
                        passwordValidation.checks.hasNumber ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {passwordValidation.checks.hasNumber ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                        Número
                      </div>
                      <div className={`text-xs flex items-center gap-1 ${
                        passwordValidation.checks.hasSpecial ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {passwordValidation.checks.hasSpecial ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                        Caractere especial
                      </div>
                    </div>
                  )}
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Confirmar Nova Senha
                  </label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={passwordForm.confirmPassword}
                    onChange={(e) => setPasswordForm({ 
                      ...passwordForm, 
                      confirmPassword: e.target.value 
                    })}
                    className="w-full px-3 py-2 rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  />
                  {passwordForm.confirmPassword && passwordForm.newPassword !== passwordForm.confirmPassword && (
                    <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                      <XCircle className="w-3 h-3" />
                      As senhas não coincidem
                    </p>
                  )}
                </div>
              </div>
              
              <div className="mt-6 flex flex-col sm:flex-row justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setIsPasswordModalOpen(false);
                    setPasswordForm({ userId: '', newPassword: '', confirmPassword: '' });
                  }}
                  className="w-full sm:w-auto px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={changePasswordMutation.isPending || !passwordValidation.isValid}
                  className="w-full sm:w-auto px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {changePasswordMutation.isPending && (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  )}
                  Alterar Senha
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Confirmação de Exclusão */}
      {isDeleteModalOpen && selectedUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-sm">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle className="w-8 h-8 text-red-500" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Confirmar Exclusão
              </h3>
            </div>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Tem certeza que deseja excluir o usuário <strong>{selectedUser.email}</strong>? 
              Esta ação não pode ser desfeita e todos os dados relacionados serão perdidos.
            </p>
            <div className="flex flex-col sm:flex-row justify-end gap-3">
              <button
                onClick={() => {
                  setIsDeleteModalOpen(false);
                  setSelectedUser(null);
                }}
                className="w-full sm:w-auto px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Cancelar
              </button>
              <button
                onClick={() => deleteUserMutation.mutate(selectedUser.id)}
                disabled={deleteUserMutation.isPending}
                className="w-full sm:w-auto px-4 py-2 bg-red-600 text-white rounded-md text-sm font-medium hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {deleteUserMutation.isPending && (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                )}
                Confirmar Exclusão
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Logs */}
      {isLogsModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-4xl max-h-[80vh] overflow-hidden">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Logs Administrativos
              </h3>
              <button
                onClick={() => setIsLogsModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>
            <div className="overflow-y-auto max-h-[60vh]">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-700 sticky top-0">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                      Data/Hora
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                      Admin
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                      Ação
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">
                      Usuário Alvo
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {adminLogs?.map((log) => (
                    <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                        {format(new Date(log.created_at), 'dd/MM/yyyy HH:mm:ss')}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                        {log.admin_user?.email || 'Sistema'}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          log.action.includes('delete') ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' :
                          log.action.includes('password') ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' :
                          log.action.includes('role') ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' :
                          'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
                        }`}>
                          {log.action.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                        {log.target_user?.email || 'N/A'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminPanel;