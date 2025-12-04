// /covecrm-mobile/lib/voiceClient.ts
// Thin Twilio Voice client for CoveCRM mobile (OUTBOUND ONLY for now)

import { Platform } from "react-native";
import { API_BASE_URL } from "../config/api";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const TwilioVoice = require("@twilio/voice-react-native-sdk");

type VoiceModule = {
  register: (token: string) => Promise<void>;
  unregister: () => Promise<void>;
  connect: (opts: { params?: Record<string, string> }) => Promise<any>;
};

const tv: VoiceModule | null =
  TwilioVoice && typeof TwilioVoice.register === "function"
    ? (TwilioVoice as VoiceModule)
    : null;

let registeredToken: string | null = null;
let registering = false;
let activeCall: any = null;

// Mobile auth token from /api/mobile/login (JWT)
let mobileAuthToken: string | null = null;

/** Called from App.tsx after login/logout */
export function setMobileAuthToken(token: string | null) {
  mobileAuthToken = token;
}

/** Fetch a fresh Twilio Voice token from the web app. */
async function fetchVoiceToken(): Promise<string> {
  const url = `${API_BASE_URL}/api/twilio/voice/token`;

  const options: any = {
    method: "GET",
  };

  // For native mobile we don't have cookies; send Bearer mobile JWT
  if (mobileAuthToken) {
    options.headers = {
      Authorization: `Bearer ${mobileAuthToken}`,
    };
  }

  const res = await fetch(url, options);
  const json = await res.json().catch(() => ({}));

  if (!res.ok || !json?.token) {
    const msg =
      json?.message ||
      json?.error ||
      "Unable to fetch Twilio Voice access token.";
    throw new Error(msg);
  }

  return json.token as string;
}

/** Ensure the Twilio native module is present (i.e., not Expo Go). */
function assertTwilioAvailable() {
  if (!tv) {
    throw new Error(
      "Twilio Voice SDK not available in this build. Install @twilio/voice-react-native-sdk and run a dev/production build (not Expo Go).",
    );
  }
}

/** One-time registration per token. Safe to call repeatedly. */
export async function ensureVoiceRegistered(): Promise<void> {
  assertTwilioAvailable();

  if (registering) return;
  if (registeredToken) return;

  registering = true;
  try {
    const token = await fetchVoiceToken();
    await tv!.register(token);
    registeredToken = token;
    console.log("[voice] Twilio Voice registered on", Platform.OS);
  } finally {
    registering = false;
  }
}

/**
 * Start an outbound call from the mobile app using Twilio Voice.
 * `to` should be an E.164 number like +15551234567.
 */
export async function startOutboundCallFromMobile(opts: {
  to: string;
  onStatus?: (status: string) => void;
}): Promise<void> {
  const { to, onStatus } = opts;
  if (!to) {
    throw new Error("Missing destination phone number.");
  }

  assertTwilioAvailable();
  await ensureVoiceRegistered();

  try {
    onStatus?.("dialing");
    console.log("[voice] Connecting call to", to);

    // Twilio will send `To` into your TwiML app.
    activeCall = await tv!.connect({
      params: {
        To: to,
      },
    });

    onStatus?.("ringing");

    const safeOn = (ev: string, fn: (...a: any[]) => void) => {
      try {
        activeCall?.on?.(ev, fn);
      } catch {
        // ignore
      }
    };

    safeOn("connected", () => {
      console.log("[voice] connected");
      onStatus?.("connected");
    });

    safeOn("disconnected", () => {
      console.log("[voice] disconnected");
      activeCall = null;
      onStatus?.("disconnected");
    });

    safeOn("reconnecting", () => {
      console.log("[voice] reconnecting");
      onStatus?.("reconnecting");
    });

    safeOn("reconnected", () => {
      console.log("[voice] reconnected");
      onStatus?.("connected");
    });

    safeOn("failedToConnect", (e: any) => {
      console.log("[voice] failedToConnect", e);
      activeCall = null;
      onStatus?.("failed");
    });

    safeOn("callQualityWarningsChanged", () => {
      // optional - ignore for now
    });
  } catch (e: any) {
    console.error("[voice] startOutboundCallFromMobile error:", e);
    activeCall = null;
    throw e;
  }
}

/** Hang up the active call from mobile (optional future use). */
export async function hangupMobileCall(): Promise<void> {
  try {
    if (activeCall && typeof activeCall.disconnect === "function") {
      await activeCall.disconnect();
    }
  } catch (e) {
    console.warn("[voice] hangup error:", e);
  } finally {
    activeCall = null;
  }
}
