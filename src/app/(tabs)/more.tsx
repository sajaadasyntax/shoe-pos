import { Link, Redirect } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { exportBackup, importBackup } from '../../lib/backup';
import { useAuth } from '../../providers/AuthProvider';

export default function MoreScreen() {
  const db = useSQLiteContext();
  const { user, signOut } = useAuth();
  const [backupBusy, setBackupBusy] = useState(false);
  if (!user) return <Redirect href="/login" />;

  async function runBackup(action: 'export' | 'restore') {
    setBackupBusy(true);
    try {
      if (action === 'export') {
        await exportBackup(db);
      } else {
        const restored = await importBackup(db);
        if (!restored) return;
        await signOut();
        Alert.alert('Backup restored', 'The backup is now active. Sign in using an account from that backup.');
      }
    } catch (error) {
      Alert.alert(
        action === 'export' ? 'Could not export backup' : 'Could not restore backup',
        error instanceof Error ? error.message : 'Please try again.',
      );
    } finally {
      setBackupBusy(false);
    }
  }

  function confirmRestore() {
    Alert.alert(
      'Replace store data?',
      'Restoring replaces all current sales, inventory, users, account records, and receipts with the selected backup. Export a backup of the current data first if you may need it.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Choose backup', style: 'destructive', onPress: () => { void runBackup('restore'); } },
      ],
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.eyebrow}>SOLEPOS</Text>
      <Text style={styles.title}>More</Text>
      <Text style={styles.subtitle}>{user.name} · {user.role === 'admin' ? 'Admin' : 'Sales user'}</Text>

      {user.role === 'admin' && (
        <Link href="/(tabs)/users" style={styles.link}>
          <View style={styles.linkBody}>
            <Text style={styles.linkTitle}>User management</Text>
            <Text style={styles.linkDescription}>Add sales users and manage their sign-in accounts</Text>
          </View>
          <Text style={styles.arrow}>›</Text>
        </Link>
      )}

      <Link href="/(tabs)/expenses" style={styles.link}>
        <View style={styles.linkBody}>
          <Text style={styles.linkTitle}>Expenses</Text>
          <Text style={styles.linkDescription}>{user.role === 'admin' ? 'View and record expenses for all users' : 'Record and view your expenses'}</Text>
        </View>
        <Text style={styles.arrow}>›</Text>
      </Link>
      <Link href="/(tabs)/whatsapp" style={styles.link}>
        <View style={styles.linkBody}>
          <Text style={styles.linkTitle}>Daily WhatsApp</Text>
          <Text style={styles.linkDescription}>Review and share today&apos;s transactions one by one</Text>
        </View>
        <Text style={styles.arrow}>›</Text>
      </Link>

      {user.role === 'admin' && (
        <>
          <View style={styles.backupCard}>
            <Text style={styles.linkTitle}>Store backup</Text>
            <Text style={styles.linkDescription}>Export includes the local database and receipt images. Backups contain sensitive store and user data; keep them private.</Text>
            <Pressable style={styles.backupButton} disabled={backupBusy} onPress={() => { void runBackup('export'); }}>
              <Text style={styles.backupButtonText}>{backupBusy ? 'Working…' : 'Export backup'}</Text>
            </Pressable>
            <Pressable style={[styles.restoreButton, backupBusy && styles.disabledButton]} disabled={backupBusy} onPress={confirmRestore}>
              <Text style={styles.restoreButtonText}>Restore from backup</Text>
            </Pressable>
          </View>
          <Link href="/(tabs)/procurement" style={styles.link}>
            <View style={styles.linkBody}>
              <Text style={styles.linkTitle}>Procurement</Text>
              <Text style={styles.linkDescription}>Receive purchases and add stock</Text>
            </View>
            <Text style={styles.arrow}>›</Text>
          </Link>
          <Link href="/(tabs)/accounts" style={styles.link}>
            <View style={styles.linkBody}>
              <Text style={styles.linkTitle}>Balances</Text>
              <Text style={styles.linkDescription}>Accounts, opening balances, and transfers</Text>
            </View>
            <Text style={styles.arrow}>›</Text>
          </Link>
          <Link href="/(tabs)/reports" style={styles.link}>
            <View style={styles.linkBody}>
              <Text style={styles.linkTitle}>Reports</Text>
              <Text style={styles.linkDescription}>Sales, procurement, and profit and loss</Text>
            </View>
            <Text style={styles.arrow}>›</Text>
          </Link>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f4f6f3', padding: 20, paddingTop: 56 },
  content: { paddingBottom: 24 },
  eyebrow: { color: '#58776a', fontSize: 11, fontWeight: '700', letterSpacing: 1.2 },
  title: { marginTop: 7, color: '#17231f', fontSize: 30, fontWeight: '800' },
  subtitle: { marginTop: 7, marginBottom: 18, color: '#66736e', fontSize: 14 },
  link: { marginTop: 10, padding: 16, backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#e2e9e4', flexDirection: 'row', alignItems: 'center', gap: 12 },
  linkBody: { flex: 1 },
  linkTitle: { color: '#17231f', fontSize: 16, fontWeight: '700' },
  linkDescription: { marginTop: 5, color: '#66736e', fontSize: 12, lineHeight: 17 },
  arrow: { color: '#1d6b58', fontSize: 26, fontWeight: '500' },
  backupCard: { marginTop: 10, padding: 16, backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#e2e9e4' },
  backupButton: { marginTop: 14, padding: 13, backgroundColor: '#1d6b58', borderRadius: 12, alignItems: 'center' },
  backupButtonText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  restoreButton: { marginTop: 8, padding: 13, backgroundColor: '#fff', borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: '#a33b35' },
  restoreButtonText: { color: '#a33b35', fontSize: 14, fontWeight: '700' },
  disabledButton: { opacity: 0.5 },
});
