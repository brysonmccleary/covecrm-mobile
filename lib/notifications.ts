// covecrm-mobile/lib/notifications.ts
// Expo notifications helper for CoveCRM mobile.
// Handles permission request + Expo push token registration.

import { Platform } from "react-native";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";

// Ensure notifications show like normal alerts when app is foregrounded
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export type PushRegistrationResult = {
  expoPushToken: string;
  platform: "ios" | "android" | "unknown";
  deviceId?: string;
};

/**
 * Listen for when the user taps on a notification.
 * We pass the notification `data` object to your handler.
 */
export function addNotificationResponseListener(handler: (data: any) => void) {
  const sub = Notifications.addNotificationResponseReceivedListener(
    (response) => {
      const data = response.notification.request.content.data as any;
      try {
        handler?.(data);
      } catch (e) {
        console.warn("[push] Error in notification response handler:", e);
      }
    },
  );

  return sub;
}

/**
 * Get the data for the notification that opened the app
 * (e.g., user tapped a notification while app was killed/backgrounded).
 */
export async function getInitialNotificationData(): Promise<any | null> {
  try {
    const last = await Notifications.getLastNotificationResponseAsync();
    if (!last) return null;
    return last.notification.request.content.data as any;
  } catch (e) {
    console.warn("[push] Error getting initial notification data:", e);
    return null;
  }
}

/**
 * Ask for notification permission and return an Expo push token.
 * Returns null if:
 * - running on simulator
 * - permissions denied
 * - missing projectId
 * - any error occurs
 */
export async function registerForPushNotificationsAsync(): Promise<PushRegistrationResult | null> {
  try {
    const isPhysicalDevice = Device.isDevice;
    if (!isPhysicalDevice) {
      console.log("[push] Not a physical device; skipping push registration");
      return null;
    }

    // ---- Resolve Expo projectId (required in bare / custom client) ----
    const projectIdFromConstants =
      (Constants as any)?.expoConfig?.extra?.eas?.projectId ||
      (Constants as any)?.easConfig?.projectId ||
      undefined;

    if (!projectIdFromConstants) {
      console.warn(
        "[push] No Expo projectId found; skipping push token registration for now.",
      );
      return null;
    }

    // Check current permissions
    const existingStatus = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus.status;

    // Ask if not already granted
    if (existingStatus.status !== "granted") {
      const requestStatus = await Notifications.requestPermissionsAsync();
      finalStatus = requestStatus.status;
    }

    if (finalStatus !== "granted") {
      console.log("[push] Notification permissions not granted");
      return null;
    }

    // Android: configure default channel so it behaves like "normal" notifications
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "Default",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#ffffff",
        sound: "default",
      });
    }

    console.log("[push] Starting push registration…");

    // Get Expo push token
    const tokenResponse = await Notifications.getExpoPushTokenAsync({
      projectId: projectIdFromConstants,
    });

    const expoPushToken = tokenResponse.data;
    console.log("[push] Expo push token:", expoPushToken);

    if (!expoPushToken) {
      console.warn("[push] Failed to obtain Expo push token");
      return null;
    }

    const platform: "ios" | "android" | "unknown" =
      Platform.OS === "ios"
        ? "ios"
        : Platform.OS === "android"
        ? "android"
        : "unknown";

    // Simple device identifier to help dedupe devices per user
    const deviceId =
      (Device.osInternalBuildId as string | undefined) ||
      (Device.osBuildId as string | undefined) ||
      undefined;

    console.log("[push] Registration successful", {
      platform,
      hasDeviceId: !!deviceId,
    });

    return {
      expoPushToken,
      platform,
      deviceId,
    };
  } catch (err) {
    console.error("[push] Error during registration:", err);
    return null;
  }
}
