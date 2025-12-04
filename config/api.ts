// covecrm-mobile/config/api.ts

// Toggle this if you ever want to point the mobile app
// back at your local Next.js dev server instead of the live site.
const USE_LOCAL_API = false; // set to true when you want to use your LAN IP

// Local dev server (when running `next dev` on your Mac).
// Make sure this matches your current Wi-Fi IP + port 3000.
const LOCAL_API = "http://192.168.0.238:3000";

// Live deployed backend (works anywhere, no dev server needed).
const PROD_API = "https://www.covecrm.com";

// Base URL for hitting your Next.js backend.
export const API_BASE_URL = USE_LOCAL_API ? LOCAL_API : PROD_API;

// Web base (for forgot-password, legal links, etc.)
export const WEB_BASE_URL = PROD_API;
