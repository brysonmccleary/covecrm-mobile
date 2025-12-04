// covecrm-mobile/App.tsx
import React, { useState, useEffect } from "react";
import {
  SafeAreaView,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Image,
  Linking,
  ScrollView,
} from "react-native";
import { API_BASE_URL, WEB_BASE_URL } from "./config/api";
import FoldersScreen from "./screens/FoldersScreen";
import LeadsScreen from "./screens/LeadsScreen";
import HomeScreen from "./screens/HomeScreen";
import ConversationsScreen from "./screens/ConversationsScreen";
import NumbersScreen from "./screens/NumbersScreen";
import { connectAndJoin, disconnectSocket } from "./lib/socketClient";
import {
  registerForPushNotificationsAsync,
  addNotificationResponseListener,
  getInitialNotificationData,
} from "./lib/notifications";
import { setMobileAuthToken } from "./lib/voiceClient";

type MobileUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  affiliateCode: string | null;
};

type LoginResponse =
  | { ok: true; token: string; user: MobileUser }
  | { ok: false; error: string };

type Screen =
  | "login"
  | "home"
  | "folders"
  | "leads"
  | "conversations"
  | "numbers";

type ConversationDeepLinkTarget = {
  kind: "conversation";
  fromPhone?: string | null;
  conversationId?: string | null;
  messageId?: string | null;
};

