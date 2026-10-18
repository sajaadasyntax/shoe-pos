import { useCallback, useState } from 'react';
import {
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as Sharing from 'expo-sharing';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { formatAmount, getTodaysSales, updateShareStatus, type Sale } from '../../lib/database';
import { useAuth } from '../../providers/AuthProvider';

const WHATSAPP_NUMBER_KEY = 'solepos.whatsapp-number';

function messageFor(sale: Sale): string {
  const time = new Date(sale.createdAt).toLocaleString();
  return [
    `Shoe store sale ${sale.id.slice(0, 8)}`,
    `Time: ${time}`,
    `Items: ${sale.items}`,
    `Total: ${formatAmount(sale.totalMinor)}`,
    `Payment: ${sale.accountName ?? sale.paymentMethod}`,
    `Sales user: ${sale.sellerName}`,
    sale.receiptUri ? 'Bank receipt: attached separately' : 'Bank receipt: none attached',
  ].join('\n');
}

export default function WhatsAppScreen() {
  const db = useSQLiteContext();
  const { user } = useAuth();
  const [sales, setSales] = useState<Sale[]>([]);
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [savingPhone, setSavingPhone] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) return;
    const [dailySales, storedPhone] = await Promise.all([
      getTodaysSales(db, user),
      SecureStore.getItemAsync(WHATSAPP_NUMBER_KEY),
    ]);
    setSales(dailySales);
    if (storedPhone) setPhone(storedPhone);
  }, [db, user]);

  useFocusEffect(useCallback(() => {
    refresh().catch((error: unknown) => {
      Alert.alert('Could not load daily transactions', error instanceof Error ? error.message : 'Please try again.');
    });
  }, [refresh]));

  const savePhone = async () => {
    const normalized = phone.replace(/[\s()+.-]/g, '');
    if (!/^\d{8,15}$/.test(normalized)) {
      Alert.alert('Check WhatsApp number', 'Enter an international number using 8-15 digits, including country code, without extension.');
      return;
    }
    setSavingPhone(true);
    try {
      await SecureStore.setItemAsync(WHATSAPP_NUMBER_KEY, normalized);
      setPhone(normalized);
      Alert.alert('Number saved', `Messages will open for +${normalized}.`);
    } catch (error) {
      Alert.alert('Could not save number', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setSavingPhone(false);
    }
  };

  const openMessage = async (sale: Sale) => {
    const normalized = phone.replace(/[\s()+.-]/g, '');
    if (!/^\d{8,15}$/.test(normalized)) {
      Alert.alert('Set a WhatsApp number', 'Enter a valid international WhatsApp number first.');
      return;
    }
    setLoading(true);
    try {
      const url = `https://wa.me/${normalized}?text=${encodeURIComponent(messageFor(sale))}`;
      await Linking.openURL(url);
      await updateShareStatus(db, user!, sale.id, 'opened');
      await refresh();
      Alert.alert(
        'WhatsApp opened',
        'Check the conversation and tap Send in WhatsApp. This app cannot confirm delivery.',
      );
    } catch (error) {
      Alert.alert('Could not open WhatsApp', error instanceof Error ? error.message : 'Check that WhatsApp is installed and try again.');
    } finally {
      setLoading(false);
    }
  };

  const shareReceipt = async (sale: Sale) => {
    if (!sale.receiptUri) return;
    setLoading(true);
    try {
      if (!(await Sharing.isAvailableAsync())) {
        throw new Error('Sharing is not available on this device.');
      }
      await Sharing.shareAsync(sale.receiptUri, {
        mimeType: 'image/*',
        dialogTitle: `Share receipt for sale ${sale.id.slice(0, 8)}`,
      });
    } catch (error) {
      Alert.alert('Could not share receipt', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const markStatus = async (sale: Sale, status: 'confirmed' | 'skipped') => {
    if (!user) return;
    setLoading(true);
    try {
      await updateShareStatus(db, user, sale.id, status);
      await refresh();
    } catch (error) {
      Alert.alert('Could not update queue', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!user) return null;
  const outstanding = sales.filter((sale) => sale.shareStatus !== 'confirmed' && sale.shareStatus !== 'skipped').length;
  const nextSale = sales.find((sale) => sale.shareStatus === 'pending');

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.eyebrow}>USER-ASSISTED SHARING</Text>
      <Text style={styles.title}>Daily WhatsApp</Text>
      <Text style={styles.subtitle}>
        {user.role === 'admin' ? 'Today’s sales from all users on this device.' : 'Your sales for today.'}
        {' '}Transactions are prepared one at a time.
      </Text>

      <View style={styles.phoneCard}>
        <Text style={styles.label}>WhatsApp number (with country code)</Text>
        <View style={styles.phoneRow}>
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            placeholder="e.g. 15551234567"
            keyboardType="phone-pad"
            autoCapitalize="none"
          />
          <Pressable style={styles.savePhone} disabled={savingPhone} onPress={savePhone}>
            <Text style={styles.savePhoneText}>{savingPhone ? '…' : 'Save'}</Text>
          </Pressable>
        </View>
        <Text style={styles.hint}>WhatsApp opens with message text prefilled. You must review and send each message yourself.</Text>
      </View>

      <View style={styles.queueSummary}>
        <Text style={styles.queueCount}>{outstanding}</Text>
        <Text style={styles.queueText}>transactions still to review</Text>
        {nextSale && (
          <Pressable style={[styles.button, loading && styles.disabled]} disabled={loading} onPress={() => openMessage(nextSale)}>
            <Text style={styles.buttonText}>{loading ? 'Opening…' : 'Send next transaction'}</Text>
          </Pressable>
        )}
      </View>

      {sales.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No sales today</Text>
          <Text style={styles.hint}>Sales recorded today by this user will appear in the queue.</Text>
        </View>
      ) : sales.map((sale) => (
        <View key={sale.id} style={styles.saleCard}>
          <View style={styles.saleHeader}>
            <View style={styles.grow}>
              <Text style={styles.saleName}>{sale.sellerName} · {formatAmount(sale.totalMinor)}</Text>
              <Text style={styles.meta}>{new Date(sale.createdAt).toLocaleTimeString()} · {sale.accountName ?? sale.paymentMethod}</Text>
            </View>
            <Text style={[styles.status, sale.shareStatus === 'confirmed' && styles.confirmed]}>
              {sale.shareStatus === 'confirmed' ? 'DONE' : sale.shareStatus === 'skipped' ? 'SKIPPED' : sale.shareStatus === 'opened' ? 'OPENED' : 'PENDING'}
            </Text>
          </View>
          <Text style={styles.items}>{sale.items}</Text>
          {sale.shareStatus !== 'confirmed' && sale.shareStatus !== 'skipped' && (
            <View style={styles.actions}>
              <Pressable style={styles.actionButton} disabled={loading} onPress={() => openMessage(sale)}>
                <Text style={styles.actionText}>Open message</Text>
              </Pressable>
              {sale.receiptUri && (
                <Pressable style={styles.actionButton} disabled={loading} onPress={() => shareReceipt(sale)}>
                  <Text style={styles.actionText}>Share receipt</Text>
                </Pressable>
              )}
              {sale.shareStatus === 'opened' && (
                <Pressable style={styles.actionButton} disabled={loading} onPress={() => markStatus(sale, 'confirmed')}>
                  <Text style={styles.actionText}>Mark sent</Text>
                </Pressable>
              )}
              <Pressable style={styles.skipButton} disabled={loading} onPress={() => markStatus(sale, 'skipped')}>
                <Text style={styles.skipText}>Skip</Text>
              </Pressable>
            </View>
          )}
          {sale.shareStatus === 'opened' && <Text style={styles.hint}>Opened in WhatsApp; confirm manually after sending.</Text>}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f4f6f3' },
  content: { padding: 20, paddingTop: 56, paddingBottom: 32 },
  eyebrow: { color: '#58776a', fontSize: 11, fontWeight: '700', letterSpacing: 1.2 },
  title: { marginTop: 7, color: '#17231f', fontSize: 30, fontWeight: '800' },
  subtitle: { marginTop: 7, marginBottom: 14, color: '#66736e', fontSize: 14, lineHeight: 20 },
  phoneCard: { padding: 16, backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#e2e9e4' },
  label: { marginBottom: 7, color: '#344740', fontSize: 13, fontWeight: '700' },
  phoneRow: { flexDirection: 'row', gap: 8 },
  input: { flex: 1, minHeight: 48, backgroundColor: '#fff', borderWidth: 1, borderColor: '#d8e1db', borderRadius: 12, paddingHorizontal: 12, color: '#17231f', fontSize: 15 },
  savePhone: { backgroundColor: '#e4f1eb', borderRadius: 12, paddingHorizontal: 15, justifyContent: 'center' },
  savePhoneText: { color: '#1d6b58', fontWeight: '700' },
  hint: { marginTop: 8, color: '#66736e', fontSize: 12, lineHeight: 17 },
  queueSummary: { marginTop: 14, padding: 16, backgroundColor: '#e4f1eb', borderRadius: 16 },
  queueCount: { color: '#1d6b58', fontSize: 25, fontWeight: '800' },
  queueText: { marginTop: 2, color: '#52635b', fontSize: 13 },
  button: { marginTop: 13, backgroundColor: '#1d6b58', padding: 13, borderRadius: 12, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  disabled: { opacity: 0.65 },
  emptyCard: { marginTop: 14, padding: 20, backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#e2e9e4' },
  emptyTitle: { color: '#17231f', fontSize: 17, fontWeight: '700' },
  saleCard: { marginTop: 12, padding: 15, backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#e2e9e4' },
  saleHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  grow: { flex: 1 },
  saleName: { color: '#17231f', fontSize: 14, fontWeight: '700' },
  meta: { marginTop: 5, color: '#66736e', fontSize: 12 },
  status: { color: '#8a6b1d', fontSize: 10, fontWeight: '800', letterSpacing: 0.7 },
  confirmed: { color: '#1d6b58' },
  items: { marginTop: 10, color: '#344740', fontSize: 13, lineHeight: 18 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 12 },
  actionButton: { paddingHorizontal: 11, paddingVertical: 9, backgroundColor: '#e4f1eb', borderRadius: 9 },
  actionText: { color: '#1d6b58', fontSize: 12, fontWeight: '700' },
  skipButton: { paddingHorizontal: 11, paddingVertical: 9, backgroundColor: '#f5e8e6', borderRadius: 9 },
  skipText: { color: '#9c2f2f', fontSize: 12, fontWeight: '700' },
});
