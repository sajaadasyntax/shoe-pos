import { Stack } from 'expo-router';
import { I18nManager } from 'react-native';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { initializeDatabase } from '../lib/database';
import { AuthProvider } from '../providers/AuthProvider';
import { ActivationProvider } from '../providers/ActivationProvider';

I18nManager.allowRTL(true);
I18nManager.forceRTL(true);

export default function RootLayout() {
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
