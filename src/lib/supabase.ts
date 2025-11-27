import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Standardized function to fetch user profile
export async function getProfile(userId: string) {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, avatar_url, bio, plan_type, avatar_frame, banner, active_tag, oracle_predictions_count, oracle_recommendations_count')
      .eq('id', userId)
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error fetching profile:', error);
    return { data: null, error };
  }
}

// Helper function to safely create user tickets
async function createUserTickets(userId: string) {
  try {
    // Use the RPC function directly without checking first, as the function itself
    // has proper conflict handling with ON CONFLICT DO NOTHING
    const { error: ticketsError } = await supabase
      .rpc('create_user_tickets_safely', { user_id_input: userId });
    
    if (ticketsError) {
      console.error('Error creating user tickets:', ticketsError);
      // Non-fatal error, we'll let the database handle conflicts
    }
  } catch (error) {
    console.error('Error in createUserTickets:', error);
    // This is a helper function, so we'll just log the error and continue
  }
}

// Standardized function to create a new user profile
export async function createProfile(userId: string, email: string) {
  const maxRetries = 3;
  let retryCount = 0;
  
  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  
  try {
    // Generate a default username from email
    let defaultUsername = email?.split('@')[0] || `user_${Date.now()}`;
    
    // First check if profile already exists to avoid duplicate key errors
    const { data: existingProfile, error: checkError } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', userId)
      .single();
      
    if (checkError && checkError.code !== 'PGRST116') {
      console.error('Error checking existing profile:', checkError);
      throw checkError;
    }
      
    if (existingProfile) {
      return { data: existingProfile, error: null };
    }
    
    // Check if username already exists
    const { count, error: countError } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('username', defaultUsername);
    
    if (countError) {
      console.error('Error checking username existence:', countError);
      throw countError;
    }
      
    // If username already exists, append random string to make it unique
    if (count && count > 0) {
      const randomSuffix = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
      defaultUsername = `${defaultUsername}${randomSuffix}`;
    }
    
    // Create new profile with default values - with retry logic
    while (retryCount < maxRetries) {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .insert({
            id: userId,
            username: defaultUsername,
            bio: '',
            avatar_url: '',
            avatar_frame: '',
            banner: '',
            plan_type: 'free'
          })
          .select()
          .single();
          
        if (error) {
          console.error(`Attempt ${retryCount + 1}: Database error details:`, error);
          
          // If this is a policy violation, we need a different approach
          if (error.code === '42501' || error.message?.includes('policy')) {
            console.log('Detected policy violation, potentially RLS issue');
            // You might need a different approach, like using a server-side function
            // that has admin rights to bypass RLS for this specific operation
            throw new Error('Permission denied: Unable to create profile due to security policies');
          }
          
          // For other errors, we'll retry
          retryCount++;
          
          if (retryCount < maxRetries) {
            // Exponential backoff with jitter
            const backoff = Math.min(1000 * Math.pow(2, retryCount) + Math.random() * 1000, 10000);
            console.log(`Retrying in ${backoff}ms...`);
            await delay(backoff);
            continue;
          }
          
          throw error;
        }
        
        // Profile created successfully, now safely create the user tickets
        // This call to createUserTickets is now safer since we use the RPC function that
        // has proper conflict handling
        await createUserTickets(userId);
        
        return { data, error: null };
      } catch (insertError) {
        if (retryCount >= maxRetries - 1) {
          throw insertError;
        }
        retryCount++;
        const backoff = Math.min(1000 * Math.pow(2, retryCount) + Math.random() * 1000, 10000);
        await delay(backoff);
      }
    }
    
    throw new Error('Failed to create profile after multiple attempts');
  } catch (error) {
    console.error('Error creating profile:', error);
    return { data: null, error };
  }
}