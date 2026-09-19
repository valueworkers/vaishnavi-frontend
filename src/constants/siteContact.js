const normalizeTelHref = (phone) => {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits ? `tel:+${digits.startsWith('91') ? digits : `91${digits}`}` : 'tel:';
};

const normalizeWhatsAppHref = (phone) => {
  const digits = String(phone || '').replace(/\D/g, '');
  const withCountry = digits.startsWith('91') ? digits : `91${digits}`;
  return digits ? `https://wa.me/${withCountry}` : 'https://wa.me/';
};

export const formatSitePhoneDisplay = (phone) => {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 10) {
    return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
  }
  if (digits.length === 12 && digits.startsWith('91')) {
    return `+${digits.slice(0, 2)} ${digits.slice(2, 7)} ${digits.slice(7)}`;
  }
  return String(phone || '').trim() || '9611235211';
};

export const SITE_PHONE = import.meta.env.VITE_CONTACT_PHONE || '9611235211';
export const SITE_PHONE_DISPLAY = formatSitePhoneDisplay(SITE_PHONE);
export const SITE_PHONE_TEL =
  import.meta.env.VITE_CONTACT_PHONE_TEL || normalizeTelHref(SITE_PHONE);
export const SITE_WHATSAPP_URL =
  import.meta.env.VITE_CONTACT_WHATSAPP_URL || normalizeWhatsAppHref(SITE_PHONE);
export const SITE_EMAIL = import.meta.env.VITE_CONTACT_EMAIL || 'connect@vaishnavimedicare.com';
export const SITE_FACEBOOK_URL =
  import.meta.env.VITE_FACEBOOK_URL || 'https://www.facebook.com/vaishnavimedicare';
export const SITE_INSTAGRAM_URL =
  import.meta.env.VITE_INSTAGRAM_URL || 'https://www.instagram.com/vaishnavimedicare';
