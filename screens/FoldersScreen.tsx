// covecrm-mobile/screens/FoldersScreen.tsx
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  ActivityIndicator,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from "react-native";
import { API_BASE_URL } from "../config/api";

export type MobileFolder = {
  _id: string;
  name: string;
  userEmail?: string;
  leadCount?: number;
};

type FoldersScreenProps = {
  token: string;
  onSelectFolder: (folder: { id: string; name: string }) => void;
  onOpenMenu: () => void;
  onLogout: () => void;
};

export default function FoldersScreen({
  token,
  onSelectFolder,
  onOpenMenu,
  onLogout,
}: FoldersScreenProps) {
  const [folders, setFolders] = useState<MobileFolder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchFolders = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE_URL}/api/mobile/folders`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        const text = await res.text();
        console.error("Folders error body:", text);
        throw new Error("Failed to load folders");
      }

      const json = await res.json();
      const data = Array.isArray(json) ? json : json.folders || [];

      setFolders(data);
    } catch (err: any) {
      setError(err?.message || "Failed to load folders.");
      setFolders([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchFolders();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <TouchableOpacity style={styles.menuButton} onPress={onOpenMenu}>
          <Text style={styles.menuIcon}>☰</Text>
        </TouchableOpacity>
        <View>
          <Text style={styles.title}>Lead Folders</Text>
          <Text style={styles.subtitle}>
            Select a folder to view the leads inside.
          </Text>
        </View>
      </View>

      {loading && (
        <View style={styles.centerBlock}>
          <ActivityIndicator />
          <Text style={styles.infoText}>Loading folders…</Text>
        </View>
      )}

      {error && !loading && (
        <View style={styles.centerBlock}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity
            style={[styles.buttonOutline, { marginTop: 8 }]}
            onPress={fetchFolders}
          >
            <Text style={styles.buttonOutlineText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {!loading && !error && folders.length === 0 && (
        <View style={styles.centerBlock}>
          <Text style={styles.infoText}>
            No folders found yet for this account.
          </Text>
        </View>
      )}

      {!loading && folders.length > 0 && (
        <ScrollView
          style={styles.list}
          contentContainerStyle={{ paddingBottom: 24 }}
        >
          {folders.map((folder) => (
            <TouchableOpacity
              key={folder._id}
              style={styles.folderCard}
              onPress={() =>
                onSelectFolder({ id: folder._id, name: folder.name || "Folder" })
              }
            >
              <View>
                <Text style={styles.folderName}>{folder.name || "Untitled"}</Text>
                <Text style={styles.folderMeta}>
                  {folder.leadCount ?? 0} lead
                  {(folder.leadCount || 0) === 1 ? "" : "s"}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      <TouchableOpacity style={styles.logoutButton} onPress={onLogout}>
        <Text style={styles.logoutText}>Log Out</Text>
      </TouchableOpacity>
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
    marginBottom: 16,
  },
  menuButton: {
    width: 34,
    height: 34,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#60a5fa",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  menuIcon: {
    fontSize: 18,
    color: "#bfdbfe",
    marginTop: -2,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: "#ffffff",
  },
  subtitle: {
    marginTop: 4,
    fontSize: 13,
    color: "rgba(191, 219, 254, 0.85)",
  },
  list: {
    marginTop: 8,
    flex: 1,
  },
  centerBlock: {
    marginTop: 40,
    alignItems: "center",
  },
  infoText: {
    marginTop: 8,
    fontSize: 13,
    color: "#9ca3af",
  },
  errorText: {
    color: "#fca5a5",
    fontSize: 13,
    textAlign: "center",
  },
  folderCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(96, 165, 250, 0.4)",
    backgroundColor: "rgba(15, 23, 42, 0.95)",
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 10,
  },
  folderName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#ffffff",
  },
  folderMeta: {
    marginTop: 4,
    fontSize: 12,
    color: "#93c5fd",
  },
  buttonOutline: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#60a5fa",
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  buttonOutlineText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#bfdbfe",
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
