import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const metadataKeys = [
  "username",
  "company",
  "first_name",
  "middle_name",
  "last_name",
  "country_code",
  "phone",
  "address",
  "country",
  "state",
  "city",
  "pincode",
  "fax",
  "jurisdiction",
  "tax_label1",
  "tax_id1",
  "tax_label2",
  "tax_id2",
  "emergency_name",
  "emergency_phone",
  "emergency_address",
  "location",
] as const;

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function cleanText(value: unknown, max = 300) {
  return String(value ?? "").trim().slice(0, max);
}

function cleanMetadata(raw: Record<string, unknown>) {
  const metadata: Record<string, string> = {};
  for (const key of metadataKeys) {
    metadata[key] = cleanText(raw[key]);
  }
  return metadata;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed." });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const email = cleanText(body.email, 254).toLowerCase();
    const password = String(body.password ?? "");
    const metadata = cleanMetadata(body.metadata || {});
    const username = metadata.username;

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json(400, { error: "Please enter a valid email address." });
    }
    if (!/^[A-Za-z0-9._-]{2,80}$/.test(username)) {
      return json(400, { error: "Choose a username using letters, numbers, dots, dashes, or underscores." });
    }
    if (password.length < 6) {
      return json(400, { error: "Password must be at least 6 characters." });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      console.error("Missing Supabase service credentials for register-account.");
      return json(500, { error: "Registration is not configured yet." });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const usernameCheck = await admin.rpc("email_for_username", { uname: username });
    if (usernameCheck.error) {
      console.error("Username lookup failed", usernameCheck.error);
      return json(500, { error: "Could not check that username right now." });
    }
    if (usernameCheck.data) {
      return json(409, { error: "An account with that email or username already exists." });
    }

    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: metadata,
    });

    if (created.error) {
      const message = created.error.message || "Could not create the account right now.";
      if (/already|registered|exists|duplicate/i.test(message)) {
        return json(409, { error: "An account with that email or username already exists." });
      }
      console.error("createUser failed", created.error);
      return json(400, { error: message });
    }

    return json(200, {
      ok: true,
      email,
      userId: created.data.user?.id,
    });
  } catch (error) {
    console.error("register-account failed", error);
    return json(500, { error: "Could not create the account right now. Please try again." });
  }
});
