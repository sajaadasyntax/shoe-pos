import { Redirect, Tabs } from 'expo-router';
import { useAuth } from '../../providers/AuthProvider';
import { useActivation } from '../../providers/ActivationProvider';

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
        tabBarActiveTintColor: '#1d6b58',
        tabBarInactiveTintColor: '#66736e',
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarStyle: { height: 64, paddingBottom: 8, paddingTop: 6 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Inventory', tabBarLabel: 'Inventory' }} />
      <Tabs.Screen name="sales" options={{ title: 'Sales', tabBarLabel: 'Sales' }} />
      <Tabs.Screen name="expenses" options={{ title: 'Expenses', tabBarLabel: 'Expenses' }} />
      <Tabs.Screen
        name="reports"
        options={{
          title: 'Reports',
          tabBarLabel: 'Reports',
          href: user?.role === 'admin' ? undefined : null,
        }}
      />
      <Tabs.Screen name="more" options={{ title: 'More', tabBarLabel: 'More' }} />
      <Tabs.Screen name="procurement" options={{ href: null }} />
      <Tabs.Screen name="users" options={{ href: null }} />
      <Tabs.Screen name="accounts" options={{ href: null }} />
      <Tabs.Screen name="whatsapp" options={{ href: null }} />
    </Tabs>
  );
}
