// /covecrm-mobile/screens/ConversationsScreen.tsx
import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { API_BASE_URL } from "../config/api";
import { connectAndJoin, getSocket } from "../lib/socketClient";
import { startOutboundCallFromMobile } from "../lib/voiceClient";

type Conversation = {
  _id: string;
  name: string;
  phone: string;
  lastMessage: string;
  lastMessageTime: string;
  unread?: boolean;
  unreadCount?: number;
  lastMessageDirection?: string | null;
};

type Message = {
  text: string;
  direction: "inbound" | "outbound" | "ai";
  leadId?: string;
  date?: string;
};

type ConversationsScreenProps = {
  token: string;
  userEmail: string;
  onOpenMenu: () => void;
  onLogout: () => void;

  // 🔗 Optional deep-linking props.
  // If provided, we will auto-select the matching conversation on load.
  initialPhone?: string;
  initialConversationId?: string;
  onClearInitialTarget?: () => void;
};

function normalizeDigits(p: string | undefined | null) {
  return (p || "").replace(/\D/g, "");
}

function toE164(p: string | undefined | null): string {
  const digits = normalizeDigits(p);
  if (!digits) return "";
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (p && p.trim().startsWith("+")) return p.trim();
  return `+${digits}`;
}

// Client-side safety: never display literal "SMS Lead"
function safeDisplayName(name: string | undefined, phone: string | undefined) {
  const trimmed = (name || "").trim();
  const isSmsLead = trimmed && trimmed.toLowerCase() === "sms lead";
  if (!trimmed || isSmsLead) {
    return (phone || "").trim() || "Unknown";
  }
  return trimmed;
}

