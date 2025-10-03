# Facebook Pixel Setup Guide

This guide explains how to configure Facebook Pixel tracking for credit purchases on Printed Edges.

## What's Tracked

The Facebook Pixel integration tracks the following events:

1. **PageView** - Automatically tracked on every page load
2. **InitiateCheckout** - Tracked when user clicks "Get Credits" button on pricing page
3. **Purchase** - Tracked when credit purchase is successfully completed

## Setup Instructions

### 1. Get Your Facebook Pixel ID

1. Go to [Facebook Events Manager](https://business.facebook.com/events_manager)
2. Select your Pixel or create a new one
3. Copy your Pixel ID (it's a number like `1234567890123456`)

### 2. Add Pixel ID to Environment Variables

Add the following to your `.env.local` file (for local development):

```bash
NEXT_PUBLIC_FACEBOOK_PIXEL_ID=your_pixel_id_here
```

Add the same variable to your production environment (Vercel, etc.):

```bash
NEXT_PUBLIC_FACEBOOK_PIXEL_ID=your_production_pixel_id
```

### 3. Verify Installation

1. Install the [Facebook Pixel Helper](https://chrome.google.com/webstore/detail/facebook-pixel-helper) Chrome extension
2. Visit your website
3. Click the extension icon - you should see your Pixel ID and active events

### 4. Test Purchase Tracking

1. Go to `/pricing` page
2. Click "Get Credits" button - should fire `InitiateCheckout` event
3. Complete a test purchase (use Stripe test mode)
4. After redirect to dashboard - should fire `Purchase` event with:
   - Value: Purchase amount ($39 or $99)
   - Currency: USD
   - Content name: Credit package name
   - Content IDs: Product ID

## Purchase Event Data

The Purchase event includes:

```javascript
{
  value: 39 | 99,           // Purchase amount
  currency: 'USD',
  content_name: '1 Edge Design Credit' | '3 Edge Design Credits',
  content_type: 'product',
  content_ids: ['single_image' | 'three_images'],
  num_items: 1 | 3          // Number of credits
}
```

## Files Modified

- `lib/facebook-pixel.ts` - Pixel utility functions
- `components/facebook-pixel.tsx` - Pixel component with tracking script
- `app/layout.tsx` - Added Pixel component to root layout
- `components/dashboard-content.tsx` - Purchase event tracking
- `app/pricing/page.tsx` - InitiateCheckout event tracking

## Troubleshooting

### Pixel not loading

- Check that `NEXT_PUBLIC_FACEBOOK_PIXEL_ID` is set correctly
- The variable MUST start with `NEXT_PUBLIC_` to be available in the browser
- Restart your dev server after adding the environment variable

### Events not firing

- Open browser console and check for errors
- Use Facebook Pixel Helper extension to see real-time events
- Check Facebook Events Manager > Test Events for debugging

### Purchase value is 0

- Verify the credit amount in the URL matches the pricing (1 credit = $39, 3 credits = $99)
- Check browser console for any tracking errors

## Privacy Considerations

- The pixel only tracks events, not personal information
- Make sure your Privacy Policy mentions Facebook Pixel tracking
- Consider adding a cookie consent banner if required in your jurisdiction

## Additional Events (Optional)

You can track additional events by importing the utility functions:

```typescript
import { event, trackAddPaymentInfo } from '@/lib/facebook-pixel';

// Custom event
event('ViewContent', { content_name: 'Pricing Page' });

// Add payment info
trackAddPaymentInfo(99, 'USD');
```
