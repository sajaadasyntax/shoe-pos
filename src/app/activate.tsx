import { Redirect } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useActivation } from '../providers/ActivationProvider';

export default function ActivationScreen() {
  const { loading, activated, challenge, error, activate, refreshChallenge } = useActivation();
  const [response, setResponse] = useState('');
  const [working, setWorking] = useState(false);

  if (loading) return <View style={styles.center}><ActivityIndicator color="#1d6b58" /></View>;
  if (activated) return <Redirect href="/" />;

  const submit = async () => {
    setWorking(true);
    try {
      await activate(response.trim());
    } catch (cause) {
      Alert.alert('Activation failed', cause instanceof Error ? cause.message : 'Check the activation response.');
    } finally {
      setWorking(false);
    }
  };

  const renewChallenge = async () => {
    setWorking(true);
    try {
      await refreshChallenge();
      setResponse('');
    } catch (cause) {
      Alert.alert('Could not refresh challenge', cause instanceof Error ? cause.message : 'Please try again.');
    } finally {
      setWorking(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior="padding">
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.eyebrow}>SOLEPOS · DEVICE ACTIVATION</Text>
        <Text style={styles.title}>Activate this device</Text>
        <Text style={styles.subtitle}>
          Send the challenge below to your app operator. They return an activation code for this installation.
        </Text>
        {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        {challenge && (
          <View style={styles.challengeCard}>
            <Text style={styles.label}>Device challenge (select and copy)</Text>
            <Text selectable style={styles.challengeText}>
              {JSON.stringify(challenge)}
            </Text>
          </View>
        )}
        <Text style={styles.label}>Activation code</Text>
        <TextInput
          style={styles.input}
          value={response}
          onChangeText={setResponse}
          placeholder="Paste activation code JSON"
          autoCapitalize="none"
          multiline
          textAlignVertical="top"
        />
        <Pressable style={[styles.button, working && styles.disabled]} disabled={working || !response.trim()} onPress={submit}>
          <Text style={styles.buttonText}>{working ? 'Verifying…' : 'Activate'}</Text>
        </Pressable>
        <Pressable style={styles.renewButton} disabled={working} onPress={renewChallenge}>
          <Text style={styles.renewText}>Generate a new challenge</Text>
        </Pressable>
        <Text style={styles.disclaimer}>
          Activation works offline. The shared verification secret is included in this app and can be recovered from its APK. This device identifier is stored in Android secure storage and is not hardware attestation.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f4f6f3' },
  content: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f4f6f3' },
  eyebrow: { color: '#58776a', fontSize: 11, fontWeight: '700', letterSpacing: 1.2 },
  title: { marginTop: 10, color: '#17231f', fontSize: 28, fontWeight: '800' },
  subtitle: { marginTop: 9, marginBottom: 18, color: '#66736e', fontSize: 14, lineHeight: 21 },
  challengeCard: { padding: 14, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e9e4', borderRadius: 12, marginBottom: 18 },
  label: { marginBottom: 7, color: '#344740', fontSize: 13, fontWeight: '700' },
  challengeText: { color: '#17231f', fontFamily: 'monospace', fontSize: 12, lineHeight: 18 },
  input: { minHeight: 120, backgroundColor: '#fff', borderWidth: 1, borderColor: '#d8e1db', borderRadius: 12, padding: 14, color: '#17231f', fontSize: 13 },
  button: { marginTop: 18, backgroundColor: '#1d6b58', padding: 15, borderRadius: 12, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  disabled: { opacity: 0.65 },
  renewButton: { marginTop: 10, padding: 13, alignItems: 'center' },
  renewText: { color: '#1d6b58', fontSize: 14, fontWeight: '700' },
  error: { marginBottom: 12, color: '#9c2f2f', fontSize: 13 },
  disclaimer: { marginTop: 14, color: '#66736e', fontSize: 11, lineHeight: 16 },
});
