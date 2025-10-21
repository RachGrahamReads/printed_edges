# 🚨 Security Fix Guide - Rotate Compromised Supabase Keys

**Status**: Secrets removed from code ✅ | Keys need rotation ⚠️

## What Happened

Three Supabase service role keys were exposed in your public GitHub repository:
- `eyJhbGci...fEfh4` (in scripts/fix-production-schema.js)
- `eyJhbGci...CG7pxI` (in setup-storage.js)
- `eyJhbGci...FhZ6I` (in .claude/settings.local.json)

These keys have **full admin access** to your database and bypass all Row Level Security (RLS) policies.

## What We Fixed (Completed ✅)

1. ✅ Removed hardcoded keys from all scripts
2. ✅ Updated scripts to use `SUPABASE_SERVICE_ROLE_KEY` environment variable
3. ✅ Added `.claude/settings.local.json` to .gitignore
4. ✅ Committed and pushed fixes to GitHub

## What You Must Do Next (CRITICAL ⚠️)

### Step 1: Generate New Service Role Key

1. Go to [Supabase Dashboard](https://supabase.com/dashboard/project/gsndpkiedjojlqpjdwgu)
2. Navigate to: **Settings** → **API**
3. Scroll to **Project API keys** section
4. Under "Service role key", click **"Generate new key"** or **"Rotate"**
5. **Copy the new key immediately** (you won't see it again)
6. Keep the tab open with the new key visible

### Step 2: Update Vercel Environment Variables

Your website reads the service key from Vercel environment variables.

1. Go to [Vercel Dashboard](https://vercel.com)
2. Select your **printed-edges** project
3. Go to **Settings** → **Environment Variables**
4. Find `SUPABASE_SERVICE_ROLE_KEY`
5. Click **Edit** and paste the **new key** from Step 1
6. Save changes
7. **Redeploy** your site:
   - Go to **Deployments** tab
   - Click the **⋮** menu on the latest deployment
   - Click **"Redeploy"**

### Step 3: Update Local Environment

Update your local `.env.local` file:

```bash
# Open .env.local and update this line:
SUPABASE_SERVICE_ROLE_KEY=your_new_key_here
```

### Step 4: Test Everything Works

1. Visit your website: https://printed-edges.vercel.app (or your domain)
2. Test these features:
   - User login/signup
   - Uploading a PDF
   - Processing a PDF
   - Admin dashboard (if applicable)

If anything fails, check Vercel logs:
```bash
vercel logs
```

### Step 5: Revoke Old Compromised Keys

**ONLY AFTER** confirming your site works with the new key:

1. Return to Supabase Dashboard → Settings → API
2. Under "Service role key", find the old keys
3. Click **"Revoke"** on each old compromised key
4. Confirm revocation

### Step 6: Close GitHub Security Alerts

1. Go to your [GitHub Security Alerts](https://github.com/RachGrahamReads/printed_edges/security/secret-scanning)
2. For each alert, click **"Dismiss alert"**
3. Select reason: **"Revoked"**
4. Add note: "Keys rotated and old keys revoked in Supabase dashboard"

## How to Use Scripts Now

Scripts now require the service key as an environment variable:

```bash
# Before (hardcoded - INSECURE):
node setup-storage.js

# Now (secure - reads from environment):
SUPABASE_SERVICE_ROLE_KEY=your_new_key node setup-storage.js

# Or set it once in your shell session:
export SUPABASE_SERVICE_ROLE_KEY=your_new_key
node setup-storage.js
node scripts/fix-production-schema.js
```

## Prevention Checklist

- ✅ Never commit API keys, tokens, or passwords to Git
- ✅ Always use environment variables for secrets
- ✅ Keep `.env.local` and `.env` in `.gitignore`
- ✅ Use Vercel environment variables for production secrets
- ✅ Review GitHub security alerts regularly

## Need Help?

If anything goes wrong:

1. **Site is down**: Check Vercel deployment logs
2. **Database errors**: Verify new key is correctly set in Vercel env vars
3. **Still seeing alerts**: Make sure you revoked old keys in Supabase
4. **Can't find something**: Contact Supabase support or check their docs

## Summary Timeline

- ✅ **Now**: Secrets removed from code, changes pushed to GitHub
- ⚠️ **Next 1 hour**: Generate new keys, update Vercel, test site
- ⚠️ **After testing**: Revoke old compromised keys
- ✅ **Done**: Close GitHub security alerts

**Status**: You're halfway there! Complete steps 1-6 above to finish securing your application.
