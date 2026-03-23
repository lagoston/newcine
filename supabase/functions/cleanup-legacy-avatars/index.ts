import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json().catch(() => ({}));

    if (body?.confirm !== true) {
      return new Response(
        JSON.stringify({
          error: 'Send { "confirm": true } to execute this destructive migration.',
          warning:
            "This will delete all non-WebP avatar files and clear avatar_url for affected users.",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    let totalFilesDeleted = 0;
    let totalUsersCleared = 0;
    const errors: string[] = [];
    const usersToNull: string[] = [];

    const { data: folders, error: listError } = await supabase.storage
      .from("avatars")
      .list("", { limit: 1000 });

    if (listError) throw listError;

    for (const folder of folders ?? []) {
      const userId = folder.name;
      if (!userId) continue;

      const { data: files, error: filesError } = await supabase.storage
        .from("avatars")
        .list(userId, { limit: 200 });

      if (filesError) {
        errors.push(`list ${userId}: ${filesError.message}`);
        continue;
      }

      const allFiles = files ?? [];
      const nonWebp = allFiles.filter((f) => !f.name.toLowerCase().endsWith(".webp"));

      if (nonWebp.length === 0) continue;

      const paths = nonWebp.map((f) => `${userId}/${f.name}`);
      const { error: deleteError } = await supabase.storage.from("avatars").remove(paths);

      if (deleteError) {
        errors.push(`delete ${userId}: ${deleteError.message}`);
        continue;
      }

      totalFilesDeleted += paths.length;

      const remainingWebp = allFiles.filter((f) => f.name.toLowerCase().endsWith(".webp"));
      if (remainingWebp.length === 0) {
        usersToNull.push(userId);
      }
    }

    if (usersToNull.length > 0) {
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_url: null })
        .in("id", usersToNull);

      if (updateError) {
        errors.push(`clear profiles: ${updateError.message}`);
      } else {
        totalUsersCleared = usersToNull.length;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        filesDeleted: totalFilesDeleted,
        usersCleared: totalUsersCleared,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
