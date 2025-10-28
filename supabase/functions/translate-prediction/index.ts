import { createClient } from 'npm:@supabase/supabase-js@2.39.7';
import { OpenAI } from 'npm:openai@4.28.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface RequestBody {
  text: string;
  language: 'pt-BR' | 'es';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: corsHeaders,
      status: 204,
    });
  }

  try {
    const openai = new OpenAI({
      apiKey: Deno.env.get('OPENAI_API_KEY'),
    });

    const { text, language } = await req.json() as RequestBody;

    if (!text || !language) {
      throw new Error('Missing required fields: text and language');
    }

    const languageMap = {
      'pt-BR': 'Brazilian Portuguese',
      'es': 'Spanish'
    };

    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: `You are a professional translator. Translate the following text to ${languageMap[language]}. Maintain the same tone and style, including any emojis or special characters. Keep line breaks and formatting intact.`
        },
        {
          role: 'user',
          content: text
        }
      ],
      temperature: 0.7,
      max_tokens: 500
    });

    return new Response(
      JSON.stringify({
        translatedText: completion.choices[0].message.content
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});