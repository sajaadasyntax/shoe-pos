import { useCallback, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { ArabicAlert as Alert, ArabicText as Text, ArabicTextInput as TextInput, formatArabicDateTime } from '../../components/ArabicUI';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { ReceiptField } from '../../components/ReceiptField';
import {
  createExpense,
  formatAmount,
  getExpenses,
  getPaymentAccounts,
  parseAmountToMinorUnits,
  type Account,
  type Expense,
} from '../../lib/database';
import { useAuth } from '../../providers/AuthProvider';

export default function ExpensesScreen() {
  const db = useSQLiteContext();
  const { user } = useAuth();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [category, setCategory] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [accountId, setAccountId] = useState('');
  const [receiptUri, setReceiptUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) return;
    const [items, availableAccounts] = await Promise.all([getExpenses(db, user), getPaymentAccounts(db)]);
    setExpenses(items);
    setAccounts(availableAccounts);
    setAccountId((current) =>
      availableAccounts.some((account) => account.id === current)
        ? current
        : availableAccounts[0]?.id ?? '',
    );
  }, [db, user]);

  useFocusEffect(useCallback(() => {
    refresh().catch((error: unknown) => {
      Alert.alert('Could not load expenses', error instanceof Error ? error.message : 'Please try again.');
    });
  }, [refresh]));

  const resetForm = () => {
    setCategory('');
    setAmount('');
    setNote('');
    setAccountId(accounts[0]?.id ?? '');
    setReceiptUri(null);
  };

  const save = async () => {
    if (!user) {
      Alert.alert('Sign in required', 'Sign in before recording an expense.');
      return;
    }
    const amountMinor = parseAmountToMinorUnits(amount);
    if (amountMinor === null || amountMinor <= 0) {
      Alert.alert('Check the amount', 'Enter a valid amount greater than zero.');
      return;
    }
    const account = accounts.find((item) => item.id === accountId);
    if (!account) {
      Alert.alert('Choose an account', 'An active cash or bank account is required to record an expense.');
      return;
    }

    setSaving(true);
    try {
      await createExpense(db, user, {
        category,
        amountMinor,
        paymentMethod: account.kind,
        accountId,
        note,
        receiptUri,
      });
      resetForm();
      setShowForm(false);
      await refresh();
    } catch (error) {
      Alert.alert('Could not save expense', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>{user?.role === 'admin' ? 'STORE-WIDE' : 'YOUR RECORDS'}</Text>
            <Text style={styles.title}>Expenses</Text>
          </View>
          <Pressable style={styles.button} onPress={() => setShowForm(true)}>
            <Text style={styles.buttonText}>+ Add expense</Text>
          </Pressable>
        </View>
        <Text style={styles.subtitle}>
          {user?.role === 'admin' ? 'Expenses recorded by every user.' : 'Only you can see the expenses you record.'}
        </Text>
        {expenses.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No expenses yet</Text>
            <Text style={styles.emptyText}>Record an expense to keep it in the offline ledger.</Text>
          </View>
        ) : expenses.map((expense) => (
          <View key={expense.id} style={styles.card}>
            <View style={styles.row}>
              <View style={styles.grow}>
                <Text style={styles.category}>{expense.category}</Text>
                <Text style={styles.meta}>{formatArabicDateTime(expense.createdAt)}</Text>
                {user?.role === 'admin' && <Text style={styles.meta}>Recorded by {expense.userName}</Text>}
              </View>
              <View style={styles.amountBlock}>
                <Text style={styles.amount}>{formatAmount(expense.amountMinor)}</Text>
                <Text style={styles.payment}>{expense.accountName ?? expense.paymentMethod.toUpperCase()}</Text>
              </View>
            </View>
            {expense.note && <Text style={styles.note}>{expense.note}</Text>}
            {expense.receiptUri && <Text style={styles.receipt}>Receipt attached</Text>}
            {expense.accountName && <Text style={styles.meta}>Paid from {expense.accountName}</Text>}
          </View>
        ))}
      </ScrollView>

      <Modal visible={showForm} animationType="slide" onRequestClose={() => setShowForm(false)}>
        <KeyboardAvoidingView style={styles.modalScreen} behavior="padding">
          <ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
            <Text style={styles.eyebrow}>OFFLINE EXPENSE</Text>
            <Text style={styles.modalTitle}>Add expense</Text>
            <Text style={styles.subtitle}>This expense will be recorded for {user?.name}.</Text>
            <FormField label="Category" value={category} onChangeText={setCategory} placeholder="e.g. Delivery, supplies" />
            <FormField label="Amount" value={amount} onChangeText={setAmount} placeholder="0.00" keyboardType="decimal-pad" />
            <Text style={styles.label}>Payment account</Text>
            {accounts.map((account) => (
              <Choice
                key={account.id}
                label={`${account.name} · ${account.kind}`}
                active={accountId === account.id}
                onPress={() => setAccountId(account.id)}
              />
            ))}
            {accounts.length === 0 && <Text style={styles.hint}>Ask an admin to set up a payment account first.</Text>}
            <FormField label="Note (optional)" value={note} onChangeText={setNote} placeholder="Add details" multiline />
            <ReceiptField uri={receiptUri} onChange={setReceiptUri} />
            <Pressable style={[styles.button, styles.saveButton, (saving || accounts.length === 0) && styles.disabled]} disabled={saving || accounts.length === 0} onPress={save}>
              <Text style={styles.buttonText}>{saving ? 'Saving…' : 'Save expense offline'}</Text>
            </Pressable>
            <Pressable style={styles.cancel} onPress={() => { resetForm(); setShowForm(false); }}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function FormField(props: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  keyboardType?: 'default' | 'decimal-pad';
  multiline?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{props.label}</Text>
      <TextInput
        style={[styles.input, props.multiline && styles.multiline]}
        value={props.value}
        onChangeText={props.onChangeText}
        placeholder={props.placeholder}
        keyboardType={props.keyboardType ?? 'default'}
        multiline={props.multiline}
        maxLength={props.multiline ? 500 : undefined}
      />
    </View>
  );
}

function Choice(props: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: props.active }}
      style={[styles.choice, props.active && styles.activeChoice]}
      onPress={props.onPress}
    >
      <Text style={[styles.choiceText, props.active && styles.activeChoiceText]}>{props.label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f4f6f3' },
  content: { padding: 20, paddingTop: 56, paddingBottom: 32 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  eyebrow: { color: '#58776a', fontSize: 11, fontWeight: '700', letterSpacing: 1.2 },
  title: { marginTop: 7, color: '#17231f', fontSize: 30, fontWeight: '800' },
  subtitle: { marginTop: 7, marginBottom: 14, color: '#66736e', fontSize: 14, lineHeight: 20 },
  button: { backgroundColor: '#1d6b58', paddingHorizontal: 16, paddingVertical: 13, borderRadius: 12, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  emptyCard: { marginTop: 14, padding: 22, backgroundColor: '#fff', borderRadius: 18, borderWidth: 1, borderColor: '#e2e9e4' },
  emptyTitle: { color: '#17231f', fontSize: 18, fontWeight: '700' },
  emptyText: { marginTop: 8, color: '#66736e', fontSize: 14, lineHeight: 20 },
  card: { marginTop: 12, padding: 16, backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#e2e9e4' },
  row: { flexDirection: 'row', gap: 12 },
  grow: { flex: 1 },
  category: { color: '#17231f', fontSize: 16, fontWeight: '700' },
  meta: { marginTop: 5, color: '#66736e', fontSize: 12 },
  amountBlock: { alignItems: 'flex-end' },
  amount: { color: '#9c2f2f', fontSize: 17, fontWeight: '800' },
  payment: { marginTop: 5, color: '#52635b', fontSize: 10, fontWeight: '800' },
  note: { marginTop: 11, color: '#344740', fontSize: 13, lineHeight: 19 },
  receipt: { marginTop: 8, color: '#1d6b58', fontSize: 12, fontWeight: '700' },
  hint: { marginTop: 12, color: '#66736e', fontSize: 12, lineHeight: 18 },
  modalScreen: { flex: 1, backgroundColor: '#f4f6f3' },
  modalContent: { padding: 22, paddingTop: 62, paddingBottom: 36 },
  modalTitle: { marginTop: 8, color: '#17231f', fontSize: 24, fontWeight: '800' },
  field: { marginTop: 18 },
  label: { marginBottom: 7, color: '#344740', fontSize: 13, fontWeight: '700' },
  input: { minHeight: 50, backgroundColor: '#fff', borderWidth: 1, borderColor: '#d8e1db', borderRadius: 12, paddingHorizontal: 14, color: '#17231f', fontSize: 16 },
  multiline: { minHeight: 88, paddingTop: 12, textAlignVertical: 'top' },
  choice: { marginTop: 7, padding: 13, borderWidth: 1, borderColor: '#cbd8d0', borderRadius: 12, alignItems: 'center', backgroundColor: '#fff' },
  activeChoice: { borderColor: '#1d6b58', backgroundColor: '#e4f1eb' },
  choiceText: { color: '#52635b', fontWeight: '700' },
  activeChoiceText: { color: '#1d6b58' },
  saveButton: { marginTop: 24 },
  disabled: { opacity: 0.65 },
  cancel: { marginTop: 10, padding: 13, alignItems: 'center' },
  cancelText: { color: '#52635b', fontWeight: '700', fontSize: 15 },
});
