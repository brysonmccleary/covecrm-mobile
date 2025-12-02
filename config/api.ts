// covecrm-mobile/config/api.ts

// Base URL for hitting your Next.js backend.
// In dev we use your Mac's LAN IP so Expo Go on your phone can reach it.
// In production we use the live domain.
export const API_BASE_URL =
  __DEV__ ? "http://192.168.0.238:3000" : "https://www.covecrm.com";

// Web base (for forgot-password, legal links, etc.)
export const WEB_BASE_URL = "https://www.covecrm.com";
