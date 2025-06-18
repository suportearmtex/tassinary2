import { createClient } from 'npm:@supabase/supabase-js@2.39.7';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const googleClientId = Deno.env.get('GOOGLE_CLIENT_ID')!;
const googleClientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
};

async function refreshGoogleToken(refreshToken: string) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: googleClientId,
      client_secret: googleClientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to refresh token');
  }

  const data = await response.json();
  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in,
  };
}

async function syncAppointmentToGoogle(
  appointment: any,
  accessToken: string,
  operation: 'create' | 'update' | 'delete'
) {
  // Calculate start and end times in the correct format
  const startDateTime = `${appointment.date}T${appointment.time}:00`;
  const endDateTime = new Date(`${appointment.date}T${appointment.time}`);
  endDateTime.setMinutes(endDateTime.getMinutes() + appointment.service_details.duration);
  
  const formattedEndTime = endDateTime.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  const eventData = {
    summary: `${appointment.client.name} - ${appointment.service_details.name}`,
    description: `Agendamento via Agenda Pro\n\nCliente: ${appointment.client.name}\nServiço: ${appointment.service_details.name}\nDuração: ${appointment.service_details.duration} minutos`,
    start: {
      dateTime: startDateTime,
      timeZone: 'America/Sao_Paulo',
    },
    end: {
      dateTime: `${appointment.date}T${formattedEndTime}`,
      timeZone: 'America/Sao_Paulo',
    },
  };

  const baseUrl = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };

  let response;

  switch (operation) {
    case 'create':
      response = await fetch(baseUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(eventData),
      });
      break;

    case 'update':
      response = await fetch(`${baseUrl}/${appointment.google_event_id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(eventData),
      });
      break;

    case 'delete':
      response = await fetch(`${baseUrl}/${appointment.google_event_id}`, {
        method: 'DELETE',
        headers,
      });
      break;
  }

  if (!response?.ok) {
    const errorData = await response?.json();
    throw new Error(`Failed to ${operation} event in Google Calendar: ${errorData?.error?.message || 'Unknown error'}`);
  }

  if (operation === 'delete') return null;
  return response.json();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { appointment, operation } = await req.json();
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

    // Get user's Google token
    const { data: tokenData, error: tokenError } = await supabase
      .from('user_google_tokens')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (tokenError || !tokenData) {
      throw new Error('Google Calendar not connected');
    }

    // Check if token needs refresh
    let accessToken = tokenData.access_token;
    if (new Date(tokenData.expires_at) <= new Date()) {
      const { accessToken: newToken, expiresIn } = await refreshGoogleToken(
        tokenData.refresh_token
      );
      
      accessToken = newToken;
      
      // Update token in database
      const expiresAt = new Date();
      expiresAt.setSeconds(expiresAt.getSeconds() + expiresIn);
      
      const { error: updateError } = await supabase
        .from('user_google_tokens')
        .update({
          access_token: newToken,
          expires_at: expiresAt.toISOString(),
        })
        .eq('user_id', user.id);

      if (updateError) {
        throw new Error('Failed to update token');
      }
    }

    // Sync with Google Calendar
    const result = await syncAppointmentToGoogle(
      appointment,
      accessToken,
      operation
    );

    // Update appointment with Google event ID if created
    if (operation === 'create' && result?.id) {
      const { error: updateError } = await supabase
        .from('appointments')
        .update({
          google_event_id: result.id,
          is_synced_to_google: true,
        })
        .eq('id', appointment.id);

      if (updateError) {
        throw new Error('Failed to update appointment with Google event ID');
      }
    }

    return new Response(
      JSON.stringify({ success: true }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  }
});