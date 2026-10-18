import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { I18nManager } from 'react-native';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { initializeDatabase } from '../lib/database';
import { AuthProvider } from '../providers/AuthProvider';
import { ActivationProvider } from '../providers/ActivationProvider';
import { ArabicAlert } from '../components/ArabicUI';

export default function RootLayout() {
  useEffect(() => {
    I18nManager.allowRTL(true);
    if (!I18nManager.isRTL) {
      I18nManager.forceRTL(true);
      ArabicAlert.alert(
        'Arabic layout ready',
        'Close and reopen the app once to apply right-to-left navigation.',
        [{ text: 'OK' }],
      );
    }
  }, []);

  return (
    <SQLiteProvider databaseName="solepos.db" onInit={initializeDatabase}>
      <AuthProvider>
        <ActivationProvider>
          <StatusBar style="dark" />
          <Stack screenOptions={{ headerShown: false }} />
        </ActivationProvider>
      </AuthProvider>
    </SQLiteProvider>
  );
}
