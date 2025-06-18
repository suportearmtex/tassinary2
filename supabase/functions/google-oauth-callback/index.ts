import { createClient } from 'npm:@supabase/supabase-js@2.39.7';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const googleClientId = Deno.env.get('GOOGLE_CLIENT_ID')!;
const googleClientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

async function exchangeCodeForTokens(code: string, redirectUri: string) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      code,
      client_id: googleClientId,
      client_secret: googleClientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('Token exchange error:', error);
    throw new Error('Failed to exchange code for tokens');
  }

  return response.json();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const error = url.searchParams.get('error');
    const state = url.searchParams.get('state');

    if (error) {
      throw new Error(`OAuth error: ${error}`);
    }

    if (!code || !state) {
      throw new Error('Missing required parameters');
    }

    // Get user from state token
    const { data: { user }, error: authError } = await supabase.auth.getUser(state);
    if (authError || !user) {
      throw new Error('Invalid state parameter');
    }

    const redirectUri = `${supabaseUrl}/functions/v1/google-oauth-callback`;
    const tokens = await exchangeCodeForTokens(code, redirectUri);

    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + tokens.expires_in);

    // Store tokens in database
    const { error: upsertError } = await supabase
      .from('user_google_tokens')
      .upsert({
        user_id: user.id,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: expiresAt.toISOString(),
      });

    if (upsertError) {
      throw new Error('Failed to store tokens');
    }

    // Return success page
    return new Response(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Google Calendar Connected</title>
          <script>
            window.onload = function() {
              window.opener.postMessage('google-calendar-connected', '*');
              window.close();
            };
          </script>
        </head>
        <body>
          <h1>Google Calendar conectado com sucesso!</h1>
          <p>Você pode fechar esta janela.</p>
        </body>
      </html>
    `, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/html',
      },
    });
  } catch (error) {
    console.error('OAuth callback error:', error);
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