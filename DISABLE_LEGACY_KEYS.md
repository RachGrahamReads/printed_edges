# Disable Legacy Supabase Keys

## Critical: 3 Compromised Legacy Keys Found

Your public GitHub repository exposed **3 different** legacy service role keys:
1. `eyJhbGci...fEfh4` (generated Sept 2024)
2. `eyJhbGci...CG7pxI` (generated Dec 2024)
3. `eyJhbGci...FhZ6I` (generated May 2025)

All three are in GitHub's permanent history and must be disabled.

## Solution: Disable All Legacy Keys

Since you've migrated to the new publishable/secret key format, you can **disable all legacy keys**.

### Steps to Disable Legacy Keys

1. **Go to Supabase Dashboard**:
   - Visit: https://supabase.com/dashboard/project/gsndpkiedjojlqpjdwgu/settings/api

2. **Find "JWT Settings" or "Legacy API Keys"** section

3. **Disable Legacy Keys**:
   - Look for toggles to disable:
     - Legacy `anon` key
     - Legacy `service_role` key
   - Turn both OFF

4. **Verify New Keys Are Active**:
   - Confirm your new keys are enabled:
     - ✅ Publishable Key: `sb_publishable_ehcNBRUp5rbO90kkM3CNuQ_v4c799cO`
     - ✅ Secret Key: `sb_secret_f8wCkTyTpb10CslP31TR-A_4vMA6R3K`

### Why This Is Safe

- ✅ Your code has been updated to use the new keys
- ✅ Vercel will use the new keys (once you update env vars)
- ✅ Local development uses the new key names
- ❌ Old legacy keys will be completely disabled

### After Disabling

Once you disable the legacy keys:
1. ✅ All 3 compromised keys become useless
2. ✅ Anyone with the old keys can't access your database
3. ✅ Your app continues working with new keys
4. ✅ Close GitHub security alerts as "Revoked"

### GitHub Security Alert Response

When closing the 3 GitHub alerts, select:
- **Reason**: Revoked
- **Comment**: "Legacy JWT keys disabled in Supabase dashboard. Migrated to new publishable/secret key format."

---

**Status**: Disable legacy keys after updating Vercel environment variables.