export default function App() {
  const [screen, setScreen] = useState<Screen>("login");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // mobile JWT from /api/mobile/login (used for API + push registration + Twilio Voice)
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<MobileUser | null>(null);

  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [activeFolderName, setActiveFolderName] = useState<string>("");

  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // 🔗 Deep link state for notification taps (e.g. open a specific conversation)
  const [deepLinkTarget, setDeepLinkTarget] =
    useState<ConversationDeepLinkTarget | null>(null);

  const handleLogin = async () => {
    setError(null);

    if (!email.trim() || !password) {
      setError("Email and password are required.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/mobile/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const json: LoginResponse = await res.json();

      if (!json.ok) {
        setError(json.error || "Login failed. Check your email/password.");
        setLoading(false);
        return;
      }

      // Store mobile JWT for API + Twilio Voice
      setToken(json.token);
      setMobileAuthToken(json.token);

      setUser(json.user);
      setScreen("home");

      // 🔌 Connect mobile socket and join the user's email room
      const userEmail = (json.user.email || "").toLowerCase();
      connectAndJoin(userEmail);

      setLoading(false);
    } catch (err: any) {
      setError(err?.message || "Network error.");
      setLoading(false);
    }
  };

  const handleLogout = () => {
    // 🔌 Cleanly disconnect the mobile socket on sign-out
    disconnectSocket();

    // Clear mobile auth for Twilio Voice
    setMobileAuthToken(null);

    setToken(null);
    setUser(null);
    setEmail("");
    setPassword("");
    setActiveFolderId(null);
    setActiveFolderName("");
    setScreen("login");
    setIsMenuOpen(false);
    setDeepLinkTarget(null);
  };

  // 🔔 Register this device for push notifications whenever we have a logged-in user + token
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!token || !user?.email) return;

      console.log("[push] Attempting registration for", user.email);

      const result = await registerForPushNotificationsAsync();
      if (!result) {
        console.log("[push] No push token (permissions denied or simulator)");
        return;
      }
      if (cancelled) return;

      try {
        const res = await fetch(
          `${API_BASE_URL}/api/mobile/notifications/register`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              // Backend extracts email from this JWT
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              expoPushToken: result.expoPushToken,
              platform: result.platform,
              deviceId: result.deviceId,
            }),
          },
        );

        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json.ok) {
          console.log(
            "[push] Device registration failed:",
            res.status,
            json?.error || json,
          );
        } else {
          console.log(
            "[push] Device registered for",
            user.email,
            json.device?._id,
          );
        }
      } catch (e: any) {
        console.log(
          "[push] Error calling /api/mobile/notifications/register:",
          e?.message || e,
        );
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [token, user?.email]);

  // 🔔 Handle notification taps & cold-start deep link into Conversations
  useEffect(() => {
    if (!token || !user?.email) {
      // Only process notifications once we know which user is logged in
      return;
    }

    console.log(
      "[push] Registering notification response listener + initial handler for",
      user.email,
    );

    const handleNotificationData = (data: any) => {
      try {
        if (!data) return;

        const type = data._type || data.type;
        if (type !== "incoming_sms") return;

        const fromPhone =
          typeof data.fromPhone === "string" ? data.fromPhone : null;
        const conversationId =
          typeof data.conversationId === "string" ? data.conversationId : null;
        const messageId =
          typeof data.messageId === "string" ? data.messageId : null;

        console.log(
          "[push] Notification (incoming_sms) → deep link",
          fromPhone,
          conversationId,
          messageId,
        );

        setDeepLinkTarget({
          kind: "conversation",
          fromPhone,
          conversationId,
          messageId,
        });

        // Jump directly to the Conversations screen
        setScreen("conversations");
        setIsMenuOpen(false);
      } catch (e) {
        console.warn("[push] Error handling notification data:", e);
      }
    };

    // Handle the notification that opened the app (cold start / background tap)
    getInitialNotificationData()
      .then((initial) => {
        if (initial) {
          console.log("[push] Initial notification data:", initial);
          handleNotificationData(initial);
        }
      })
      .catch((e) => {
        console.warn("[push] Error in getInitialNotificationData:", e);
      });

    // Also listen for taps while the app is running / in background
    const sub = addNotificationResponseListener(handleNotificationData);

    return () => {
      try {
        (sub as any)?.remove?.();
      } catch {
        // ignore
      }
    };
  }, [token, user?.email]);

  const openForgotPassword = () => {
    Linking.openURL(`${WEB_BASE_URL}/auth/forgot`).catch(() => {});
  };

  const openTerms = () => {
    Linking.openURL(`${WEB_BASE_URL}/legal/terms`).catch(() => {});
  };

  const openPrivacy = () => {
    Linking.openURL(`${WEB_BASE_URL}/legal/privacy`).catch(() => {});
  };

  const openMenu = () => setIsMenuOpen(true);
  const closeMenu = () => setIsMenuOpen(false);

  const navigateTo = (next: Screen) => {
    setScreen(next);
    closeMenu();
    // Navigating manually clears any pending deep link target
    if (next !== "conversations") {
      setDeepLinkTarget(null);
    }
  };

  // ---------- LOGIN SCREEN ----------
  if (!token) {
    return (
      <SafeAreaView style={styles.loginContainer}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.loginInner}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.loginContent}>
              <View style={styles.header}>
                <Image
                  source={{ uri: `${WEB_BASE_URL}/logo.png` }}
                  style={styles.logo}
                  resizeMode="contain"
                />
                <Text style={styles.heading}>Sign in to CoveCRM</Text>
                <Text style={styles.subheading}>
                  Welcome back — let&apos;s get you to your dashboard.
                </Text>
              </View>

              <View style={styles.card}>
                <Text style={styles.fieldLabel}>Email</Text>
                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  placeholder="you@example.com"
                  placeholderTextColor="rgba(191, 219, 254, 0.6)"
                />

                <Text style={styles.fieldLabel}>Password</Text>
                <TextInput
                  style={styles.input}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  placeholder="Your password"
                  placeholderTextColor="rgba(191, 219, 254, 0.6)"
                />

                <View style={styles.forgotRow}>
                  <TouchableOpacity onPress={openForgotPassword}>
                    <Text style={styles.forgotText}>Forgot your password?</Text>
                  </TouchableOpacity>
                </View>

                {error && <Text style={styles.errorText}>{error}</Text>}

                <TouchableOpacity
                  style={[styles.primaryButton, loading && styles.buttonDisabled]}
                  onPress={handleLogin}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <Text style={styles.primaryButtonText}>
                      Sign in with Email
                    </Text>
                  )}
                </TouchableOpacity>

                <Text style={styles.legalText}>
                  By continuing you agree to the{" "}
                  <Text style={styles.linkText} onPress={openTerms}>
                    Terms
                  </Text>{" "}
                  and{" "}
                  <Text style={styles.linkText} onPress={openPrivacy}>
                    Privacy Policy
                  </Text>
                  .
                </Text>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ---------- LOGGED-IN SCREENS ----------
  let content: React.ReactNode = null;

  if (screen === "home" && user) {
    content = (
      <HomeScreen
        user={user}
        onOpenMenu={openMenu}
        onGoToFolders={() => navigateTo("folders")}
        onGoToConversations={() => navigateTo("conversations")}
        onGoToNumbers={() => navigateTo("numbers")}
      />
    );
  } else if (screen === "folders") {
    content = (
      <FoldersScreen
        token={token}
        onOpenMenu={openMenu}
        onSelectFolder={({ id, name }) => {
          setActiveFolderId(id);
          setActiveFolderName(name);
          setScreen("leads");
        }}
        onLogout={handleLogout}
      />
    );
  } else if (screen === "leads" && activeFolderId) {
    content = (
      <LeadsScreen
        token={token}
        folderId={activeFolderId}
        folderName={activeFolderName}
        onOpenMenu={openMenu}
        onBack={() => {
          setScreen("folders");
        }}
        onLogout={handleLogout}
      />
    );
  } else if (screen === "conversations") {
    const deepLink =
      deepLinkTarget && deepLinkTarget.kind === "conversation"
        ? deepLinkTarget
        : null;

    content = (
      <ConversationsScreen
        token={token}
        userEmail={user?.email || ""}
        onOpenMenu={openMenu}
        onLogout={handleLogout}
        initialPhone={deepLink?.fromPhone || undefined}
        initialConversationId={deepLink?.conversationId || undefined}
        onClearInitialTarget={() => setDeepLinkTarget(null)}
      />
    );
  } else if (screen === "numbers") {
    content = (
      <NumbersScreen
        token={token}
        onOpenMenu={openMenu}
        onLogout={handleLogout}
      />
    );
  } else if (user) {
    // fallback if state gets weird: go home
    content = (
      <HomeScreen
        user={user}
        onOpenMenu={openMenu}
        onGoToFolders={() => navigateTo("folders")}
        onGoToConversations={() => navigateTo("conversations")}
        onGoToNumbers={() => navigateTo("numbers")}
      />
    );
  }

  return (
    <SafeAreaView style={styles.appContainer}>
      {content}

      {/* Slide-out sidebar (on the RIGHT) */}
      {isMenuOpen && (
        <View style={styles.sidebarContainer} pointerEvents="box-none">
          {/* Panel on the right */}
          <View style={styles.sidebarPanel}>
            <View style={styles.sidebarHeader}>
              <Image
                source={{ uri: `${WEB_BASE_URL}/logo.png` }}
                style={styles.sidebarLogo}
                resizeMode="contain"
              />
              <Text style={styles.sidebarTitle}>CoveCRM</Text>
              {user && (
                <Text style={styles.sidebarUserEmail}>
                  {user.email.toLowerCase()}
                </Text>
              )}
            </View>

            <View style={styles.sidebarNav}>
              <TouchableOpacity
                style={styles.sidebarItem}
                onPress={() => navigateTo("home")}
              >
                <Text style={styles.sidebarItemText}>Home</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.sidebarItem}
                onPress={() => navigateTo("folders")}
              >
                <Text style={styles.sidebarItemText}>Leads</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.sidebarItem}
                onPress={() => navigateTo("conversations")}
              >
                <Text style={styles.sidebarItemText}>Conversations</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.sidebarItem}
                onPress={() => navigateTo("numbers")}
              >
                <Text style={styles.sidebarItemText}>Numbers</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.sidebarItem}
                onPress={() => {
                  Linking.openURL(`${WEB_BASE_URL}/dial-session`).catch(
                    () => {},
                  );
                }}
              >
                <Text style={styles.sidebarItemText}>Dialer</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.sidebarItem}
                onPress={() => {
                  Linking.openURL(
                    `${WEB_BASE_URL}/dashboard?tab=calendar`,
                  ).catch(() => {});
                }}
              >
                <Text style={styles.sidebarItemText}>Calendar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.sidebarItem, styles.sidebarLogoutItem]}
                onPress={handleLogout}
              >
                <Text style={styles.sidebarLogoutText}>Log Out</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Backdrop on the LEFT */}
          <TouchableOpacity
            style={styles.sidebarBackdrop}
            activeOpacity={1}
            onPress={closeMenu}
          />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },

  // Login screen
  loginContainer: {
    flex: 1,
    backgroundColor: "#0f172a",
  },
  loginInner: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 32,
  },
  loginContent: {
    width: "100%",
    maxWidth: 380,
  },
  header: {
    alignItems: "center",
    marginBottom: 24,
  },
  logo: {
    width: 120,
    height: 40,
    marginBottom: 12,
  },
  heading: {
    fontSize: 22,
    fontWeight: "700",
    color: "#ffffff",
    marginBottom: 4,
  },
  subheading: {
    fontSize: 13,
    color: "rgba(191, 219, 254, 0.9)",
    textAlign: "center",
  },
  card: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(96, 165, 250, 0.3)",
    backgroundColor: "rgba(15, 23, 42, 0.85)",
    padding: 20,
  },
  fieldLabel: {
    marginTop: 8,
    marginBottom: 4,
    fontSize: 13,
    color: "rgba(191, 219, 254, 0.95)",
  },
  input: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(96, 165, 250, 0.4)",
    backgroundColor: "rgba(15, 23, 42, 0.8)",
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: "#e5e7eb",
    fontSize: 14,
  },
  forgotRow: {
    marginTop: 6,
    marginBottom: 4,
    alignItems: "flex-end",
  },
  forgotText: {
    fontSize: 12,
    color: "rgba(191, 219, 254, 0.9)",
    textDecorationLine: "underline",
  },
  primaryButton: {
    marginTop: 16,
    borderRadius: 10,
    backgroundColor: "#3b82f6",
    paddingVertical: 10,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#ffffff",
    fontWeight: "600",
    fontSize: 15,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  errorText: {
    color: "#fca5a5",
    marginTop: 8,
    fontSize: 12,
  },
  legalText: {
    marginTop: 14,
    fontSize: 11,
    color: "rgba(191, 219, 254, 0.75)",
    textAlign: "center",
  },
  linkText: {
    textDecorationLine: "underline",
    color: "#ffffff",
  },

  // App shell for logged-in screens
  appContainer: {
    flex: 1,
    backgroundColor: "#0f172a",
  },

  // Sidebar
  sidebarContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row-reverse", // panel on the RIGHT
  },
  sidebarBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  sidebarPanel: {
    width: 260,
    backgroundColor: "#020617",
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
  sidebarHeader: {
    marginBottom: 24,
  },
  sidebarLogo: {
    width: 40,
    height: 40,
    marginBottom: 8,
  },
  sidebarTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#ffffff",
  },
  sidebarUserEmail: {
    marginTop: 4,
    fontSize: 12,
    color: "#9ca3af",
  },
  sidebarNav: {
    flexGrow: 1,
  },
  sidebarItem: {
    paddingVertical: 10,
  },
  sidebarItemText: {
    fontSize: 15,
    color: "#e5e7eb",
    fontWeight: "500",
  },
  sidebarLogoutItem: {
    marginTop: 24,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#1f2937",
  },
  sidebarLogoutText: {
    marginTop: 12,
    fontSize: 15,
    color: "#fca5a5",
    fontWeight: "600",
  },
});
