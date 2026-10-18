import { Redirect } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { ArabicText as Text, ArabicTextInput as TextInput } from '../components/ArabicUI';
import { useAuth } from '../providers/AuthProvider';
import { useActivation } from '../providers/ActivationProvider';

export default function LoginScreen() {
  const { status, signIn } = useAuth();
  const activation = useActivation();
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [message, setMessage] = useState('');
  const [checking, setChecking] = useState(false);

  if (!activation.loading && !activation.activated) return <Redirect href="/activate" />;
  if (activation.loading) return null;
  if (status === 'signedIn') return <Redirect href="/(tabs)" />;
  if (status === 'setup') return <Redirect href="/setup" />;

  const submit = async () => {
    setChecking(true);
    setMessage('');
    try {
      const success = await signIn(username, pin);
      if (!success) setMessage('Username or PIN is incorrect.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to sign in. Please try again.');
    } finally {
      setChecking(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior="padding">
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.eyebrow}>SOLEPOS · OFFLINE</Text>
        <Text style={styles.title}>Welcome back</Text>
        <Text style={styles.subtitle}>Sign in to this device to continue.</Text>
        <View style={styles.field}>
          <Text style={styles.label}>Username</Text>
          <TextInput style={styles.input} value={username} onChangeText={setUsername} placeholder="Your username" autoCapitalize="none" />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>PIN</Text>
          <TextInput style={styles.input} value={pin} onChangeText={setPin} placeholder="Your PIN" keyboardType="number-pad" secureTextEntry maxLength={12} />
        </View>
        {!!message && <Text accessibilityRole="alert" style={styles.error}>{message}</Text>}
        <Pressable style={[styles.button, checking && styles.disabled]} disabled={checking} onPress={submit}>
          <Text style={styles.buttonText}>{checking ? 'Signing in…' : 'Sign in'}</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f4f6f3' },
  content: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  eyebrow: { color: '#58776a', fontSize: 11, fontWeight: '700', letterSpacing: 1.2 },
  title: { marginTop: 10, color: '#17231f', fontSize: 29, fontWeight: '800' },
  subtitle: { marginTop: 9, color: '#66736e', fontSize: 14, lineHeight: 21 },
  field: { marginTop: 20 },
  label: { marginBottom: 7, color: '#344740', fontSize: 13, fontWeight: '700' },
  input: { minHeight: 50, backgroundColor: '#fff', borderWidth: 1, borderColor: '#d8e1db', borderRadius: 12, paddingHorizontal: 14, color: '#17231f', fontSize: 16 },
  error: { marginTop: 14, color: '#9c2f2f', fontSize: 13 },
  button: { marginTop: 24, backgroundColor: '#1d6b58', padding: 15, borderRadius: 12, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  disabled: { opacity: 0.65 },
});
