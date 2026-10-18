import { Redirect, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { ArabicAlert as Alert, ArabicText as Text, ArabicTextInput as TextInput, formatArabicDateTime } from '../../components/ArabicUI';
import { useSQLiteContext } from 'expo-sqlite';
import {
  addOpeningBalance,
  createBankAccount,
  formatAmount,
  getAccounts,
  getRecentAccountMovements,
  parseAmountToMinorUnits,
  recordAccountAdjustment,
  transferBetweenAccounts,
  type Account,
  type AccountMovement,
} from '../../lib/database';
import { useAuth } from '../../providers/AuthProvider';

type DialogMode = 'bank' | 'opening' | 'adjustment' | 'transfer' | null;

export default function AccountsScreen() {
  const db = useSQLiteContext();
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [movements, setMovements] = useState<AccountMovement[]>([]);
  const [dialog, setDialog] = useState<DialogMode>(null);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [destinationId, setDestinationId] = useState('');
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    if (!user || user.role !== 'admin') return;
    const [result, history] = await Promise.all([
      getAccounts(db, user),
      getRecentAccountMovements(db, user),
    ]);
    setAccounts(result);
    setMovements(history);
    setSelectedAccountId((current) => result.some((account) => account.id === current) ? current : result[0]?.id ?? '');
    setDestinationId((current) => result.some((account) => account.id === current) ? current : result[1]?.id ?? '');
  }, [db, user]);

  useFocusEffect(useCallback(() => {
    refresh().catch((error: unknown) => {
      Alert.alert('Could not load balances', error instanceof Error ? error.message : 'Please try again.');
    });
  }, [refresh]));

  if (!user) return <Redirect href="/login" />;
  if (user.role !== 'admin') return <Redirect href="/(tabs)" />;

  const closeDialog = () => {
    setDialog(null);
    setName('');
    setAmount('');
    setReason('');
  };

  const save = async () => {
    if (!user || user.role !== 'admin') return;
    const adjustmentAmount = dialog === 'adjustment' && amount.startsWith('-')
      ? parseAmountToMinorUnits(amount.slice(1))
      : parseAmountToMinorUnits(amount);
    const amountMinor = adjustmentAmount === null
      ? null
      : dialog === 'adjustment' && amount.startsWith('-')
        ? -adjustmentAmount
        : adjustmentAmount;
    if (amountMinor === null) {
      Alert.alert('Check the amount', 'Enter a valid amount with up to two decimal places.');
      return;
    }
    setSaving(true);
    try {
      if (dialog === 'bank') {
        await createBankAccount(db, user, { name, openingBalanceMinor: amountMinor });
      } else if (dialog === 'opening') {
        if (!selectedAccountId) throw new Error('Choose the account receiving the opening balance.');
        await addOpeningBalance(db, user, selectedAccountId, amountMinor);
      } else if (dialog === 'adjustment') {
        if (!selectedAccountId) throw new Error('Choose the account to correct.');
        await recordAccountAdjustment(db, user, selectedAccountId, amountMinor, reason);
      } else if (dialog === 'transfer') {
        await transferBetweenAccounts(db, user, selectedAccountId, destinationId, amountMinor);
      }
      closeDialog();
      await refresh();
      Alert.alert(
        dialog === 'adjustment' ? 'Correction recorded' : 'Balance updated',
        dialog === 'adjustment' ? 'The correction and its reason were added to the account ledger.' : 'The account ledger was updated.',
      );
    } catch (error) {
      Alert.alert('Could not update account', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const totalBalance = accounts.reduce((total, account) => total + account.balanceMinor, 0);

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>FINANCIAL LEDGER</Text>
        <Text style={styles.title}>Balances</Text>
        <Text style={styles.subtitle}>Balances are calculated from auditable account movements.</Text>

        <View style={styles.summary}>
          <Text style={styles.summaryLabel}>All accounts</Text>
          <Text style={styles.summaryAmount}>{formatAmount(totalBalance)}</Text>
          <Text style={styles.summaryHint}>Opening balance + sales − expenses − paid procurement ± transfers ± corrections</Text>
        </View>

        {accounts.map((account) => (
          <View key={account.id} style={styles.accountCard}>
            <View style={styles.accountHeader}>
              <View style={styles.grow}>
                <Text style={styles.accountName}>{account.name}</Text>
                <Text style={styles.kind}>{account.kind.toUpperCase()}</Text>
              </View>
              <Text style={[styles.accountBalance, account.balanceMinor < 0 && styles.negative]}>
                {formatAmount(account.balanceMinor)}
              </Text>
            </View>
          </View>
        ))}

        <Pressable style={styles.button} onPress={() => setDialog('bank')}>
          <Text style={styles.buttonText}>+ Add bank account</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={() => setDialog('opening')}>
          <Text style={styles.secondaryButtonText}>Add opening balance</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={() => setDialog('adjustment')}>
          <Text style={styles.secondaryButtonText}>Record balance correction</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} disabled={accounts.length < 2} onPress={() => setDialog('transfer')}>
          <Text style={[styles.secondaryButtonText, accounts.length < 2 && styles.disabledText]}>Transfer between accounts</Text>
        </Pressable>
        {accounts.length < 2 && <Text style={styles.hint}>Add a bank account to enable account-to-account transfers.</Text>}

        <Text style={styles.historyTitle}>Recent account activity</Text>
        {movements.length === 0 ? (
          <Text style={styles.hint}>No account movements have been recorded.</Text>
        ) : (
          movements.map((movement) => (
            <View key={movement.id} style={styles.movementCard}>
              <View style={styles.movementHeading}>
                <View style={styles.grow}>
                  <Text style={styles.movementName}>{movementLabel(movement.movementType)}</Text>
                  <Text style={styles.movementMeta}>{movement.accountName} · {new Date(movement.createdAt).toLocaleString()}</Text>
                </View>
                <Text style={[styles.movementAmount, movement.amountMinor < 0 && styles.negative]}>
                  {movement.amountMinor > 0 ? '+' : ''}{formatAmount(movement.amountMinor)}
                </Text>
              </View>
              {movement.note && <Text style={styles.movementNote}>{movement.note}</Text>}
              <Text style={styles.movementBy}>Recorded by {movement.createdByName}</Text>
            </View>
          ))
        )}
      </ScrollView>

      <Modal visible={dialog !== null} animationType="slide" onRequestClose={closeDialog}>
        <KeyboardAvoidingView style={styles.modalScreen} behavior="padding">
          <ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
            <Text style={styles.eyebrow}>ACCOUNT MANAGEMENT</Text>
            <Text style={styles.modalTitle}>
              {dialog === 'bank'
                ? 'Add bank account'
                : dialog === 'opening'
                  ? 'Opening balance'
                  : dialog === 'adjustment'
                    ? 'Correct account balance'
                    : 'Transfer funds'}
            </Text>
            {dialog === 'bank' && (
              <Field label="Account name" value={name} onChangeText={setName} placeholder="e.g. Main bank" />
            )}
            {dialog !== 'bank' && (
              <>
                <Text style={styles.label}>{dialog === 'transfer' ? 'From account' : 'Account'}</Text>
                {accounts.map((account) => (
                  <AccountChoice
                    key={account.id}
                    account={account}
                    active={selectedAccountId === account.id}
                    onPress={() => setSelectedAccountId(account.id)}
                  />
                ))}
              </>
            )}
            {dialog === 'transfer' && (
              <>
                <Text style={[styles.label, styles.spaced]}>To account</Text>
                {accounts.filter((account) => account.id !== selectedAccountId).map((account) => (
                  <AccountChoice
                    key={account.id}
                    account={account}
                    active={destinationId === account.id}
                    onPress={() => setDestinationId(account.id)}
                  />
                ))}
              </>
            )}
            <Field
              label={dialog === 'bank' ? 'Opening balance (optional)' : dialog === 'adjustment' ? 'Correction amount (use - to decrease)' : 'Amount'}
              value={amount}
              onChangeText={setAmount}
              placeholder="0.00"
              keyboardType="decimal-pad"
            />
            {dialog === 'adjustment' && (
              <Field
                label="Reason (required)"
                value={reason}
                onChangeText={setReason}
                placeholder="Explain why the balance needs correcting"
              />
            )}
            {dialog === 'opening' && <Text style={styles.hint}>Opening balances add an auditable inflow. Use a balance correction to record a signed change with a reason.</Text>}
            {dialog === 'adjustment' && <Text style={styles.hint}>Corrections are append-only and do not alter historical sales, expenses, or transfers. They may result in a negative balance.</Text>}
            {dialog === 'transfer' && <Text style={styles.hint}>Transfers are recorded as linked debit and credit entries. The source account must have enough balance.</Text>}
            <Pressable style={[styles.button, styles.saveButton, saving && styles.disabled]} disabled={saving} onPress={save}>
              <Text style={styles.buttonText}>{saving ? 'Saving…' : dialog === 'adjustment' ? 'Record correction' : 'Save'}</Text>
            </Pressable>
            <Pressable style={styles.cancel} onPress={closeDialog}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function AccountChoice(props: { account: Account; active: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.accountChoice, props.active && styles.activeAccountChoice]} onPress={props.onPress}>
      <Text style={styles.choiceName}>{props.account.name} · {props.account.kind}</Text>
      <Text style={styles.choiceBalance}>{formatAmount(props.account.balanceMinor)}</Text>
    </Pressable>
  );
}

