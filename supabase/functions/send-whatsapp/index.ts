import { createClient } from 'npm:@supabase/supabase-js@2.39.7';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const evolutionApiUrl = Deno.env.get('EVOLUTION_API_URL')!;
const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY')!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

async function sendWhatsAppMessage(instanceName: string, phone: string, message: string) {
  try {
    const response = await fetch(`${evolutionApiUrl}/message/sendText/${instanceName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': evolutionApiKey,
      },
      body: JSON.stringify({
        number: phone,
        text: message
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Failed to send WhatsApp message: ${errorData.error || response.statusText}`);
    }

    return response.json();
  } catch (error) {
    console.error('Error sending WhatsApp message:', error);
    throw error;
  }
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

    // Get the user's Evolution instance
    const { data: instance, error: instanceError } = await supabase
      .from('evolution_instances')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (instanceError || !instance) {
      throw new Error('WhatsApp instance not found');
    }

    // Check if WhatsApp is connected by calling the connectionState endpoint
    const stateResponse = await fetch(`${evolutionApiUrl}/instance/connectionState/${instance.instance_name}`, {
      headers: {
        'apikey': evolutionApiKey,
      },
    });

    if (!stateResponse.ok) {
      throw new Error('Failed to check WhatsApp connection state');
    }

    const stateData = await stateResponse.json();
    if (!stateData.instance?.state || stateData.instance.state !== 'open') {
      throw new Error('WhatsApp is not connected');
    }

    const { appointmentId, type } = await req.json();

    // Get appointment details
    const { data: appointment, error: appointmentError } = await supabase
      .from('appointments')
      .select(`
        *,
        client:clients(*),
        service_details:services(*)
      `)
      .eq('id', appointmentId)
      .single();

    if (appointmentError || !appointment) {
      throw new Error('Appointment not found');
    }

    // Get message template
    const { data: template, error: templateError } = await supabase
      .from('message_templates')
      .select('*')
      .eq('type', type)
      .single();

    if (templateError || !template) {
      throw new Error('Message template not found');
    }

    if (!appointment.client.phone) {
      throw new Error('Client phone number not found');
    }

    // Format the date and time according to the locale
    const date = new Date(appointment.date).toLocaleDateString('pt-BR');
    const time = appointment.time;

    // Replace variables in template
    const message = template.content
      .replace('{name}', appointment.client.name)
      .replace('{service}', appointment.service_details.name)
      .replace('{date}', date)
      .replace('{time}', time);

    // Format phone number (remove any non-numeric characters and add country code if needed)
    const phone = appointment.client.phone.replace(/\D/g, '');
    const formattedPhone = phone.startsWith('55') ? phone : `55${phone}`;

    // Send message
    await sendWhatsAppMessage(instance.instance_name, formattedPhone, message);

    // Update appointment messages_sent status
    const messages_sent = {
      ...appointment.messages_sent,
      [type]: true,
    };

    const { error: updateError } = await supabase
      .from('appointments')
      .update({ messages_sent })
      .eq('id', appointmentId);

    if (updateError) {
      throw new Error('Failed to update message status');
    }

    return new Response(
      JSON.stringify({ success: true }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});