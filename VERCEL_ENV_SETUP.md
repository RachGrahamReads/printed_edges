# Vercel Environment Variables Setup Guide

## New Supabase API Keys (2025 Format)

Your project has been updated to use Supabase's new publishable/secret key format instead of the legacy anon/service_role keys.

### Environment Variables for Vercel

Set these in your Vercel project: **Settings** → **Environment Variables**

#### Required Variables

```bash
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://gsndpkiedjojlqpjdwgu.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_ehcNBRUp5rbO90kkM3CNuQ_v4c799cO
SUPABASE_SECRET_KEY=sb_secret_f8wCkTyTpb10CslP31TR-A_4vMA6R3K

# Stripe Configuration
STRIPE_SECRET_KEY=<your_stripe_secret_key>
STRIPE_WEBHOOK_SECRET=<your_stripe_webhook_secret>

# Admin Configuration
ADMIN_EMAILS=rachgrahamreads@gmail.com

# Facebook Pixel
NEXT_PUBLIC_FACEBOOK_PIXEL_ID=25188779544059196
```

### Key Naming Convention

| Old Name (Legacy) | New Name (2025) | Safe to Share? |
|-------------------|-----------------|----------------|
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | ✅ Yes (client-side) |
| `SUPABASE_SERVICE_ROLE_KEY` | `SUPABASE_SECRET_KEY` | ❌ No (server-only) |

### What Each Key Does

**NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY**
- Prefix: `sb_publishable_`
- Used by: Browser/client-side code
- Access: Limited by Row Level Security (RLS) policies
- Safe to expose publicly (hence the `NEXT_PUBLIC_` prefix)
- Replaces the old `anon` key

**SUPABASE_SECRET_KEY**
- Prefix: `sb_secret_`
- Used by: Server-side API routes, Edge Functions
- Access: Full admin access, bypasses RLS
- **Must remain private** - server-only
- Replaces the old `service_role` key

### Setup Steps

1. **Go to Vercel**:
   - Visit [vercel.com](https://vercel.com)
   - Select your **printed-edges** project

2. **Navigate to Environment Variables**:
   - Click **Settings** → **Environment Variables**

3. **Add/Update Variables**:
   - For each variable above, click **Add New**
   - Name: (e.g., `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`)
   - Value: (paste the value)
   - Environment: Select **Production**, **Preview**, and **Development** (all three)
   - Click **Save**

4. **Remove Old Variables** (if they exist):
   - Find `NEXT_PUBLIC_SUPABASE_ANON_KEY` → Click **⋮** → **Delete**
   - Find `SUPABASE_SERVICE_ROLE_KEY` → Click **⋮** → **Delete**

5. **Redeploy**:
   - Go to **Deployments** tab
   - Click **⋮** on the latest deployment
   - Select **Redeploy**
   - Wait for deployment to complete (~2-3 minutes)

### Verification

After redeployment, test these features:

- ✅ User signup/login
- ✅ PDF upload
- ✅ PDF processing
- ✅ Admin dashboard
- ✅ Credit purchases

If anything fails, check:
```bash
# In Vercel
Deployments → [Latest] → Logs
```

### Local Development

Your `.env.local` has been updated to use the new key names:

```bash
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<local_dev_publishable_key>
SUPABASE_SECRET_KEY=<local_dev_secret_key>
```

### Why This Change?

Supabase is migrating all projects to the new key format by **October 2025**. Benefits include:

- ✅ Easier key rotation
- ✅ Better security practices
- ✅ Clearer naming (publishable vs. secret)
- ✅ Improved audit logging

### Need Help?

- **Vercel Docs**: [Environment Variables](https://vercel.com/docs/concepts/projects/environment-variables)
- **Supabase Docs**: [Understanding API Keys](https://supabase.com/docs/guides/api/api-keys)

---

**Status**: Follow the steps above to complete the migration. Your code is already updated! ✅
