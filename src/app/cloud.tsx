import { Link, useFocusEffect } from 'expo-router';
import * as Linking from 'expo-linking';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { ArabicText as Text, ArabicTextInput as TextInput } from '../components/ArabicUI';
import { getSupabaseClient } from '../lib/supabase';
import type { Session } from '@supabase/supabase-js';

type TenantMembership = {
  organizationId: string;
  organizationName: string;
  role: 'owner' | 'admin' | 'sales';
  storeNames: string[];
};

export default function CloudAccountScreen() {
  const [session, setSession] = useState<Session | null>(null);
  const [memberships, setMemberships] = useState<TenantMembership[]>([]);
  const [email, setEmail] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [shopName, setShopName] = useState('');
  const [storeName, setStoreName] = useState('');
  const [slug, setSlug] = useState('');
  const [message, setMessage] = useState('');
  const [working, setWorking] = useState(false);
  const [loading, setLoading] = useState(true);

  const refreshCloudAccount = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      setSession(data.session);
      if (!data.session) {
        setMemberships([]);
        return;
      }

      const { data: membershipRows, error: membershipError } = await supabase
        .from('memberships')
        .select('org_id, role, store_id')
        .eq('user_id', data.session.user.id)
        .eq('active', true);
      if (membershipError) throw membershipError;

      const organizationIds = [...new Set((membershipRows ?? []).map((membership) => membership.org_id))];
      if (organizationIds.length === 0) {
        setMemberships([]);
        return;
      }
      const { data: organizations, error: organizationsError } = await supabase
        .from('organizations')
        .select('id, name')
        .in('id', organizationIds);
      if (organizationsError) throw organizationsError;

      const membershipsWithStores = await Promise.all(
        organizationIds.map(async (organizationId) => {
          const rows = (membershipRows ?? []).filter((membership) => membership.org_id === organizationId);
          const organization = (organizations ?? []).find((item) => item.id === organizationId);
          const storeIds = rows.flatMap((row) => row.store_id ? [row.store_id] : []);
          let storeQuery = supabase.from('stores').select('id, name').eq('org_id', organizationId);
          if (storeIds.length > 0 && !rows.some((row) => row.store_id === null)) {
            storeQuery = storeQuery.in('id', [...new Set(storeIds)]);
          }
          const { data: stores, error: storesError } = await storeQuery;
          if (storesError) throw storesError;
          return {
            organizationId,
            organizationName: organization?.name ?? organizationId,
            role: rows[0].role as TenantMembership['role'],
            storeNames: (stores ?? []).map((store) => store.name),
          };
        }),
      );
      setMemberships(membershipsWithStores);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not connect to Supabase.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void refreshCloudAccount();
  }, [refreshCloudAccount]));

  const sendMagicLink = async () => {
    setWorking(true);
    setMessage('');
    try {
      const supabase = getSupabaseClient();
      const redirectTo = Linking.createURL('auth/callback');
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim().toLowerCase(),
        options: { emailRedirectTo: redirectTo },
      });
      if (error) throw error;
      setMessage('تم إرسال رابط الدخول. افتحه على جهاز أندرويد هذا للمتابعة.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'تعذر إرسال رابط تسجيل الدخول.');
    } finally {
      setWorking(false);
    }
  };

  const createShop = async () => {
    setWorking(true);
    setMessage('');
    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase.rpc('create_shop', {
        shop_name: shopName.trim(),
        first_store_name: storeName.trim(),
        shop_slug: slug.trim().toLowerCase(),
        owner_name: ownerName.trim(),
      });
      if (error) throw error;
      setMessage('تم إنشاء المتجر. ستبقى بيانات نقطة البيع محلية حتى تفعيل المزامنة.');
      await refreshCloudAccount();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'تعذر إنشاء المتجر.');
    } finally {
      setWorking(false);
    }
  };

  const signOut = async () => {
    setWorking(true);
    setMessage('');
    try {
      const { error } = await getSupabaseClient().auth.signOut();
      if (error) throw error;
      setSession(null);
      setMemberships([]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'تعذر تسجيل الخروج.');
    } finally {
      setWorking(false);
    }
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color="#1d6b58" /></View>;
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior="padding">
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.eyebrow}>سول بوس · الحساب السحابي</Text>
        <Text style={styles.title}>الحساب السحابي</Text>
        <Text style={styles.subtitle}>سجّل الدخول عبر رابط آمن في البريد الإلكتروني، ثم أنشئ متجرك أو اعرضه.</Text>

        {!session ? (
          <>
            <Field label="البريد الإلكتروني" value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" />
            <Pressable
              accessibilityRole="button"
              style={[styles.button, (working || !email.trim()) && styles.disabled]}
              disabled={working || !email.trim()}
              onPress={() => { void sendMagicLink(); }}
            >
              <Text style={styles.buttonText}>{working ? 'جارٍ الإرسال…' : 'إرسال رابط الدخول'}</Text>
            </Pressable>
          </>
        ) : (
          <>
            <View style={styles.card}>
              <Text style={styles.label}>تم تسجيل الدخول</Text>
              <Text style={styles.email}>{session.user.email}</Text>
            </View>

            {memberships.map((membership) => (
              <View key={membership.organizationId} style={styles.card}>
                <Text style={styles.shopName}>{membership.organizationName}</Text>
                <Text style={styles.detail}>الدور: {membership.role === 'owner' ? 'مالك' : membership.role === 'admin' ? 'مسؤول' : 'مبيعات'}</Text>
                <Text style={styles.detail}>
                  المتاجر: {membership.storeNames.length ? membership.storeNames.join('، ') : 'لا يوجد متجر مخصص'}
                </Text>
              </View>
            ))}

            {memberships.length === 0 && (
              <View style={styles.card}>
                <Text style={styles.label}>إنشاء متجرك الأول</Text>
                <Field label="اسمك" value={ownerName} onChangeText={setOwnerName} placeholder="مالك المتجر" />
                <Field label="اسم المؤسسة" value={shopName} onChangeText={setShopName} placeholder="متجر الأحذية" />
                <Field label="اسم الفرع الأول" value={storeName} onChangeText={setStoreName} placeholder="الفرع الرئيسي" />
                <Field label="اسم فريد للرابط (أحرف إنجليزية)" value={slug} onChangeText={setSlug} placeholder="example-shoes" autoCapitalize="none" />
                <Pressable
                  accessibilityRole="button"
                  style={[styles.button, (working || !ownerName.trim() || !shopName.trim() || !storeName.trim() || !slug.trim()) && styles.disabled]}
                  disabled={working || !ownerName.trim() || !shopName.trim() || !storeName.trim() || !slug.trim()}
                  onPress={() => { void createShop(); }}
                >
                  <Text style={styles.buttonText}>{working ? 'جارٍ الإنشاء…' : 'إنشاء حساب المتجر'}</Text>
                </Pressable>
              </View>
            )}

            <View style={styles.notice}>
              <Text style={styles.noticeText}>
                تم ربط الدخول السحابي وإعداد المتجر. لا تزال بيانات المخزون والمبيعات والموظفين والأرصدة محفوظة في قاعدة بيانات هذا الجهاز، ولم تبدأ مزامنتها بعد.
              </Text>
            </View>
            <Pressable style={styles.secondaryButton} disabled={working} onPress={() => { void signOut(); }}>
              <Text style={styles.secondaryButtonText}>تسجيل الخروج من الحساب السحابي</Text>
            </Pressable>
          </>
        )}

        {!!message && <Text accessibilityRole="alert" style={styles.message}>{message}</Text>}
        <Link href="/login" asChild>
          <Pressable style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>العودة إلى تسجيل الدخول دون اتصال</Text>
          </Pressable>
        </Link>
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
  keyboardType?: 'default' | 'email-address';
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
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f4f6f3' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f4f6f3' },
  content: { flexGrow: 1, justifyContent: 'center', padding: 24, paddingBottom: 40 },
  eyebrow: { color: '#58776a', fontSize: 11, fontWeight: '700', letterSpacing: 1.2 },
  title: { marginTop: 10, color: '#17231f', fontSize: 29, fontWeight: '800' },
  subtitle: { marginTop: 9, marginBottom: 12, color: '#66736e', fontSize: 14, lineHeight: 21 },
  field: { marginTop: 16 },
  label: { marginBottom: 7, color: '#344740', fontSize: 13, fontWeight: '700' },
  input: { minHeight: 50, backgroundColor: '#fff', borderWidth: 1, borderColor: '#d8e1db', borderRadius: 12, paddingHorizontal: 14, color: '#17231f', fontSize: 16 },
  button: { marginTop: 20, backgroundColor: '#1d6b58', padding: 15, borderRadius: 12, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  disabled: { opacity: 0.6 },
  card: { marginTop: 14, padding: 16, backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e2e9e4' },
  email: { color: '#17231f', fontSize: 15 },
  shopName: { color: '#17231f', fontSize: 17, fontWeight: '800' },
  detail: { marginTop: 5, color: '#66736e', fontSize: 13 },
  notice: { marginTop: 16, padding: 14, backgroundColor: '#fff4d6', borderRadius: 12 },
  noticeText: { color: '#67551f', fontSize: 13, lineHeight: 20 },
  message: { marginTop: 14, color: '#1d6b58', fontSize: 13, lineHeight: 19 },
  secondaryButton: { marginTop: 12, padding: 13, alignItems: 'center' },
  secondaryButtonText: { color: '#1d6b58', fontSize: 14, fontWeight: '700' },
});
