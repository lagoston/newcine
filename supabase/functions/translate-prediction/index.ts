
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
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');

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
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${geminiApiKey}`,
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

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Gemini API error:', errorData);
      throw new Error(`Gemini API error: ${response.status} - ${errorData}`);
    }

    const data = await response.json();
    console.log('Gemini response:', JSON.stringify(data));

    // Check for safety filters or other blocks
    if (data.candidates?.[0]?.finishReason && data.candidates[0].finishReason !== 'STOP') {
      console.error('Content blocked:', data.candidates[0].finishReason);
      throw new Error(`Content blocked: ${data.candidates[0].finishReason}`);
    }

    const translatedText = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!translatedText) {
      console.error('No translation in response:', JSON.stringify(data));
      // Fallback to original text if translation fails
      return new Response(
        JSON.stringify({ translatedText: text }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200
        }
      );
    }

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