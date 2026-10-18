import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { ArabicAlert as Alert, ArabicText as Text } from '../../components/ArabicUI';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { formatAmount, getSales, type Sale } from '../../lib/database';
import { useAuth } from '../../providers/AuthProvider';

export default function SalesScreen() {
  const db = useSQLiteContext();
  const { user } = useAuth();
  const [sales, setSales] = useState<Sale[]>([]);

  useFocusEffect(
    useCallback(() => {
      if (!user) return undefined;
      let active = true;
      getSales(db, user)
        .then((result) => {
          if (active) setSales(result);
        })
        .catch((error: unknown) => {
          Alert.alert('Could not load sales', error instanceof Error ? error.message : 'Please try again.');
        });
      return () => {
        active = false;
      };
    }, [db, user]),
  );

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.eyebrow}>OFFLINE TRANSACTIONS</Text>
      <Text style={styles.title}>Sales</Text>
      <Text style={styles.subtitle}>{user?.role === 'admin' ? 'All transactions saved on this device.' : 'Your transactions saved on this device.'}</Text>

      {sales.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No sales yet</Text>
          <Text style={styles.emptyText}>Sales you record from Inventory will appear here.</Text>
        </View>
      ) : (
        sales.map((sale) => (
          <View style={styles.saleCard} key={sale.id}>
            <View style={styles.saleHeader}>
              <View style={styles.saleHeaderText}>
                <Text style={styles.saleTotal}>{formatAmount(sale.totalMinor)}</Text>
                <Text style={styles.saleDate}>{new Date(sale.createdAt).toLocaleString()}</Text>
              </View>
              <Text style={styles.paymentMethod}>{sale.accountName ?? sale.paymentMethod.toUpperCase()}</Text>
            </View>
            <Text style={styles.saleItems}>{sale.items}</Text>
            <Text style={styles.seller}>{sale.sellerName}</Text>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f4f6f3' },
  content: { padding: 20, paddingTop: 56, paddingBottom: 32 },
  eyebrow: { color: '#58776a', fontSize: 11, fontWeight: '700', letterSpacing: 1.2 },
  title: { marginTop: 7, color: '#17231f', fontSize: 30, fontWeight: '800' },
  subtitle: { marginTop: 7, color: '#66736e', fontSize: 14, lineHeight: 20 },
  emptyCard: { marginTop: 28, padding: 22, backgroundColor: '#fff', borderRadius: 18, borderWidth: 1, borderColor: '#e2e9e4' },
  emptyTitle: { color: '#17231f', fontSize: 18, fontWeight: '700' },
  emptyText: { marginTop: 8, color: '#66736e', fontSize: 14, lineHeight: 20 },
  saleCard: { marginTop: 12, padding: 16, backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#e2e9e4' },
  saleHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  saleHeaderText: { flex: 1 },
  saleTotal: { color: '#1d6b58', fontSize: 19, fontWeight: '800' },
  saleDate: { marginTop: 5, color: '#66736e', fontSize: 12 },
  paymentMethod: { color: '#52635b', fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },
  saleItems: { marginTop: 14, color: '#263831', fontSize: 14, lineHeight: 20 },
  seller: { marginTop: 8, color: '#718078', fontSize: 12 },
});
