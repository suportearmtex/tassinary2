import { createClient } from 'npm:@supabase/supabase-js@2.39.7';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface AdminActionRequest {
  action: 'reset_password' | 'change_role' | 'delete_user' | 'get_users' | 'get_logs';
  userId?: string;
  newPassword?: string;
  newRole?: string;
  limit?: number;
}

async function isAdmin(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('users')
    .select('role')
    .eq('id', userId)
    .single();

  if (error || !data) return false;
  return data.role === 'admin';
}

async function logAdminAction(
  adminId: string,
  targetId: string,
  action: string,
  details: any = {},
  req: Request
) {
  const clientIP = req.headers.get('x-forwarded-for') || 
                   req.headers.get('x-real-ip') || 
                   'unknown';
  const userAgent = req.headers.get('user-agent') || 'unknown';

  await supabase
    .from('admin_logs')
    .insert({
      admin_user_id: adminId,
      target_user_id: targetId,
      action,
      details,
      ip_address: clientIP,
      user_agent: userAgent,
    });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      throw new Error('Invalid authorization');
    }

    // Verificar se o usuário é admin
    if (!(await isAdmin(user.id))) {
      throw new Error('Access denied: admin privileges required');
    }

    const { action, userId, newPassword, newRole, limit }: AdminActionRequest = await req.json();

    switch (action) {
      case 'reset_password':
        if (!userId || !newPassword) {
          throw new Error('Missing required parameters');
        }

        // Validar força da senha
        if (newPassword.length < 8) {
          throw new Error('Password must be at least 8 characters long');
        }

        const { error: passwordError } = await supabase.auth.admin.updateUserById(
          userId,
          { password: newPassword }
        );

        if (passwordError) throw passwordError;

        await logAdminAction(user.id, userId, 'password_reset_by_admin', {
          timestamp: new Date().toISOString(),
        }, req);

        return new Response(
          JSON.stringify({ success: true, message: 'Password updated successfully' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

      case 'change_role':
        if (!userId || !newRole) {
          throw new Error('Missing required parameters');
        }

        if (!['admin', 'professional', 'receptionist'].includes(newRole)) {
          throw new Error('Invalid role');
        }

        // Não permitir que o admin altere seu próprio nível
        if (userId === user.id) {
          throw new Error('Cannot change your own role');
        }

        const { error: roleError } = await supabase
          .from('users')
          .update({ role: newRole })
          .eq('id', userId);

        if (roleError) throw roleError;

        await logAdminAction(user.id, userId, 'role_changed_by_admin', {
          new_role: newRole,
          timestamp: new Date().toISOString(),
        }, req);

        return new Response(
          JSON.stringify({ success: true, message: 'Role updated successfully' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

      case 'delete_user':
        if (!userId) {
          throw new Error('Missing user ID');
        }

        // Não permitir que o admin delete a si mesmo
        if (userId === user.id) {
          throw new Error('Cannot delete your own account');
        }

        // Buscar dados do usuário antes de deletar
        const { data: userData } = await supabase
          .from('users')
          .select('*')
          .eq('id', userId)
          .single();

        const { error: deleteError } = await supabase.auth.admin.deleteUser(userId);
        if (deleteError) throw deleteError;

        await logAdminAction(user.id, userId, 'user_deleted_by_admin', {
          deleted_user_data: userData,
          timestamp: new Date().toISOString(),
        }, req);

        return new Response(
          JSON.stringify({ success: true, message: 'User deleted successfully' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

      case 'get_users':
        const { data: users, error: usersError } = await supabase
          .from('users')
          .select('*')
          .order('created_at', { ascending: false });

        if (usersError) throw usersError;

        // Buscar dados adicionais do auth.users
        const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers();
        if (authError) throw authError;

        // Combinar dados
        const combinedUsers = users.map(user => {
          const authUser = authUsers.users.find(au => au.id === user.id);
          return {
            ...user,
            last_sign_in_at: authUser?.last_sign_in_at || null,
            email_confirmed_at: authUser?.email_confirmed_at || null,
          };
        });

        return new Response(
          JSON.stringify({ users: combinedUsers }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

      case 'get_logs':
        const { data: logs, error: logsError } = await supabase
          .from('admin_logs')
          .select(`
            *,
            admin_user:users!admin_user_id(email, full_name),
            target_user:users!target_user_id(email, full_name)
          `)
          .order('created_at', { ascending: false })
          .limit(limit || 100);

        if (logsError) throw logsError;

        return new Response(
          JSON.stringify({ logs }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

      default:
        throw new Error('Invalid action');
    }
  } catch (error) {
    console.error('Admin action error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});