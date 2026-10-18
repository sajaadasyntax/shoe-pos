import { Redirect } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useAuth } from '../providers/AuthProvider';
import { useActivation } from '../providers/ActivationProvider';

export default function SetupScreen() {
  const { status, setupAdmin } = useAuth();
  const activation = useActivation();
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [saving, setSaving] = useState(false);

  if (!activation.loading && !activation.activated) return <Redirect href="/activate" />;
  if (activation.loading) return null;
  if (status === 'signedIn') return <Redirect href="/(tabs)" />;
  if (status === 'signedOut') return <Redirect href="/login" />;

  const submit = async () => {
    setSaving(true);
    try {
      await setupAdmin({ name, username, pin });
    } catch (error) {
      Alert.alert('Could not create admin', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior="padding">
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.eyebrow}>SOLEPOS · ANDROID</Text>
        <Text style={styles.title}>Set up your store</Text>
        <Text style={styles.subtitle}>Create the first admin account. Only this account can add sales users and manage the catalog.</Text>
        <Field label="Admin name" value={name} onChangeText={setName} placeholder="e.g. Store owner" />
        <Field label="Username" value={username} onChangeText={setUsername} placeholder="Choose a username" autoCapitalize="none" />
        <Field label="6-12 digit PIN" value={pin} onChangeText={setPin} placeholder="Create a private PIN" keyboardType="number-pad" secureTextEntry />
        <Text style={styles.hint}>The PIN verifier is protected with a device-only key. App access is local to this Android device.</Text>
        <Pressable style={[styles.button, saving && styles.disabled]} disabled={saving} onPress={submit}>
          <Text style={styles.buttonText}>{saving ? 'Setting up…' : 'Create admin account'}</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field(props: {
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
      <Text style={styles.fieldLabel}>{props.label}</Text>
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
  content: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  eyebrow: { color: '#58776a', fontSize: 11, fontWeight: '700', letterSpacing: 1.2 },
  title: { marginTop: 10, color: '#17231f', fontSize: 29, fontWeight: '800' },
  subtitle: { marginTop: 9, marginBottom: 12, color: '#66736e', fontSize: 14, lineHeight: 21 },
  field: { marginTop: 18 },
  fieldLabel: { marginBottom: 7, color: '#344740', fontSize: 13, fontWeight: '700' },
  input: { minHeight: 50, backgroundColor: '#fff', borderWidth: 1, borderColor: '#d8e1db', borderRadius: 12, paddingHorizontal: 14, color: '#17231f', fontSize: 16 },
  hint: { marginTop: 16, marginBottom: 22, color: '#66736e', fontSize: 12, lineHeight: 18 },
  button: { backgroundColor: '#1d6b58', padding: 15, borderRadius: 12, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  disabled: { opacity: 0.65 },
});