export default function ConversationsScreen({
  token,
  userEmail,
  onOpenMenu,
  onLogout,
  initialPhone,
  initialConversationId,
  onClearInitialTarget,
}: ConversationsScreenProps) {
  // Conversations + errors
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loadingConvs, setLoadingConvs] = useState(false);
  const [convError, setConvError] = useState<string | null>(null);

  // Selection + messages + input
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [msgError, setMsgError] = useState<string | null>(null);
  const [input, setInput] = useState("");

  // Banner for new inbound messages
  const [bannerConv, setBannerConv] = useState<Conversation | null>(null);
  const [bannerVisible, setBannerVisible] = useState(false);

  const scrollRef = useRef<ScrollView | null>(null);
  const conversationsRef = useRef<Conversation[]>([]);
  const bannerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasSelection = !!selectedConv;

  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  const scrollToBottom = () => {
    scrollRef.current?.scrollToEnd({ animated: true });
  };

  const clearBannerTimeout = () => {
    if (bannerTimeoutRef.current) {
      clearTimeout(bannerTimeoutRef.current);
      bannerTimeoutRef.current = null;
    }
  };

  const showBannerForConversation = (conv: Conversation) => {
    if (!conv) return;
    setBannerConv(conv);
    setBannerVisible(true);
    clearBannerTimeout();
    bannerTimeoutRef.current = setTimeout(() => {
      setBannerVisible(false);
    }, 5000);
  };

  const handleBannerPress = () => {
    if (!bannerConv) return;
    const match =
      conversations.find((c) => c._id === bannerConv._id) || bannerConv;
    setSelectedConv(match);
    setBannerVisible(false);
  };

  useEffect(() => {
    return () => {
      clearBannerTimeout();
    };
  }, []);

  // ------- Fetch conversations (mobile endpoint, JWT auth) -------
  const fetchConversations = async (opts?: { fromPoll?: boolean }) => {
    const fromPoll = opts?.fromPoll === true;

    if (!fromPoll) setLoadingConvs(true);
    setConvError(null);

    try {
      const res = await fetch(
        `${API_BASE_URL}/api/mobile/message/conversations`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      if (!res.ok) {
        const text = await res.text();
        console.error("mobile/message/conversations error:", text);
        throw new Error("Failed to load conversations.");
      }

      const data = await res.json();
      const list: Conversation[] = Array.isArray(data)
        ? data
        : data.conversations || [];

      // Detect new inbound messages vs previous state
      const prevList = conversationsRef.current || [];
      let newestInbound: Conversation | null = null;

      if (fromPoll && prevList.length > 0) {
        const prevMap = new Map<string, Conversation>();
        for (const c of prevList) prevMap.set(c._id, c);

        for (const current of list) {
          const prev = prevMap.get(current._id);

          const isInbound =
            current.lastMessageDirection === "inbound" ||
            current.lastMessageDirection === "INBOUND";
          if (!isInbound) continue;

          const currUnread = current.unreadCount ?? (current.unread ? 1 : 0);
          const prevUnread = prev
            ? prev.unreadCount ?? (prev.unread ? 1 : 0)
            : 0;

          const currTime = current.lastMessageTime
            ? new Date(current.lastMessageTime).getTime()
            : 0;
          const prevTime = prev?.lastMessageTime
            ? new Date(prev.lastMessageTime).getTime()
            : 0;

          const gotNewUnread =
            currUnread > prevUnread && currTime >= prevTime;
          const isBrandNewConv = !prev && currUnread > 0;

          if (gotNewUnread || isBrandNewConv) {
            if (
              !newestInbound ||
              (currTime &&
                currTime >
                  (newestInbound.lastMessageTime
                    ? new Date(newestInbound.lastMessageTime).getTime()
                    : 0))
            ) {
              newestInbound = current;
            }
          }
        }
      }

      setConversations(list);

      if (fromPoll && newestInbound) {
        showBannerForConversation(newestInbound);
      }
    } catch (err: any) {
      console.error("Conversations load failed", err);
      setConvError(err?.message || "Failed to load conversations.");
      setConversations([]);
    } finally {
      if (!fromPoll) setLoadingConvs(false);
    }
  };

  // ------- Fetch messages for a selected conversation -------
  const fetchMessages = async (leadId: string) => {
    if (!leadId) return;
    setLoadingMessages(true);
    setMsgError(null);

    try {
      const res = await fetch(
        `${API_BASE_URL}/api/mobile/message/${encodeURIComponent(leadId)}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      if (!res.ok) {
        const text = await res.text();
        console.error("mobile/message/[leadId] error:", text);
        throw new Error("Failed to load messages.");
      }

      const data = await res.json();
      const list: Message[] = Array.isArray(data) ? data : data.messages || [];
      setMessages(list);

      try {
        await fetch(`${API_BASE_URL}/api/mobile/messages/mark-read`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ leadId }),
        });
      } catch (e) {
        console.warn("mark-read (mobile) failed", e);
      }
    } catch (err: any) {
      console.error("Messages load failed", err);
      setMsgError(err?.message || "Failed to load messages.");
      setMessages([]);
    } finally {
      setLoadingMessages(false);
    }
  };

  // Initial load + polling for new messages
  useEffect(() => {
    if (!token) return;

    fetchConversations({ fromPoll: false });

    const intervalId = setInterval(() => {
      fetchConversations({ fromPoll: true });
    }, 8000);

    return () => clearInterval(intervalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Load messages when selection changes
  useEffect(() => {
    if (selectedConv?._id) {
      fetchMessages(selectedConv._id);
    } else {
      setMessages([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedConv?._id]);

  useEffect(() => {
    scrollToBottom();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);

  const handleSelectConversation = (conv: Conversation) => {
    setSelectedConv(conv);
  };

  const handleBackFromThread = () => {
    setSelectedConv(null);
    setMessages([]);
    setMsgError(null);
  };

  const handleSend = async () => {
    if (!selectedConv || !input.trim()) return;

    const payload = {
      leadId: selectedConv._id,
      text: input.trim(),
      direction: "outbound" as const,
    };

    try {
      const res = await fetch(`${API_BASE_URL}/api/mobile/message`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        console.error("mobile/message send error:", data);
        throw new Error(data?.error || "Failed to send message.");
      }

      const msg: Message =
        data.message || data || { ...payload, date: new Date().toISOString() };

      setMessages((prev) => [...prev, msg]);
      setInput("");

      fetchConversations({ fromPoll: false });
    } catch (err: any) {
      console.error("Send message failed", err);
      setMsgError(err?.message || "Failed to send message.");
    }
  };

  // ------- Socket wiring for real-time updates -------
  useEffect(() => {
    const trimmedEmail = (userEmail || "").trim().toLowerCase();
    if (!trimmedEmail) return;

    const socket = connectAndJoin(trimmedEmail);
    if (!socket) return;

    const handleNewMessage = (message: any) => {
      const leadId = message?.leadId;
      if (!leadId) return;

      if (selectedConv?._id && leadId === selectedConv._id) {
        const msg: Message = {
          text: message.text,
          direction: message.direction,
          leadId,
          date: message.date || new Date().toISOString(),
        };
        setMessages((prev) => [...prev, msg]);

        if (message.direction === "inbound") {
          fetch(`${API_BASE_URL}/api/mobile/messages/mark-read`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ leadId }),
          }).catch(() => {});
        }
      }

      fetchConversations({ fromPoll: true });
    };

    const handleServerMessageNew = (payload: any) => {
      const leadId = payload?.leadId;

      if (leadId && selectedConv?._id === leadId) {
        fetchMessages(leadId);
      }

      fetchConversations({ fromPoll: true });
    };

    socket.on("newMessage", handleNewMessage);
    socket.on("message:new", handleServerMessageNew);

    return () => {
      const s = getSocket();
      if (!s) return;
      s.off("newMessage", handleNewMessage);
      s.off("message:new", handleServerMessageNew);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userEmail, selectedConv?._id, token]);

  // ------- Deep-link auto-selection -------
  useEffect(() => {
    if (selectedConv) return;
    if (!initialConversationId && !initialPhone) return;
    if (!conversations.length) return;

    let target: Conversation | undefined;

    if (initialConversationId) {
      target = conversations.find((c) => c._id === initialConversationId);
    }

    if (!target && initialPhone) {
      const targetDigits = normalizeDigits(initialPhone);
      const targetLast10 = targetDigits.slice(-10);
      if (targetLast10) {
        target = conversations.find((c) => {
          const cd = normalizeDigits(c.phone);
          return cd.endsWith(targetLast10);
        });
      }
    }

    if (target) {
      console.log(
        "[conversations] Deep-link selection:",
        target._id,
        target.phone,
      );
      setSelectedConv(target);
      if (onClearInitialTarget) onClearInitialTarget();
    }
  }, [
    conversations,
    selectedConv,
    initialConversationId,
    initialPhone,
    onClearInitialTarget,
  ]);

  // ------- Call button handler (Twilio Voice) -------
  const handleCallPress = async () => {
    if (!selectedConv?.phone) return;

    const e164 = toE164(selectedConv.phone);
    if (!e164) {
      setMsgError("This contact does not have a valid phone number.");
      return;
    }

    try {
      setMsgError(null);
      console.log("[mobile] Starting outbound call to", e164);
      await startOutboundCallFromMobile({
        to: e164,
        onStatus: (status) => {
          console.log("[mobile] call status:", status);
        },
      });
    } catch (err: any) {
      console.error("Mobile call failed:", err);
      setMsgError(err?.message || "Failed to start call.");
    }
  };

  // ------- RENDER -------

  const renderConversationList = () => {
    if (loadingConvs) {
      return (
        <View style={styles.centerBlock}>
          <ActivityIndicator />
          <Text style={styles.infoText}>Loading conversations…</Text>
        </View>
      );
    }

    if (convError) {
      return (
        <View style={styles.centerBlock}>
          <Text style={styles.errorText}>{convError}</Text>
          <TouchableOpacity
            style={styles.buttonOutline}
            onPress={() => fetchConversations({ fromPoll: false })}
          >
            <Text style={styles.buttonOutlineText}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (!conversations.length) {
      return (
        <View style={styles.centerBlock}>
          <Text style={styles.infoText}>No conversations yet.</Text>
        </View>
      );
    }

    return (
      <ScrollView
        style={styles.conversationList}
        contentContainerStyle={{ paddingBottom: 16 }}
      >
        {conversations.map((conv) => {
          const isActive = selectedConv?._id === conv._id;
          const timeLabel = conv.lastMessageTime
            ? new Date(conv.lastMessageTime).toLocaleTimeString([], {
                hour: "numeric",
                minute: "2-digit",
              })
            : "";

          const unreadCount = conv.unreadCount ?? (conv.unread ? 1 : 0);
          const displayName = safeDisplayName(conv.name, conv.phone);

          return (
            <TouchableOpacity
              key={conv._id}
              onPress={() => handleSelectConversation(conv)}
              style={[
                styles.conversationCard,
                isActive && styles.conversationCardActive,
              ]}
            >
              <View style={styles.convHeaderRow}>
                <Text style={styles.convName} numberOfLines={1}>
                  {displayName}
                </Text>

                {unreadCount > 0 && (
                  <View style={styles.unreadBadge}>
                    <Text style={styles.unreadBadgeText}>
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </Text>
                  </View>
                )}

                <Text style={styles.convTime}>{timeLabel}</Text>
              </View>
              <Text style={styles.convLastMessage} numberOfLines={1}>
                {conv.lastMessage || "No messages yet"}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    );
  };

  const renderThread = () => {
    if (!selectedConv) {
      return (
        <View style={styles.centerBlock}>
          <Text style={styles.infoText}>
            Select a conversation to view messages.
          </Text>
        </View>
      );
    }

    const displayName = safeDisplayName(
      selectedConv.name,
      selectedConv.phone,
    );
    const hasPhone =
      !!selectedConv.phone && normalizeDigits(selectedConv.phone).length >= 10;

    return (
      <View style={styles.threadContainer}>
        {/* iMessage-style header with Back + Call */}
        <View style={styles.threadHeaderRow}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={handleBackFromThread}
          >
            <Text style={styles.backIcon}>‹</Text>
            <Text style={styles.backText}>Conversations</Text>
          </TouchableOpacity>

          <View style={styles.threadTitleBlock}>
            <Text style={styles.threadTitle} numberOfLines={1}>
              {displayName}
            </Text>
            {selectedConv.phone ? (
              <Text style={styles.threadSub}>{selectedConv.phone}</Text>
            ) : null}
          </View>

          {hasPhone && (
            <TouchableOpacity
              style={styles.callButton}
              onPress={handleCallPress}
            >
              <Text style={styles.callIcon}>📞</Text>
            </TouchableOpacity>
          )}
        </View>

        {loadingMessages && (
          <View style={styles.centerBlock}>
            <ActivityIndicator />
            <Text style={styles.infoText}>Loading messages…</Text>
          </View>
        )}

        {msgError && !loadingMessages && (
          <View style={styles.centerBlock}>
            <Text style={styles.errorText}>{msgError}</Text>
          </View>
        )}

        {!loadingMessages && !msgError && (
          <>
            <ScrollView
              style={styles.messagesList}
              contentContainerStyle={{ paddingBottom: 12 }}
              ref={scrollRef}
            >
              {messages.map((msg, idx) => {
                const isSent =
                  msg.direction === "outbound" || msg.direction === "ai";
                const bubbleStyle = isSent
                  ? [styles.bubble, styles.bubbleSent]
                  : [styles.bubble, styles.bubbleReceived];

                return (
                  <View
                    key={`${idx}-${msg.date || ""}`}
                    style={[
                      styles.bubbleRow,
                      isSent
                        ? styles.bubbleRowSent
                        : styles.bubbleRowReceived,
                    ]}
                  >
                    <View style={bubbleStyle}>
                      <Text style={styles.bubbleText}>{msg.text}</Text>
                    </View>
                  </View>
                );
              })}
            </ScrollView>

            <View style={styles.inputRow}>
              <TextInput
                style={styles.textInput}
                placeholder="Type your message…"
                placeholderTextColor="rgba(156,163,175,0.8)"
                value={input}
                onChangeText={setInput}
                onSubmitEditing={handleSend}
                returnKeyType="send"
              />
              <TouchableOpacity
                style={[
                  styles.sendButton,
                  !input.trim() && styles.sendButtonDisabled,
                ]}
                onPress={handleSend}
                disabled={!input.trim()}
              >
                <Text style={styles.sendButtonText}>Send</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {!hasSelection ? (
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.menuButton} onPress={onOpenMenu}>
            <Text style={styles.menuText}>☰</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Conversations</Text>
        </View>
      ) : null}

      {bannerVisible && bannerConv && (
        <TouchableOpacity
          style={styles.banner}
          activeOpacity={0.9}
          onPress={handleBannerPress}
        >
          <View style={styles.bannerTextContainer}>
            <Text style={styles.bannerTitle} numberOfLines={1}>
              New message from{" "}
              {safeDisplayName(bannerConv.name, bannerConv.phone)}
            </Text>
            {bannerConv.lastMessage ? (
              <Text style={styles.bannerBody} numberOfLines={1}>
                {bannerConv.lastMessage}
              </Text>
            ) : null}
          </View>
          <Text style={styles.bannerAction}>View</Text>
        </TouchableOpacity>
      )}

      <View style={styles.bodySingle}>
        {!hasSelection ? renderConversationList() : renderThread()}
      </View>

      <TouchableOpacity style={styles.logoutButton} onPress={onLogout}>
        <Text style={styles.logoutText}>Log Out</Text>
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f172a",
    paddingHorizontal: 16,
    paddingTop: 24,
  },

  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  menuButton: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#60a5fa",
    marginRight: 10,
  },
  menuText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#bfdbfe",
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#ffffff",
  },

  // Banner
  banner: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 8,
    backgroundColor: "rgba(34,197,94,0.18)",
    borderWidth: 1,
    borderColor: "rgba(34,197,94,0.6)",
  },
  bannerTextContainer: {
    flex: 1,
    marginRight: 8,
  },
  bannerTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#bbf7d0",
  },
  bannerBody: {
    marginTop: 2,
    fontSize: 12,
    color: "#dcfce7",
  },
  bannerAction: {
    fontSize: 12,
    fontWeight: "700",
    color: "#bbf7d0",
  },

  // Single-column body (iPhone-style)
  bodySingle: {
    flex: 1,
    marginTop: 4,
    marginBottom: 8,
    backgroundColor: "#020617",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(15,23,42,0.8)",
    paddingVertical: 8,
  },

  centerBlock: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  infoText: {
    marginTop: 8,
    fontSize: 13,
    color: "#9ca3af",
    textAlign: "center",
  },
  errorText: {
    color: "#fca5a5",
    fontSize: 13,
    textAlign: "center",
  },
  buttonOutline: {
    marginTop: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#60a5fa",
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  buttonOutlineText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#bfdbfe",
  },

  conversationList: {
    flex: 1,
  },
  conversationCard: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(55,65,81,0.6)",
  },
  conversationCardActive: {
    backgroundColor: "#1e293b",
  },
  convHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 2,
  },
  convName: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: "#ffffff",
    marginRight: 8,
  },
  convTime: {
    fontSize: 11,
    color: "#9ca3af",
    marginLeft: 8,
  },
  convLastMessage: {
    fontSize: 12,
    color: "#cbd5f5",
  },
  unreadBadge: {
    minWidth: 20,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: "#ef4444",
    alignItems: "center",
    justifyContent: "center",
  },
  unreadBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#ffffff",
  },

  // Thread (chat) view
  threadContainer: {
    flex: 1,
  },
  threadHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(55,65,81,0.8)",
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: 12,
    paddingVertical: 4,
    paddingRight: 8,
    paddingLeft: 0,
  },
  backIcon: {
    fontSize: 24,
    color: "#60a5fa",
    marginRight: 2,
  },
  backText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#60a5fa",
  },
  threadTitleBlock: {
    flex: 1,
  },
  threadTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#ffffff",
  },
  threadSub: {
    marginTop: 2,
    fontSize: 12,
    color: "#9ca3af",
  },

  callButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#22c55e",
    marginLeft: 8,
  },
  callIcon: {
    fontSize: 16,
    fontWeight: "700",
    color: "#ffffff",
  },

  messagesList: {
    flex: 1,
    paddingHorizontal: 10,
    marginTop: 6,
  },
  bubbleRow: {
    marginVertical: 4,
    flexDirection: "row",
  },
  bubbleRowSent: {
    justifyContent: "flex-end",
  },
  bubbleRowReceived: {
    justifyContent: "flex-start",
  },
  bubble: {
    maxWidth: "75%",
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  bubbleSent: {
    backgroundColor: "#22c55e",
  },
  bubbleReceived: {
    backgroundColor: "#1e293b",
  },
  bubbleText: {
    fontSize: 13,
    color: "#ffffff",
  },

  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(55,65,81,0.8)",
  },
  textInput: {
    flex: 1,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(75,85,99,0.9)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: "#e5e7eb",
    fontSize: 14,
    backgroundColor: "#020617",
    marginRight: 8,
  },
  sendButton: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: "#22c55e",
    alignItems: "center",
    justifyContent: "center",
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  sendButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#ffffff",
  },

  logoutButton: {
    marginTop: 4,
    marginBottom: 12,
    alignSelf: "stretch",
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#ffffff",
    alignItems: "center",
  },
  logoutText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#ffffff",
  },
});
