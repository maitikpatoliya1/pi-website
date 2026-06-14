/* ============================================================
   Pansuriya Impex — Supabase client
   ------------------------------------------------------------
   The anon ("publishable") key is SAFE to ship in front-end code —
   it only allows what the database's Row Level Security policies
   permit. The secret/service_role key must NEVER appear here.
   Loaded after the supabase-js library; exposes window.PI_SB.
   ============================================================ */
(function (global) {
  "use strict";
  var URL = "https://wiwbfqaerajusuqrzrly.supabase.co";
  var ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indpd2JmcWFlcmFqdXN1cXJ6cmx5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE0Mzk2NTcsImV4cCI6MjA5NzAxNTY1N30.HpgiyBy9dLgeXUbXMLFtVGlaw2FduDsBGCOymhBbqu8";

  if (!global.supabase || !global.supabase.createClient) {
    console.error("supabase-js failed to load before supabase-config.js");
    return;
  }
  global.PI_SB = global.supabase.createClient(URL, ANON, {
    auth: { persistSession: true, autoRefreshToken: true }
  });
})(window);
