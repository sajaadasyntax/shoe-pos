import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ArabicText as Text } from '../../components/ArabicUI';
import { getSupabaseClient } from '../../lib/supabase';

export default function AuthCallbackScreen() {
  const { code, error_description: errorDescription } = useLocalSearchParams<{
    code?: string;
    error_description?: string;
  }>();
  const [message, setMessage] = useState('جارٍ إكمال تسجيل الدخول الآمن…');
  const exchangeStarted = useRef(false);

  useEffect(() => {
    if (exchangeStarted.current) return;
    exchangeStarted.current = true;
    let cancelled = false;
    async function completeSignIn() {
      try {
        if (errorDescription) throw new Error(errorDescription);
        if (typeof code !== 'string' || !code) {
          throw new Error('رابط تسجيل الدخول لا يحتوي على رمز التفويض. اطلب رابطاً جديداً.');
        }
        const { error } = await getSupabaseClient().auth.exchangeCodeForSession(code);
        if (error) throw error;
        if (!cancelled) router.replace('/cloud');
      } catch (error) {
        if (!cancelled) setMessage(error instanceof Error ? error.message : 'تعذر إكمال تسجيل الدخول.');
      }
    }
    void completeSignIn();
    return () => {
      cancelled = true;
    };
  }, [code, errorDescription]);

  return (
    <View style={styles.screen}>
      <ActivityIndicator color="#1d6b58" />
      <Text accessibilityRole="alert" style={styles.message}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#f4f6f3' },
  message: { marginTop: 16, color: '#344740', textAlign: 'center', lineHeight: 20 },
});
