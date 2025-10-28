
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
    const geminiApiKey = 'AIzaSyB-jiDu9zi3HAwaGc-T7VhbNJCOFAqsUVM';

    const { text, language } = await req.json() as RequestBody;

    if (!text || !language) {
      throw new Error('Missing required fields: text and language');
    }

    const languageMap = {
      'pt-BR': 'Brazilian Portuguese',
      'es': 'Spanish'
    };

    const prompt = `You are a professional translator. Translate the following text to ${languageMap[language]}. Maintain the same tone and style, including any emojis or special characters. Keep line breaks and formatting intact.\n\n${text}`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: prompt }]
          }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 500
          }
        })
      }
    );

    const data = await response.json();
    const translatedText = data.candidates?.[0]?.content?.parts?.[0]?.text || text;

    return new Response(
      JSON.stringify({
        translatedText
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