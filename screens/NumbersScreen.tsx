// covecrm-mobile/screens/NumbersScreen.tsx
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Alert,
} from "react-native";
import { API_BASE_URL } from "../config/api";

interface OwnedNumber {
  sid: string;
  phoneNumber: string;
  subscriptionStatus: string;
  nextBillingDate: string | null;
  usage: {
    callsMade: number;
    callsReceived: number;
    textsSent: number;
    textsReceived: number;
    cost: number;
  };
}

interface AvailableNumber {
  phoneNumber: string;
  city: string;
  state: string;
}

export default function NumbersScreen({
  token,
  onOpenMenu,
  onLogout,
}: {
  token: string;
  onOpenMenu: () => void;
  onLogout: () => void;
}) {
  const [areaCode, setAreaCode] = useState("");
  const [loading, setLoading] = useState(false);

  const [available, setAvailable] = useState<AvailableNumber[]>([]);
  const [owned, setOwned] = useState<OwnedNumber[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Format phone numbers like 415-555-1234
  function format(num: string) {
    const cleaned = num.replace(/[^0-9]/g, "");
    if (cleaned.length === 11) {
      return `${cleaned[0]}-${cleaned.slice(1, 4)}-${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
    }
    if (cleaned.length === 10) {
      return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
    }
    return num;
  }

  // Fetch owned numbers
  const loadOwned = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/mobile/numbers`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      setOwned(json.numbers || []);
    } catch (err) {
      console.log("Owned numbers fetch failed", err);
    }
  };

  useEffect(() => {
    loadOwned();
  }, []);

  // Fetch available numbers
  const searchAvailable = async () => {
    if (!areaCode.trim()) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `${API_BASE_URL}/api/mobile/numbers/available?areaCode=${encodeURIComponent(
          areaCode.trim()
        )}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const json = await res.json();
      if (json?.numbers) setAvailable(json.numbers);
      else setAvailable([]);
    } catch (err: any) {
      setError("Failed to fetch available numbers");
    } finally {
      setLoading(false);
    }
  };

  // Buy a number
  const buyNumber = async (num: string) => {
    Alert.alert(
      "Confirm Purchase",
      `Buy number ${format(num)} for $5/month?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Buy",
          onPress: async () => {
            try {
              setLoading(true);
              const res = await fetch(`${API_BASE_URL}/api/mobile/numbers/buy`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ number: num }),
              });

              const json = await res.json();
              if (!json.ok) throw new Error(json.message || "Purchase failed");

              Alert.alert("Success", `Number ${format(num)} purchased`);
              await loadOwned();
            } catch (err: any) {
              Alert.alert("Error", err?.message || "Purchase failed");
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  // Release a number
  const releaseNumber = async (num: string) => {
    Alert.alert(
      "Confirm Delete",
      `Release number ${format(num)}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              setLoading(true);

              await fetch(`${API_BASE_URL}/api/mobile/numbers/release`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ phoneNumber: num }),
              });

              Alert.alert("Deleted", `${format(num)} released`);
              await loadOwned();
            } catch (err: any) {
              Alert.alert("Error", err?.message || "Delete failed");
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  return (
    <ScrollView style={styles.container}>
      {/* Header Row */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onOpenMenu}>
          <Text style={styles.menuButton}>☰</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Phone Numbers</Text>
        <TouchableOpacity onPress={onLogout}>
          <Text style={styles.logoutButton}>Logout</Text>
        </TouchableOpacity>
      </View>

      {/* Search Section */}
      <View style={styles.card}>
        <Text style={styles.label}>Search by Area Code</Text>

        <TextInput
          value={areaCode}
          onChangeText={setAreaCode}
          placeholder="415"
          placeholderTextColor="#999"
          keyboardType="number-pad"
          style={styles.input}
        />

        <TouchableOpacity
          onPress={searchAvailable}
          style={styles.button}
          disabled={loading}
        >
          <Text style={styles.buttonText}>
            {loading ? "Searching..." : "Search Available Numbers"}
          </Text>
        </TouchableOpacity>

        {error && <Text style={styles.error}>{error}</Text>}
      </View>

      {/* Available Numbers */}
      <Text style={styles.sectionTitle}>Available Numbers</Text>

      {available.map((n) => (
        <View key={n.phoneNumber} style={styles.numberRow}>
          <View>
            <Text style={styles.number}>{format(n.phoneNumber)}</Text>
            <Text style={styles.subText}>
              {n.city}, {n.state}
            </Text>
          </View>

          <TouchableOpacity
            onPress={() => buyNumber(n.phoneNumber)}
            style={styles.buyButton}
          >
            <Text style={styles.buyText}>Buy</Text>
          </TouchableOpacity>
        </View>
      ))}

      {/* Owned Numbers */}
      <Text style={styles.sectionTitle}>Your Numbers</Text>

      {owned.map((n) => (
        <View key={n.sid} style={styles.numberRow}>
          <View>
            <Text style={styles.number}>{format(n.phoneNumber)}</Text>
            <Text style={styles.subText}>
              Status: {n.subscriptionStatus || "unknown"}
            </Text>
            {n.nextBillingDate && (
              <Text style={styles.subText}>
                Next Billing: {new Date(n.nextBillingDate).toLocaleDateString()}
              </Text>
            )}
            <Text style={styles.subText}>
              Calls: {n.usage.callsMade} / {n.usage.callsReceived}
            </Text>
            <Text style={styles.subText}>
              Texts: {n.usage.textsSent} / {n.usage.textsReceived}
            </Text>
          </View>

          <TouchableOpacity
            onPress={() => releaseNumber(n.phoneNumber)}
            style={styles.deleteButton}
          >
            <Text style={styles.deleteText}>Delete</Text>
          </TouchableOpacity>
        </View>
      ))}

      {loading && <ActivityIndicator size="large" color="#3b82f6" />}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f172a",
    padding: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  menuButton: { color: "white", fontSize: 24, width: 40 },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    color: "white",
    fontSize: 20,
    fontWeight: "600",
  },
  logoutButton: {
    color: "#fca5a5",
    fontSize: 14,
    paddingHorizontal: 12,
  },

  card: {
    backgroundColor: "#1e293b",
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
  },
  label: {
    color: "#cbd5e1",
    marginBottom: 6,
    fontSize: 14,
  },
  input: {
    backgroundColor: "#0f172a",
    borderColor: "#334155",
    borderWidth: 1,
    padding: 10,
    borderRadius: 8,
    color: "white",
    marginBottom: 12,
  },
  button: {
    backgroundColor: "#3b82f6",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  buttonText: { color: "white", fontWeight: "600" },

  sectionTitle: {
    color: "#e2e8f0",
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 10,
    marginTop: 10,
  },

  numberRow: {
    backgroundColor: "#1e293b",
    padding: 14,
    borderRadius: 12,
    marginBottom: 12,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  number: { color: "white", fontSize: 16, fontWeight: "600" },
  subText: { color: "#94a3b8", fontSize: 12, marginTop: 2 },

  buyButton: {
    backgroundColor: "#10b981",
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 6,
    alignSelf: "center",
  },
  buyText: { color: "white", fontWeight: "600" },

  deleteButton: {
    backgroundColor: "#ef4444",
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 6,
    alignSelf: "center",
  },
  deleteText: { color: "white", fontWeight: "600" },

  error: { color: "#fca5a5", marginTop: 6 },
});
