import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { stripe } from '@/lib/stripe';

export async function POST(req: NextRequest) {
  try {
    console.log('=== Payment Confirmation Started ===');

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      console.error('Authentication failed:', authError);
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    console.log('User authenticated:', user.id);

    const { sessionId, expectedCredits } = await req.json();
    console.log('Payment confirmation request:', { sessionId, expectedCredits, userId: user.id });

    if (!sessionId || !expectedCredits) {
      console.error('Missing required parameters:', { sessionId: !!sessionId, expectedCredits: !!expectedCredits });
      return NextResponse.json(
        { error: 'Session ID and expected credits are required' },
        { status: 400 }
      );
    }

    // Verify the Stripe session exists and belongs to this user
    let session;
    try {
      session = await stripe.checkout.sessions.retrieve(sessionId);
    } catch (stripeError) {
      console.error('Failed to retrieve Stripe session:', stripeError);
      return NextResponse.json(
        { error: 'Invalid payment session' },
        { status: 400 }
      );
    }

    // Verify session metadata matches
    if (session.metadata?.user_id !== user.id) {
      return NextResponse.json(
        { error: 'Payment session does not belong to current user' },
        { status: 403 }
      );
    }

    if (session.payment_status !== 'paid') {
      return NextResponse.json(
        { error: 'Payment not completed' },
        { status: 400 }
      );
    }

    const sessionCredits = parseInt(session.metadata?.credits || '0');
    if (sessionCredits !== expectedCredits) {
      return NextResponse.json(
        { error: 'Credit amount mismatch' },
        { status: 400 }
      );
    }

    const serviceSupabase = createServiceRoleClient();

    // Check if credits were already granted for this session
    const { data: existingPurchase } = await serviceSupabase
      .from('purchases')
      .select('status')
      .eq('stripe_session_id', sessionId)
      .single();

    if (existingPurchase?.status === 'completed') {
      return NextResponse.json({
        success: true,
        message: 'Credits already granted for this payment',
        alreadyProcessed: true
      });
    }

    // Update purchase record if it exists
    const { error: purchaseError } = await serviceSupabase
      .from('purchases')
      .update({
        status: 'completed',
        stripe_payment_intent_id: session.payment_intent as string,
        completed_at: new Date().toISOString(),
      })
      .eq('stripe_session_id', sessionId);

    if (purchaseError) {
      console.error('Error updating purchase:', purchaseError);
    }

    // Grant credits using the RPC function
    console.log(`Attempting to grant ${sessionCredits} credits to user ${user.id}`);
    const { error: creditError } = await serviceSupabase.rpc('grant_credits', {
      p_user_id: user.id,
      p_credits: sessionCredits,
      p_purchase_id: null,
    });

    if (creditError) {
      console.error('Error granting credits:', {
        error: creditError,
        userId: user.id,
        credits: sessionCredits,
        sessionId
      });
      return NextResponse.json(
        { error: 'Failed to grant credits', details: creditError },
        { status: 500 }
      );
    }

    console.log(`Successfully called grant_credits RPC for user ${user.id}`);


    // Get updated credit balance
    const { data: updatedCredits } = await serviceSupabase
      .from('user_credits')
      .select('total_credits, used_credits')
      .eq('user_id', user.id)
      .single();

    console.log(`Successfully granted ${sessionCredits} credits to user ${user.id} via manual confirmation`);
    console.log('Updated credit balance:', updatedCredits);
    console.log('=== Payment Confirmation Completed Successfully ===');

    return NextResponse.json({
      success: true,
      creditsGranted: sessionCredits,
      newBalance: updatedCredits ? {
        total: updatedCredits.total_credits,
        used: updatedCredits.used_credits,
        available: updatedCredits.total_credits - updatedCredits.used_credits
      } : null
    });

  } catch (error) {
    console.error('Error confirming payment success:', error);
    return NextResponse.json(
      { error: 'Failed to confirm payment success' },
      { status: 500 }
    );
  }
}