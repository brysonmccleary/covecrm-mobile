// covecrm-mobile/screens/ConversationsScreen.tsx
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

export default function ConversationsScreen({
  token,
  userEmail,
  onOpenMenu,
  onLogout,
  initialPhone,
  initialConversationId,
  onClearInitialTarget,
}: ConversationsScreenProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loadingConvs, setLoadingConvs] = useState(false);
  const [convError, setConvError] = useState<string | null>(null);

  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [msgError, setMsgError] = useState<string | null>(null);
  const [input, setInput] = useState("");

  const scrollRef = useRef<ScrollView | null>(null);

  // Keep a ref to the latest conversations for change detection during polling
  const conversationsRef = useRef<Conversation[]>([]);
  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  // Banner for new inbound messages
  const [bannerConv, setBannerConv] = useState<Conversation | null>(null);
  const [bannerVisible, setBannerVisible] = useState(false);
  const bannerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasSelection = !!selectedConv;

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

    if (!fromPoll) {
      setLoadingConvs(true);
    }
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

          // Only care about inbound messages with unread count / unread flag
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

      // Only show banner for poll-based refreshes (not initial load)
      if (fromPoll && newestInbound) {
        showBannerForConversation(newestInbound);
      }
    } catch (err: any) {
      console.error("Conversations load failed", err);
      setConvError(err?.message || "Failed to load conversations.");
      setConversations([]);
    } finally {
      if (!fromPoll) {
        setLoadingConvs(false);
      }
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

      // mark as read server-side
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

    // Initial load (shows spinner)
    fetchConversations({ fromPoll: false });

    // Poll every 8 seconds for new inbound messages
    const intervalId = setInterval(() => {
      fetchConversations({ fromPoll: true });
    }, 8000);

    return () => clearInterval(intervalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

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

      // refresh conversations list to bump this to the top
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

    // Ensure we are connected & joined to the user's room
    const socket = connectAndJoin(trimmedEmail);
    if (!socket) return;

    const handleNewMessage = (message: any) => {
      const leadId = message?.leadId;
      if (!leadId) return;

      // If this message belongs to the currently-open thread, append it
      if (selectedConv?._id && leadId === selectedConv._id) {
        const msg: Message = {
          text: message.text,
          direction: message.direction,
          leadId,
          date: message.date || new Date().toISOString(),
        };
        setMessages((prev) => [...prev, msg]);

        if (message.direction === "inbound") {
          // Mirror web behavior: mark inbound unread as read for this thread
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

      // In all cases, refresh conversations so unread badge / banner stay accurate
      fetchConversations({ fromPoll: true });
    };

    const handleServerMessageNew = (payload: any) => {
      const leadId = payload?.leadId;

      // If this inbound is for the currently open thread, refresh it
      if (leadId && selectedConv?._id === leadId) {
        fetchMessages(leadId);
      }

      // Always refresh conversations list to pick up latest lastMessage/unread
      fetchConversations({ fromPoll: true });
    };

    socket.on("newMessage", handleNewMessage); // local echo & app-level updates
    socket.on("message:new", handleServerMessageNew); // server inbound

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
    // If we already have a selection, nothing to do
    if (selectedConv) return;

    // If nothing to target, bail
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
      if (onClearInitialTarget) {
        onClearInitialTarget();
      }
    }
  }, [
    conversations,
    selectedConv,
    initialConversationId,
    initialPhone,
    onClearInitialTarget,
  ]);

  // ------- RENDER -------

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* Header with menu button */}
      <View style={styles.headerRow}>
        <TouchableOpacity style={styles.menuButton} onPress={onOpenMenu}>
          <Text style={styles.menuText}>☰</Text>
        </TouchableOpacity>

        <Text style={styles.title}>Conversations</Text>
      </View>

      {/* New message banner */}
      {bannerVisible && bannerConv && (
        <TouchableOpacity
          style={styles.banner}
          activeOpacity={0.9}
          onPress={handleBannerPress}
        >
          <View style={styles.bannerTextContainer}>
            <Text style={styles.bannerTitle} numberOfLines={1}>
              New message from{" "}
              {bannerConv.name || bannerConv.phone || "Unknown"}
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

      {/* BODY: list + thread */}
      <View style={styles.body}>
        {/* LEFT: conversation list */}
        <View style={styles.listColumn}>
          {loadingConvs && (
            <View style={styles.centerBlock}>
              <ActivityIndicator />
              <Text style={styles.infoText}>Loading conversations…</Text>
            </View>
          )}

          {convError && !loadingConvs && (
            <View style={styles.centerBlock}>
              <Text style={styles.errorText}>{convError}</Text>
              <TouchableOpacity
                style={styles.buttonOutline}
                onPress={() => fetchConversations({ fromPoll: false })}
              >
                <Text style={styles.buttonOutlineText}>Retry</Text>
              </TouchableOpacity>
            </View>
          )}

          {!loadingConvs && !convError && conversations.length === 0 && (
            <View style={styles.centerBlock}>
              <Text style={styles.infoText}>No conversations yet.</Text>
            </View>
          )}

          {!loadingConvs && conversations.length > 0 && (
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

                const unreadCount =
                  conv.unreadCount ?? (conv.unread ? 1 : 0);

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
                        {conv.name || conv.phone || "Unknown"}
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
          )}
        </View>

        {/* RIGHT: chat thread */}
        <View style={styles.threadColumn}>
          {hasSelection ? (
            <>
              <View style={styles.threadHeader}>
                <Text style={styles.threadTitle} numberOfLines={1}>
                  {selectedConv?.name || selectedConv?.phone || "Conversation"}
                </Text>
                {selectedConv?.phone ? (
                  <Text style={styles.threadSub}>{selectedConv.phone}</Text>
                ) : null}
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

                  {/* input bar */}
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
            </>
          ) : (
            <View style={styles.centerBlock}>
              <Text style={styles.infoText}>
                Select a conversation to view messages.
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Logout */}
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

  body: {
    flex: 1,
    flexDirection: "row",
    gap: 12,
  },
  listColumn: {
    flex: 0.9,
    backgroundColor: "#020617",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(15,23,42,0.8)",
    paddingVertical: 8,
  },
  threadColumn: {
    flex: 1.4,
    marginLeft: 8,
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
  threadHeader: {
    paddingHorizontal: 12,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(55,65,81,0.8)",
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
    marginTop: 12,
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
