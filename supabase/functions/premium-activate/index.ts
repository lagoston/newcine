import { createClient } from 'npm:@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface RequestBody {
  userId: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: corsHeaders,
      status: 204,
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    
    const { userId } = await req.json() as RequestBody;

    if (!userId) {
      throw new Error('Missing required field: userId');
    }
    
    console.log(`Manual premium activation requested for user: ${userId}`);

    // Call RPC function to activate premium
    const { data, error } = await supabase.rpc('activate_premium_for_user', { 
      target_user_id: userId 
    });

    if (error) {
      console.error('Error activating premium for user:', error);
      throw error;
    }

    // Force refresh user tickets as well
    const { data: ticketsData, error: ticketsError } = await supabase
      .from('user_tickets')
      .update({
        plan_type: 'premium',
        tickets_remaining: 3000,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);
      
    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'Premium activation successful',
        data
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Error activating premium:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});