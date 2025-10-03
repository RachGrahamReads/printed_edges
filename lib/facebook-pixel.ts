// Facebook Pixel utility functions
// Add this to your .env.local: NEXT_PUBLIC_FACEBOOK_PIXEL_ID=your_pixel_id_here

export const FB_PIXEL_ID = process.env.NEXT_PUBLIC_FACEBOOK_PIXEL_ID;

declare global {
  interface Window {
    fbq: any;
    _fbq: any;
  }
}

export const pageview = () => {
  if (typeof window !== 'undefined' && window.fbq) {
    window.fbq('track', 'PageView');
  }
};

// Track a custom event
export const event = (name: string, options: Record<string, any> = {}) => {
  if (typeof window !== 'undefined' && window.fbq) {
    window.fbq('track', name, options);
  }
};

// Track a purchase event
export const trackPurchase = (value: number, currency: string = 'USD', options: Record<string, any> = {}) => {
  if (typeof window !== 'undefined' && window.fbq) {
    window.fbq('track', 'Purchase', {
      value,
      currency,
      ...options
    });
  }
};

// Track when user initiates checkout
export const trackInitiateCheckout = (value: number, currency: string = 'USD', options: Record<string, any> = {}) => {
  if (typeof window !== 'undefined' && window.fbq) {
    window.fbq('track', 'InitiateCheckout', {
      value,
      currency,
      ...options
    });
  }
};

// Track when user adds payment info
export const trackAddPaymentInfo = (value: number, currency: string = 'USD', options: Record<string, any> = {}) => {
  if (typeof window !== 'undefined' && window.fbq) {
    window.fbq('track', 'AddPaymentInfo', {
      value,
      currency,
      ...options
    });
  }
};
