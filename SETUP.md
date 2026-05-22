# Setup Guide — Small Build Company (Next.js + Supabase)

## Step 1 — Install Node.js

Download and install Node.js from **https://nodejs.org** — choose the **LTS version**.

After installing, open a new terminal and confirm it works:
```
node --version
npm --version
```

---

## Step 2 — Create your Supabase project

1. Go to **https://supabase.com** and sign up (free)
2. Click **New Project**
3. Give it a name (e.g., `small-build-company`) and set a strong database password
4. Wait for it to provision (~1 minute)
5. Go to **Settings → API** and copy:
   - **Project URL** (looks like `https://xxxxx.supabase.co`)
   - **anon public key** (long string starting with `eyJ...`)

---

## Step 3 — Create the database tables

1. In Supabase, go to **SQL Editor** → **New query**
2. Open the file `supabase/schema.sql` from this folder
3. Paste all the SQL into the editor and click **Run**

---

## Step 4 — Configure environment variables

1. Copy the example file:
   ```
   copy .env.local.example .env.local
   ```
2. Open `.env.local` in Notepad and fill in:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
   ANTHROPIC_API_KEY=sk-ant-your-key-here
   ```
   (The Anthropic key is optional — only needed for AI scope writing)

---

## Step 5 — Install dependencies and run

Open a terminal in this folder (`C:\Users\deonh\OneDrive\Desktop\Small-build-company`) and run:

```
npm install
npm run dev
```

Then open **http://localhost:3000** in your browser.

---

## Step 6 — Create your account

On the login page, click **Create one** to create your account.
- Use your work email and a strong password
- Check your email and click the confirmation link
- Then log back in

---

## Step 7 — Fill in Company Setup

Go to **Company Setup** in the sidebar and fill in your company details — these appear on all quotes.

---

## Deploying to Vercel (optional — for access from any device)

1. Push this folder to a GitHub repository
2. Go to **https://vercel.com**, sign up with GitHub
3. Click **New Project** → import your repository
4. Add the same environment variables from `.env.local` in Vercel's settings
5. Deploy — you'll get a live URL like `https://your-app.vercel.app`

---

## Migrating existing data from the HTML app

If you have data in the old `small-build-company_41.html` app that you want to keep:

1. Open the old HTML file in your browser
2. Open Developer Tools (F12) → Console
3. Run this to export your data:
   ```javascript
   const data = {
     jobs: JSON.parse(localStorage.getItem('sbc_jobs') || '[]'),
     quotes: JSON.parse(localStorage.getItem('sbc_quotes') || '[]'),
     clients: JSON.parse(localStorage.getItem('sbc_clients') || '[]'),
     settings: JSON.parse(localStorage.getItem('sbc_settings') || '{}'),
   };
   copy(JSON.stringify(data, null, 2));
   ```
4. This copies your data to clipboard
5. Ask Claude to help you import it into Supabase using the bulk insert SQL commands
