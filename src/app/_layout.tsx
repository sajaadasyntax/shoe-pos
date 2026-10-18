import { Stack } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { initializeDatabase } from '../lib/database';
import { AuthProvider } from '../providers/AuthProvider';
import { ActivationProvider } from '../providers/ActivationProvider';

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
