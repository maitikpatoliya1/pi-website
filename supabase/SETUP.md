# Pansuriya Impex — Supabase setup (do this once)

This turns the demo (browser-only) into the real thing: one shared database,
real email verification, stored KYC documents, and an admin panel that works
across every device. The frontend stays on maitik.com / GitHub Pages.

You do **steps 1–5** (≈ 5 minutes). Then paste me the two values from step 4 and
I wire the whole app to it and test it live.

---

## 1. Create the project
1. Go to **https://supabase.com** → **Sign in** (use your Google/GitHub).
2. **New project**.
   - Name: `pi-website`
   - Database password: pick a strong one and **save it** somewhere.
   - Region: choose the closest — **Mumbai** or **Singapore**.
3. Click **Create new project** and wait ~2 minutes for it to finish setting up.

## 2. Create the database (paste one script)
1. In the left sidebar open **SQL Editor** → **New query**.
2. Open the file **`supabase/schema.sql`** from this repo, copy **everything**, paste it in.
3. Click **Run**. You should see "Success. No rows returned." That's correct —
   it built the tables, security rules, and the document storage.

## 3. Email settings (for the OTP / verification)
1. Left sidebar → **Authentication** → **Providers** → make sure **Email** is **enabled**.
2. **Authentication → URL Configuration**: set **Site URL** to `https://maitik.com`
   and add `https://maitik.com` under **Redirect URLs**.
   *(While testing locally you can also add `http://localhost:8766`.)*

## 4. Get your two keys
1. Left sidebar → **Project Settings** (gear) → **API**.
2. Copy these two values:
   - **Project URL**  (looks like `https://xxxxxxxx.supabase.co`)
   - **anon public** key  (a long string under "Project API keys")
3. **Paste both back to me in chat.**
   - ✅ The **anon public** key is *meant* to live in front-end code — it's safe to share.
   - ❌ Never share the **service_role** key — I will never ask for it, and it must
     never go into the website.

## 5. Become the admin (after your first sign-up on the new system)
Once everything is wired and you've registered once on the new login:
- SQL Editor → run:
  ```sql
  update public.profiles
  set role = 'admin', status = 'approved'
  where email = 'maitikpatoliya@gmail.com';
  ```
- From then on you manage all roles/approvals from inside the app's User Management.

---

## What I do after you send the two keys
- Add the Supabase client to the site and a `supabase-config.js` with your URL + anon key.
- Rewire **registration** (writes to the database + uploads documents to Storage),
  **email OTP verification**, **login** (real auth + approval gate),
  **User Management** (shared approvals, roles, permissions), and the **dashboard**.
- Test the full flow live on maitik.com and hand it back working.