function movementLabel(type: AccountMovement['movementType']): string {
  switch (type) {
    case 'opening_balance': return 'Opening balance';
    case 'sale': return 'Sale';
    case 'expense': return 'Expense';
    case 'procurement': return 'Procurement payment';
    case 'transfer_in': return 'Transfer received';
    case 'transfer_out': return 'Transfer sent';
    case 'adjustment': return 'Balance correction';
  }
}

function Field(props: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  keyboardType?: 'default' | 'decimal-pad';
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{props.label}</Text>
      <TextInput style={styles.input} value={props.value} onChangeText={props.onChangeText} placeholder={props.placeholder} keyboardType={props.keyboardType ?? 'default'} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f4f6f3' },
  content: { padding: 20, paddingTop: 56, paddingBottom: 32 },
  eyebrow: { color: '#58776a', fontSize: 11, fontWeight: '700', letterSpacing: 1.2 },
  title: { marginTop: 7, color: '#17231f', fontSize: 30, fontWeight: '800' },
  subtitle: { marginTop: 7, marginBottom: 14, color: '#66736e', fontSize: 14, lineHeight: 20 },
  summary: { padding: 18, backgroundColor: '#1d6b58', borderRadius: 18 },
  summaryLabel: { color: '#d0e5db', fontSize: 13, fontWeight: '600' },
  summaryAmount: { marginTop: 7, color: '#fff', fontSize: 28, fontWeight: '800' },
  summaryHint: { marginTop: 7, color: '#d0e5db', fontSize: 11, lineHeight: 16 },
  accountCard: { marginTop: 12, padding: 16, backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#e2e9e4' },
  accountHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  grow: { flex: 1 },
  accountName: { color: '#17231f', fontSize: 16, fontWeight: '700' },
  kind: { marginTop: 5, color: '#66736e', fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  accountBalance: { color: '#1d6b58', fontSize: 19, fontWeight: '800' },
  negative: { color: '#9c2f2f' },
  button: { marginTop: 18, backgroundColor: '#1d6b58', padding: 14, borderRadius: 12, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  secondaryButton: { marginTop: 10, padding: 14, borderWidth: 1, borderColor: '#cbd8d0', borderRadius: 12, alignItems: 'center', backgroundColor: '#fff' },
  secondaryButtonText: { color: '#1d6b58', fontSize: 14, fontWeight: '700' },
  disabledText: { color: '#8a9690' },
  hint: { marginTop: 9, color: '#66736e', fontSize: 12, lineHeight: 18 },
  historyTitle: { marginTop: 26, marginBottom: 4, color: '#17231f', fontSize: 18, fontWeight: '800' },
  movementCard: { marginTop: 9, padding: 14, backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e2e9e4' },
  movementHeading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  movementName: { color: '#17231f', fontSize: 14, fontWeight: '700' },
  movementMeta: { marginTop: 5, color: '#66736e', fontSize: 11 },
  movementAmount: { color: '#1d6b58', fontSize: 14, fontWeight: '800' },
  movementNote: { marginTop: 9, color: '#344740', fontSize: 12, lineHeight: 17 },
  movementBy: { marginTop: 7, color: '#87928d', fontSize: 10 },
  modalScreen: { flex: 1, backgroundColor: '#f4f6f3' },
  modalContent: { padding: 22, paddingTop: 62, paddingBottom: 36 },
  modalTitle: { marginTop: 8, marginBottom: 8, color: '#17231f', fontSize: 24, fontWeight: '800' },
  label: { marginTop: 15, marginBottom: 7, color: '#344740', fontSize: 13, fontWeight: '700' },
  spaced: { marginTop: 20 },
  field: { marginTop: 18 },
  input: { minHeight: 50, backgroundColor: '#fff', borderWidth: 1, borderColor: '#d8e1db', borderRadius: 12, paddingHorizontal: 14, color: '#17231f', fontSize: 16 },
  accountChoice: { marginTop: 7, padding: 13, borderWidth: 1, borderColor: '#d8e1db', borderRadius: 12, backgroundColor: '#fff', flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  activeAccountChoice: { borderColor: '#1d6b58', backgroundColor: '#e4f1eb' },
  choiceName: { color: '#17231f', fontSize: 13, fontWeight: '600' },
  choiceBalance: { color: '#66736e', fontSize: 12 },
  saveButton: { marginTop: 24 },
  disabled: { opacity: 0.65 },
  cancel: { marginTop: 10, padding: 13, alignItems: 'center' },
  cancelText: { color: '#52635b', fontWeight: '700', fontSize: 15 },
});
