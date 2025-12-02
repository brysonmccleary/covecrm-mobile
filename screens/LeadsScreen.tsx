// covecrm-mobile/screens/LeadsScreen.tsx
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  ActivityIndicator,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
} from "react-native";
import { API_BASE_URL } from "../config/api";

export type MobileLead = {
  _id?: string;
  id?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  "First Name"?: string;
  "Last Name"?: string;
  Phone?: string;
  phone?: string;
  Email?: string;
  email?: string;
  State?: string;
  state?: string;
  Age?: number;
  age?: number;
  status?: string;
};

type NormalizedLead = {
  id: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  state: string | null;
  age: number | null;
  status: string | null;
};

type LeadsScreenProps = {
  token: string;
  folderId: string;
  folderName: string;
  onOpenMenu: () => void;
  onBack: () => void;
  onLogout: () => void;
};

export default function LeadsScreen({
  token,
  folderId,
  folderName,
  onOpenMenu,
  onBack,
  onLogout,
}: LeadsScreenProps) {
  const [leads, setLeads] = useState<NormalizedLead[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const normalizeLead = (raw: MobileLead, index: number): NormalizedLead => {
    const id = raw._id || raw.id || `${folderId}-${index}`;

    const rawFirst =
      raw.firstName ||
      (raw["First Name"] as string | undefined) ||
      (raw.name ? raw.name.split(" ")[0] : "");

    const rawLast =
      raw.lastName ||
      (raw["Last Name"] as string | undefined) ||
      (raw.name ? raw.name.split(" ").slice(1).join(" ") : "");

    const fullName =
      (rawFirst || rawLast
        ? `${rawFirst ?? ""} ${rawLast ?? ""}`.trim()
        : raw.name || "Unnamed lead") || "Unnamed lead";

    const phone = (raw.phone || raw.Phone || "").trim() || null;
    const email = (raw.email || raw.Email || "").trim() || null;
    const state = (raw.state || raw.State || "").trim() || null;

    let age: number | null = null;
    if (typeof raw.age === "number") age = raw.age;
    else if (typeof raw.Age === "number") age = raw.Age;

    const status = (raw.status || "").toString() || null;

    return {
      id,
      fullName,
      phone,
      email,
      state,
      age,
      status,
    };
  };

  const fetchLeads = async () => {
    if (!folderId) return;

    setLoading(true);
    setError(null);

    try {
      const url = `${API_BASE_URL}/api/mobile/leads-by-folder?folderId=${encodeURIComponent(
        folderId
      )}`;

      const res = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        const text = await res.text();
        console.error("Leads-by-folder error body:", text);
        throw new Error("Failed to load leads.");
      }

      const json = await res.json();
      const rawLeads: MobileLead[] = json.leads || [];
      const normalized = rawLeads.map(normalizeLead);
      setLeads(normalized);
    } catch (err: any) {
      setError(err?.message || "Failed to load leads.");
      setLeads([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token && folderId) {
      fetchLeads();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, folderId]);

  const callLead = (phone?: string | null) => {
    if (!phone) return;
    Linking.openURL(`tel:${phone}`).catch(() => {});
  };

  const textLead = (phone?: string | null) => {
    if (!phone) return;
    Linking.openURL(`sms:${phone}`).catch(() => {});
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.headerRow}>
        <TouchableOpacity style={styles.menuButton} onPress={onOpenMenu}>
          <Text style={styles.menuIcon}>☰</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>

        <Text style={styles.title} numberOfLines={1}>
          {folderName || "Folder"}
        </Text>
      </View>

      {loading && (
        <View style={styles.centerBlock}>
          <ActivityIndicator />
          <Text style={styles.infoText}>Loading leads…</Text>
        </View>
      )}

      {error && !loading && (
        <View style={styles.centerBlock}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity
            style={[styles.buttonOutline, { marginTop: 8 }]}
            onPress={fetchLeads}
          >
            <Text style={styles.buttonOutlineText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {!loading && !error && leads.length === 0 && (
        <View style={styles.centerBlock}>
          <Text style={styles.infoText}>
            No leads found in this folder yet.
          </Text>
        </View>
      )}

      {!loading && leads.length > 0 && (
        <ScrollView
          style={styles.list}
          contentContainerStyle={{ paddingBottom: 24 }}
        >
          {leads.map((lead) => {
            const phoneLabel = lead.phone || "No phone on file";

            return (
              <View key={lead.id} style={styles.card}>
                <Text style={styles.name}>{lead.fullName}</Text>

                <View style={styles.row}>
                  <Text style={styles.label}>Phone: </Text>
                  <Text style={styles.value}>{phoneLabel}</Text>
                </View>

                <View style={styles.row}>
                  <Text style={styles.label}>Email: </Text>
                  <Text style={styles.value}>{lead.email || "—"}</Text>
                </View>

                <View style={styles.row}>
                  <Text style={styles.label}>State: </Text>
                  <Text style={styles.value}>{lead.state || "—"}</Text>
                </View>

                <View style={styles.row}>
                  <Text style={styles.label}>Age: </Text>
                  <Text style={styles.value}>
                    {lead.age !== null ? lead.age : "—"}
                  </Text>
                </View>

                {lead.status && (
                  <View style={styles.row}>
                    <Text style={styles.label}>Status: </Text>
                    <Text style={styles.value}>{lead.status}</Text>
                  </View>
                )}

                <View style={styles.buttonRow}>
                  <TouchableOpacity
                    style={[
                      styles.callButton,
                      !lead.phone && styles.disabledButton,
                    ]}
                    onPress={() => callLead(lead.phone)}
                    disabled={!lead.phone}
                  >
                    <Text style={styles.callText}>
                      {lead.phone ? "Call" : "No Phone"}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.textButton,
                      !lead.phone && styles.disabledOutline,
                    ]}
                    onPress={() => textLead(lead.phone)}
                    disabled={!lead.phone}
                  >
                    <Text style={styles.textButtonText}>Text</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
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
    marginBottom: 12,
  },
  menuButton: {
    width: 34,
    height: 34,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#60a5fa",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  menuIcon: {
    fontSize: 18,
    color: "#bfdbfe",
    marginTop: -2,
  },
  backButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#60a5fa",
    marginRight: 8,
  },
  backText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#bfdbfe",
  },
  title: {
    flex: 1,
    fontSize: 18,
    fontWeight: "700",
    color: "#ffffff",
  },
  list: {
    flex: 1,
    marginTop: 4,
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
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(96, 165, 250, 0.4)",
    backgroundColor: "rgba(15, 23, 42, 0.95)",
    padding: 14,
    marginBottom: 10,
  },
  name: {
    fontSize: 15,
    fontWeight: "700",
    color: "#ffffff",
    marginBottom: 6,
  },
  row: {
    flexDirection: "row",
    marginTop: 2,
  },
  label: {
    fontSize: 12,
    color: "#9ca3af",
  },
  value: {
    fontSize: 12,
    color: "#e5e7eb",
  },
  buttonRow: {
    flexDirection: "row",
    marginTop: 12,
  },
  callButton: {
    flex: 1,
    borderRadius: 999,
    backgroundColor: "#22c55e",
    paddingVertical: 8,
    alignItems: "center",
    marginRight: 8,
  },
  callText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#ffffff",
  },
  textButton: {
    flex: 1,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#60a5fa",
    paddingVertical: 8,
    alignItems: "center",
  },
  textButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#bfdbfe",
  },
  disabledButton: {
    opacity: 0.4,
  },
  disabledOutline: {
    opacity: 0.4,
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
