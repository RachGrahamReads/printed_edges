import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { name, email, issue, userId, userEmail } = await req.json();

    // Basic validation
    if (!name || !email || !issue) {
      return NextResponse.json(
        { error: 'Name, email, and issue description are required' },
        { status: 400 }
      );
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Please provide a valid email address' },
        { status: 400 }
      );
    }

    // Create the email content
    const timestamp = new Date().toLocaleString('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    const emailSubject = `[Printed Edges] Help Report from ${name}`;
    const emailBody = `
New help report submitted:

From: ${name} (${email})
${userId ? `User ID: ${userId}` : 'Anonymous user'}
${userEmail && userEmail !== email ? `Account Email: ${userEmail}` : ''}
Submitted: ${timestamp}

Issue Description:
${issue}

---
This message was sent automatically from the Printed Edges help system.
    `.trim();

    // Use Resend API to send email
    const resendApiKey = process.env.RESEND_API_KEY;
    if (!resendApiKey) {
      console.error('RESEND_API_KEY environment variable is not set');
      return NextResponse.json(
        { error: 'Email service is not configured' },
        { status: 500 }
      );
    }

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Printed Edges Help <help@printededges.com>',
        to: ['hello@rachgrahamreads.com'],
        reply_to: email,
        subject: emailSubject,
        text: emailBody,
      }),
    });

    if (!resendResponse.ok) {
      const errorData = await resendResponse.text();
      console.error('Resend API error:', errorData);
      return NextResponse.json(
        { error: 'Failed to send email notification' },
        { status: 500 }
      );
    }

    const resendData = await resendResponse.json();
    console.log('Help report email sent successfully:', resendData.id);

    return NextResponse.json({
      success: true,
      message: 'Help report sent successfully'
    });

  } catch (error) {
    console.error('Error processing help report:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}