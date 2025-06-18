import { createClient } from 'npm:@supabase/supabase-js@2.39.7';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const evolutionApiUrl = Deno.env.get('EVOLUTION_API_URL')!;
const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY')!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

Deno.serve(async (req) => {
  try {
    const { type, record } = await req.json();

    // Only proceed if this is a user signup event
    if (type !== 'signup') {
      return new Response(JSON.stringify({ message: 'Not a signup event' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const userId = record.id;
    const userEmail = record.email;
    const instanceName = `tssaas-${userEmail.split('@')[0]}`;

    // Create Evolution instance
    const createResponse = await fetch(`${evolutionApiUrl}/instance/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': evolutionApiKey,
      },
      body: JSON.stringify({
        instanceName,
        qrcode: true,
        number: '5511999999999',
        token: evolutionApiKey,
      }),
    });

    if (!createResponse.ok) {
      throw new Error('Failed to create Evolution instance');
    }

    const createData = await createResponse.json();

    // Store instance info in Supabase
    const { error: insertError } = await supabase
      .from('evolution_instances')
      .insert([{
        user_id: userId,
        instance_name: instanceName,
        qr_code: createData.qrcode,
        status: 'created',
      }]);

    if (insertError) {
      throw new Error('Failed to store instance information');
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Evolution instance created successfully' }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in signup webhook:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
});