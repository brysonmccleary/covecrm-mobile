// covecrm-mobile/lib/socketClient.ts
// Mobile Socket.IO client for CoveCRM.
// Mirrors the web client behavior but avoids window/document usage.

import { io, type Socket } from "socket.io-client";

declare global {
  // eslint-disable-next-line no-var
  var __crm_mobile_socket__: Socket | null | undefined;
  // eslint-disable-next-line no-var
  var __crm_mobile_socket_email__: string | null | undefined;
}

/**
 * Resolve the socket endpoint for mobile.
 * Prefers EXPO/Next public envs, falls back to Render service.
 */
function resolveEndpoint() {
  const baseEnv = (
    process.env.EXPO_PUBLIC_SOCKET_URL ||
    process.env.NEXT_PUBLIC_SOCKET_URL ||
    ""
  )
    .trim()
    .replace(/\/$/, "");

  const pathEnvRaw =
    (process.env.EXPO_PUBLIC_SOCKET_PATH ||
      process.env.NEXT_PUBLIC_SOCKET_PATH ||
      "") || "";
  const pathEnv = pathEnvRaw.trim();
  const path =
    pathEnv.length > 0
      ? pathEnv.endsWith("/")
        ? pathEnv
        : pathEnv + "/"
      : "/socket/";

  if (baseEnv) {
    return { base: baseEnv, path };
  }

  // Default: same Render socket service as web
  return {
    base: "https://covecrm.onrender.com",
    path: "/socket/",
  };
}

function createClient(): Socket {
  const { base, path } = resolveEndpoint();

  const socket = io(base, {
    path,
    transports: ["websocket", "polling"],
    withCredentials: true,
    forceNew: false,
    autoConnect: false,
  });

  socket.on("connect_error", (err: any) => {
    console.error("[mobile socket] connect_error:", err?.message || err);
  });

  socket.on("error", (err: any) => {
    console.error("[mobile socket] error:", err);
  });

  socket.on("connect", () => {
    const email = (global as any).__crm_mobile_socket_email__;
    if (email) {
      socket.emit("join", String(email).toLowerCase());
    }
  });

  return socket;
}

/** Get or build the singleton client instance. */
export function getSocket(): Socket | null {
  if (!global) return null as any;
  if (!global.__crm_mobile_socket__) {
    global.__crm_mobile_socket__ = createClient();
  }
  return (global.__crm_mobile_socket__ as Socket) ?? null;
}

/** Connect and join the user's email room. Safe to call repeatedly. */
export function connectAndJoin(userEmail?: string | null): Socket | null {
  const socket = getSocket();
  if (!socket) return null;

  const normalized = (userEmail || "").trim().toLowerCase();
  (global as any).__crm_mobile_socket_email__ = normalized || null;

  if (!socket.connected) {
    socket.connect();
  }
  if (normalized) {
    socket.emit("join", normalized);
  }

  return socket;
}

/** Cleanly disconnect (call on logout). */
export function disconnectSocket() {
  const socket = getSocket();
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
  }
  (global as any).__crm_mobile_socket__ = null;
  (global as any).__crm_mobile_socket_email__ = null;
}
