import { createClient } from '@/lib/supabase/server';
import { User } from '@supabase/supabase-js';

/**
 * Check if a user is an admin based on their email and database flag
 */
export async function isUserAdmin(user: User | null): Promise<boolean> {
  if (!user) return false;

  // Check environment variable for admin emails
  const adminEmails = process.env.ADMIN_EMAILS?.split(',').map(email => email.trim().toLowerCase()) || [];
  const isAdminByEmail = adminEmails.includes(user.email?.toLowerCase() || '');

  // If user is admin by email but not in database, update database
  if (isAdminByEmail) {
    const supabase = await createClient();

    // Check current admin status in database
    const { data: userData } = await supabase
      .from('users')
      .select('is_admin')
      .eq('id', user.id)
      .single();

    // If user exists but not marked as admin, update them
    if (userData && !userData.is_admin) {
      await supabase
        .from('users')
        .update({ is_admin: true })
        .eq('id', user.id);
    }

    return true;
  }

  // Check database for admin status
  const supabase = await createClient();
  const { data: userData } = await supabase
    .from('users')
    .select('is_admin')
    .eq('id', user.id)
    .single();

  return userData?.is_admin === true;
}

/**
 * Middleware to check if current user is admin
 * Throws error if not admin
 */
export async function requireAdmin(): Promise<User> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('Unauthorized - Login required');
  }

  const isAdmin = await isUserAdmin(user);
  if (!isAdmin) {
    throw new Error('Forbidden - Admin access required');
  }

  return user;
}

/**
 * Get admin user for client-side checks
 */
export async function getAdminUser(): Promise<User | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return null;

  const isAdmin = await isUserAdmin(user);
  return isAdmin ? user : null;
}