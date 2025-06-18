import { createClient } from 'npm:@supabase/supabase-js@2.39.7';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const evolutionApiUrl = Deno.env.get('EVOLUTION_API_URL')!;
const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY')!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
};

async function checkInstanceStatus(instanceName: string) {
  try {
    const response = await fetch(`${evolutionApiUrl}/instance/connectionState/${instanceName}`, {
      headers: {
        'apikey': evolutionApiKey,
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Instance not found');
      }
      throw new Error('Failed to check instance status');
    }

    const data = await response.json();
    return data.instance?.state === 'open' ? 'connected' : 'disconnected';
  } catch (error) {
    console.error('Error checking instance status:', error);
    throw error;
  }
}

async function refreshQrCode(instanceName: string) {
  try {
    const response = await fetch(`${evolutionApiUrl}/instance/connect/${instanceName}`, {
      headers: {
        'apikey': evolutionApiKey,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to refresh QR code');
    }

    const data = await response.json();
    return data.qrcode?.base64 || null;
  } catch (error) {
    console.error('Error refreshing QR code:', error);
    return null;
  }
}

async function createEvolutionInstance(userId: string, userEmail: string) {
  try {
    const instanceName = `tssaas-${userEmail.split('@')[0]}`;
    
    const createResponse = await fetch(`${evolutionApiUrl}/instance/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': evolutionApiKey,
      },
      body: JSON.stringify({
        instanceName,
        qrcode: true,
        integration: 'WHATSAPP-BAILEYS',
        token: evolutionApiKey,
      }),
    });

    if (!createResponse.ok) {
      throw new Error('Failed to create Evolution instance');
    }

    const createData = await createResponse.json();

    // Get initial QR code
    const qrCode = await refreshQrCode(instanceName);

    const { error: insertError } = await supabase
      .from('evolution_instances')
      .insert([{
        user_id: userId,
        instance_name: instanceName,
        qr_code: qrCode,
        status: 'created',
      }]);

    if (insertError) {
      throw new Error('Failed to store instance information');
    }

    return { success: true, instanceName, qrCode };
  } catch (error) {
    console.error('Error creating Evolution instance:', error);
    throw error;
  }
}

async function deleteEvolutionInstance(instanceName: string) {
  try {
    const response = await fetch(`${evolutionApiUrl}/instance/delete/${instanceName}`, {
      method: 'DELETE',
      headers: {
        'apikey': evolutionApiKey,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to delete Evolution instance');
    }

    return true;
  } catch (error) {
    console.error('Error deleting Evolution instance:', error);
    throw error;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: corsHeaders,
    });
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

    // Handle DELETE request
    if (req.method === 'DELETE') {
      const { data: existingInstance } = await supabase
        .from('evolution_instances')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (!existingInstance) {
        throw new Error('No instance found');
      }

      await deleteEvolutionInstance(existingInstance.instance_name);

      const { error: deleteError } = await supabase
        .from('evolution_instances')
        .delete()
        .eq('user_id', user.id);

      if (deleteError) {
        throw new Error('Failed to delete instance record');
      }

      return new Response(
        JSON.stringify({ success: true }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const { data: existingInstance } = await supabase
      .from('evolution_instances')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (existingInstance) {
      try {
        const currentStatus = await checkInstanceStatus(existingInstance.instance_name);
        let updateData: { status: string; qr_code?: string | null } = { status: currentStatus };
        
        // Only refresh QR code if not connected and explicitly requested or status changed from connected
        if (req.method === 'POST' || (currentStatus !== 'connected' && existingInstance.status === 'connected')) {
          const newQrCode = await refreshQrCode(existingInstance.instance_name);
          if (newQrCode) {
            updateData.qr_code = newQrCode;
          }
        }

        // Always update status in database if it changed
        if (currentStatus !== existingInstance.status || updateData.qr_code) {
          const { error: updateError } = await supabase
            .from('evolution_instances')
            .update(updateData)
            .eq('id', existingInstance.id);

          if (updateError) {
            throw new Error('Failed to update instance information');
          }

          return new Response(
            JSON.stringify({ ...existingInstance, ...updateData }),
            {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
          );
        }

        return new Response(
          JSON.stringify({ ...existingInstance, status: currentStatus }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      } catch (error) {
        if (error instanceof Error && error.message === 'Instance not found') {
          // If instance doesn't exist in Evolution API but exists in our database,
          // delete the database record and return 404
          const { error: deleteError } = await supabase
            .from('evolution_instances')
            .delete()
            .eq('user_id', user.id);

          return new Response(
            JSON.stringify({ error: 'Instance not found' }),
            {
              status: 404,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
          );
        }
        throw error;
      }
    }

    if (req.method === 'POST') {
      const result = await createEvolutionInstance(user.id, user.email!);
      return new Response(
        JSON.stringify(result),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    return new Response(
      JSON.stringify({ message: 'No instance found' }),
      {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: error instanceof Error && error.message === 'Instance not found' ? 404 : 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});