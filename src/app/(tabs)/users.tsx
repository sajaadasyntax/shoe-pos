import { Redirect, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { ArabicAlert as Alert, ArabicText as Text, ArabicTextInput as TextInput } from '../../components/ArabicUI';
import { useSQLiteContext } from 'expo-sqlite';
import { createSalesUser, getUsers, type AppUser } from '../../lib/database';
import { useAuth } from '../../providers/AuthProvider';

export default function UsersScreen() {
  const db = useSQLiteContext();
  const { user } = useAuth();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    if (user?.role !== 'admin') return;
    setUsers(await getUsers(db, user));
  }, [db, user]);

  useFocusEffect(useCallback(() => {
    refresh().catch((error: unknown) => {
      Alert.alert('Could not load users', error instanceof Error ? error.message : 'Please try again.');
    });
  }, [refresh]));

  if (!user) return <Redirect href="/login" />;
  if (user.role !== 'admin') return <Redirect href="/(tabs)" />;

  const clearForm = () => {
    setName('');
    setUsername('');
    setPin('');
  };

  const saveUser = async () => {
    if (!user || user.role !== 'admin') {
      Alert.alert('Not allowed', 'Only an admin can add sales users.');
      return;
    }
    setSaving(true);
    try {
      await createSalesUser(db, user, { name, username, pin });
      clearForm();
      setShowForm(false);
      await refresh();
    } catch (error) {
      Alert.alert('Could not add sales user', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>ADMINISTRATION</Text>
            <Text style={styles.title}>Users</Text>
          </View>
          <Pressable style={styles.button} onPress={() => setShowForm(true)}>
            <Text style={styles.buttonText}>+ Add user</Text>
          </Pressable>
        </View>
        <Text style={styles.subtitle}>Create sign-in accounts for sales staff on this device.</Text>

        {users.map((account) => (
          <View key={account.id} style={styles.userCard}>
            <View style={styles.avatar}><Text style={styles.avatarText}>{account.name.trim().charAt(0).toUpperCase()}</Text></View>
            <View style={styles.userDetails}>
              <Text style={styles.userName}>{account.name}</Text>
              <Text style={styles.username}>@{account.username}</Text>
            </View>
            <Text style={[styles.role, account.role === 'admin' && styles.adminRole]}>
              {account.role === 'admin' ? 'ADMIN' : 'SALES'}
            </Text>
          </View>
        ))}
      </ScrollView>

      <Modal visible={showForm} animationType="slide" onRequestClose={() => setShowForm(false)}>
        <KeyboardAvoidingView style={styles.modalScreen} behavior="padding">
          <ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
            <Text style={styles.eyebrow}>NEW ACCOUNT</Text>
            <Text style={styles.modalTitle}>Add sales user</Text>
            <Text style={styles.subtitle}>The new user can sign in with their username and PIN.</Text>
            <FormField label="Full name" value={name} onChangeText={setName} placeholder="e.g. Alex" />
            <FormField label="Username" value={username} onChangeText={setUsername} placeholder="3-32 letters or numbers" autoCapitalize="none" />
            <FormField label="6-12 digit PIN" value={pin} onChangeText={setPin} placeholder="Choose a private PIN" keyboardType="number-pad" secureTextEntry />
            <Text style={styles.hint}>PINs are verified using a salted hash and a secret stored with Android Keystore protection.</Text>
            <Pressable style={[styles.button, saving && styles.disabled]} disabled={saving} onPress={saveUser}>
              <Text style={styles.buttonText}>{saving ? 'Saving…' : 'Create sales user'}</Text>
            </Pressable>
            <Pressable style={styles.cancel} onPress={() => { clearForm(); setShowForm(false); }}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function FormField(props: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  autoCapitalize?: 'none' | 'sentences';
  keyboardType?: 'default' | 'number-pad';
  secureTextEntry?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{props.label}</Text>
      <TextInput
        style={styles.input}
        value={props.value}
        onChangeText={props.onChangeText}
        placeholder={props.placeholder}
        autoCapitalize={props.autoCapitalize ?? 'sentences'}
        keyboardType={props.keyboardType ?? 'default'}
        secureTextEntry={props.secureTextEntry}
        maxLength={props.secureTextEntry ? 12 : undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f4f6f3' },
  content: { padding: 20, paddingTop: 56, paddingBottom: 32 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  eyebrow: { color: '#58776a', fontSize: 11, fontWeight: '700', letterSpacing: 1.2 },
  title: { marginTop: 7, color: '#17231f', fontSize: 30, fontWeight: '800' },
  subtitle: { marginTop: 7, color: '#66736e', fontSize: 14, lineHeight: 20 },
  button: { backgroundColor: '#1d6b58', paddingHorizontal: 16, paddingVertical: 13, borderRadius: 12, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  userCard: { marginTop: 12, padding: 15, backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#e2e9e4', flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#e4f1eb', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#1d6b58', fontWeight: '800', fontSize: 17 },
  userDetails: { flex: 1 },
  userName: { color: '#17231f', fontSize: 15, fontWeight: '700' },
  username: { marginTop: 4, color: '#66736e', fontSize: 12 },
  role: { color: '#52635b', fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  adminRole: { color: '#1d6b58' },
  modalScreen: { flex: 1, backgroundColor: '#f4f6f3' },
  modalContent: { padding: 22, paddingTop: 62, paddingBottom: 36 },
  modalTitle: { marginTop: 8, color: '#17231f', fontSize: 24, fontWeight: '800' },
  field: { marginTop: 18 },
  label: { marginBottom: 7, color: '#344740', fontSize: 13, fontWeight: '700' },
  input: { minHeight: 50, backgroundColor: '#fff', borderWidth: 1, borderColor: '#d8e1db', borderRadius: 12, paddingHorizontal: 14, color: '#17231f', fontSize: 16 },
  hint: { marginTop: 14, marginBottom: 18, color: '#66736e', fontSize: 12, lineHeight: 18 },
  disabled: { opacity: 0.65 },
  cancel: { marginTop: 10, padding: 13, alignItems: 'center' },
  cancelText: { color: '#52635b', fontWeight: '700', fontSize: 15 },
});
