import { createClient } from 'npm:@supabase/supabase-js@2.39.7';

// Download do pacote de dados do laboratório da nota prevista (09/10/2026).
// GET /functions/v1/lab-export?key=<chave de bot_seed_keys>
// Devolve o texto de public.lab_export_text() como arquivo .tsv. Usuários
// saem só como índice (nada de id, nome ou e-mail). A chave expira sozinha
// (bot_seed_keys.expires_at); sem chave válida, 403. verify_jwt fica
// desligado porque o link é aberto direto no navegador — a autenticação é
// a chave.

Deno.serve(async (req: Request) => {
  try {
    const url = new URL(req.url);
    const key = url.searchParams.get('key') || '';
    if (!key) return new Response('forbidden', { status: 403 });

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: keyRow } = await supabase
      .from('bot_seed_keys')
      .select('key')
      .eq('key', key)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();
    if (!keyRow) return new Response('forbidden', { status: 403 });

    const { data, error } = await supabase.rpc('lab_export_text');
    if (error) return new Response(`erro: ${error.message}`, { status: 500 });

    const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    return new Response(String(data ?? ''), {
      status: 200,
      headers: {
        'Content-Type': 'text/tab-separated-values; charset=utf-8',
        'Content-Disposition': `attachment; filename="cineoracle_lab_${day}.tsv"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return new Response(`erro: ${error instanceof Error ? error.message : 'interno'}`, { status: 500 });
  }
});
