// covecrm-mobile/screens/HomeScreen.tsx
import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Linking,
} from "react-native";
import { WEB_BASE_URL } from "../config/api";

type HomeScreenProps = {
  user: {
    name: string;
    email: string;
  };
  onOpenMenu: () => void;
  onGoToFolders: () => void;
  onGoToConversations: () => void;
  onGoToNumbers: () => void; // NEW
};

export default function HomeScreen({
  user,
  onOpenMenu,
  onGoToFolders,
  onGoToConversations,
  onGoToNumbers,
}: HomeScreenProps) {
  const firstName = user?.name?.split(" ")[0] || "there";

  const openWeb = (path: string) => {
    const url = `${WEB_BASE_URL}${path}`;
    Linking.openURL(url).catch(() => {});
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.headerRow}>
        <TouchableOpacity style={styles.hamburger} onPress={onOpenMenu}>
          <Text style={styles.hamburgerLine}>≡</Text>
        </TouchableOpacity>
        <View>
          <Text style={styles.title}>Dashboard</Text>
          <Text style={styles.subTitle}>Welcome back, {firstName}</Text>
        </View>
      </View>

      {/* Cards */}
      <View style={styles.cards}>
        {/* Leads → native flow */}
        <TouchableOpacity style={styles.card} onPress={onGoToFolders}>
          <Text style={styles.cardTitle}>Leads</Text>
          <Text style={styles.cardText}>
            View your lead folders and start working your pipeline.
          </Text>
        </TouchableOpacity>

        {/* Conversations → native ConversationsScreen */}
        <TouchableOpacity style={styles.card} onPress={onGoToConversations}>
          <Text style={styles.cardTitle}>Conversations</Text>
          <Text style={styles.cardText}>
            View SMS threads and reply to leads from your phone.
          </Text>
        </TouchableOpacity>

        {/* Numbers → native NumbersScreen */}
        <TouchableOpacity style={styles.card} onPress={onGoToNumbers}>
          <Text style={styles.cardTitle}>Numbers</Text>
          <Text style={styles.cardText}>
            Buy and manage your CoveCRM phone numbers from your phone.
          </Text>
        </TouchableOpacity>

        {/* Dialer → web dial session (for now) */}
        <TouchableOpacity
          style={styles.card}
          onPress={() => openWeb("/dial-session")}
        >
          <Text style={styles.cardTitle}>Dialer</Text>
          <Text style={styles.cardText}>
            Power dial sessions from your phone. (Opens web dialer)
          </Text>
        </TouchableOpacity>

        {/* Calendar → web calendar tab (for now) */}
        <TouchableOpacity
          style={styles.card}
          onPress={() => openWeb("/dashboard?tab=calendar")}
        >
          <Text style={styles.cardTitle}>Calendar</Text>
          <Text style={styles.cardText}>
            See booked appointments &amp; schedule. (Opens web calendar)
          </Text>
        </TouchableOpacity>
      </View>
    </View>
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
    marginBottom: 24,
  },
  hamburger: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(148, 163, 184, 0.8)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  hamburgerLine: {
    color: "#e5e7eb",
    fontSize: 20,
    marginTop: -2,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#ffffff",
  },
  subTitle: {
    fontSize: 13,
    color: "rgba(148, 163, 184, 0.95)",
    marginTop: 2,
  },
  cards: {
    gap: 12,
  },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(96, 165, 250, 0.4)",
    backgroundColor: "rgba(15, 23, 42, 0.98)",
    padding: 16,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#ffffff",
    marginBottom: 4,
  },
  cardText: {
    fontSize: 13,
    color: "rgba(191, 219, 254, 0.9)",
  },
});
