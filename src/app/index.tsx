import { Redirect } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { ArabicText as Text } from '../components/ArabicUI';
import { useAuth } from '../providers/AuthProvider';
import { useActivation } from '../providers/ActivationProvider';

export default function IndexRoute() {
  const { status, error } = useAuth();
  const activation = useActivation();
  if (activation.loading) {
    return <View style={styles.center}><ActivityIndicator color="#1d6b58" /></View>;
  }
  if (!activation.activated) return <Redirect href="/activate" />;
  if (status === 'loading') {
    return <View style={styles.center}><ActivityIndicator color="#1d6b58" /></View>;
  }
  if (status === 'error') {
    return <View style={styles.center}><Text style={styles.errorText}>{error}</Text></View>;
  }
  if (status === 'setup') return <Redirect href="/setup" />;
  if (status === 'signedOut') return <Redirect href="/login" />;
  return <Redirect href="/(tabs)" />;
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: '#f4f6f3' },
  errorText: { color: '#9c2f2f', textAlign: 'center' },
});
