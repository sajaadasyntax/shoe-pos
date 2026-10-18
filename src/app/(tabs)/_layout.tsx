import { Redirect, Tabs } from 'expo-router';
import { ArabicText as Text, arabicText } from '../../components/ArabicUI';
import { useAuth } from '../../providers/AuthProvider';
import { useActivation } from '../../providers/ActivationProvider';

function tabLabel(label: string) {
  return function TabBarLabel({ focused }: { focused: boolean }) {
    return (
      <Text style={{ color: focused ? '#1d6b58' : '#52635b', fontSize: 12, fontWeight: focused ? '800' : '600' }}>
        {label}
      </Text>
    );
  };
}

export default function TabLayout() {
  const { status, user } = useAuth();
  const activation = useActivation();
  if (!activation.loading && !activation.activated) return <Redirect href="/activate" />;
  if (activation.loading) return null;
  if (status !== 'signedIn' || !user) return <Redirect href={status === 'setup' ? '/setup' : '/login'} />;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarIcon: () => null,
        tabBarActiveBackgroundColor: '#edf5f1',
        tabBarInactiveBackgroundColor: '#fff',
        tabBarStyle: {
          height: 70,
          paddingBottom: 8,
          paddingTop: 8,
          backgroundColor: '#fff',
          borderTopColor: '#cbd8d0',
          borderTopWidth: 1,
          elevation: 10,
        },
      }}
    >
      <Tabs.Screen name="index" options={{ title: arabicText('Inventory'), tabBarLabel: tabLabel('Inventory') }} />
      <Tabs.Screen name="sales" options={{ title: arabicText('Sales'), tabBarLabel: tabLabel('Sales') }} />
      <Tabs.Screen name="expenses" options={{ title: arabicText('Expenses'), tabBarLabel: tabLabel('Expenses') }} />
      <Tabs.Screen
        name="users"
        options={{
          title: arabicText('User management'),
          tabBarLabel: tabLabel('Users'),
          href: user?.role === 'admin' ? undefined : null,
        }}
      />
      <Tabs.Screen name="more" options={{ title: arabicText('More'), tabBarLabel: tabLabel('More') }} />
      <Tabs.Screen name="reports" options={{ href: null }} />
      <Tabs.Screen name="procurement" options={{ href: null }} />
      <Tabs.Screen name="accounts" options={{ href: null }} />
      <Tabs.Screen name="whatsapp" options={{ href: null }} />
    </Tabs>
  );
}
