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
import { ReceiptField } from '../../components/ReceiptField';
import {
  createProcurement,
  formatAmount,
  getPaymentAccounts,
  getProducts,
  getProcurements,
  parseAmountToMinorUnits,
  type Account,
  type Product,
  type Procurement,
} from '../../lib/database';
import { useAuth } from '../../providers/AuthProvider';

export default function ProcurementScreen() {
  const db = useSQLiteContext();
  const { user } = useAuth();
  const [procurements, setProcurements] = useState<Procurement[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [supplier, setSupplier] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState('1');
  const [unitCost, setUnitCost] = useState('');
  const [paidAmount, setPaidAmount] = useState('0');
  const [accountId, setAccountId] = useState('');
  const [receiptUri, setReceiptUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    if (!user || user.role !== 'admin') return;
    const [entries, inventory, availableAccounts] = await Promise.all([
      getProcurements(db, user),
      getProducts(db),
      getPaymentAccounts(db),
    ]);
    setProcurements(entries);
    setProducts(inventory);
    setAccounts(availableAccounts);
    setAccountId((current) =>
      availableAccounts.some((account) => account.id === current)
        ? current
        : availableAccounts[0]?.id ?? '',
    );
  }, [db, user]);

  useFocusEffect(useCallback(() => {
    refresh().catch((error: unknown) => {
      Alert.alert('Could not load procurement', error instanceof Error ? error.message : 'Please try again.');
    });
  }, [refresh]));

  if (!user) return <Redirect href="/login" />;
  if (user.role !== 'admin') return <Redirect href="/(tabs)" />;

  const resetForm = () => {
    setSupplier('');
    setSelectedProduct(null);
    setQuantity('1');
    setUnitCost('');
    setPaidAmount('0');
    setAccountId(accounts[0]?.id ?? '');
    setReceiptUri(null);
  };

  const chooseProduct = (product: Product) => {
    setSelectedProduct(product);
    setUnitCost(formatAmount(product.costMinor));
  };

  const save = async () => {
    if (!user || user.role !== 'admin') {
      Alert.alert('Not allowed', 'Only an admin can record procurement.');
      return;
    }
    if (!selectedProduct) {
      Alert.alert('Choose a product', 'Select a product and size for this procurement.');
      return;
    }
    const parsedQuantity = Number(quantity);
    const unitCostMinor = parseAmountToMinorUnits(unitCost);
    const paidMinor = parseAmountToMinorUnits(paidAmount);
    if (unitCostMinor === null || paidMinor === null) {
      Alert.alert('Check the amounts', 'Enter valid unit cost and paid amount.');
      return;
    }
    if (paidMinor > 0 && !accounts.some((account) => account.id === accountId)) {
      Alert.alert('Choose a payment account', 'Select the account used to pay the supplier.');
      return;
    }
    setSaving(true);
    try {
      await createProcurement(db, user, {
        supplier,
        productId: selectedProduct.id,
        quantity: parsedQuantity,
        unitCostMinor,
        receiptUri,
        paidMinor,
        accountId: paidMinor > 0 ? accountId : null,
      });
      resetForm();
      setShowForm(false);
      await refresh();
      Alert.alert('Procurement saved', 'The purchase record and stock increase were saved together.');
    } catch (error) {
      Alert.alert('Could not save procurement', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const showPaymentAccounts = (parseAmountToMinorUnits(paidAmount) ?? 0) > 0;

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>ADMINISTRATION</Text>
            <Text style={styles.title}>Procurement</Text>
          </View>
          <Pressable style={styles.button} onPress={() => setShowForm(true)}>
            <Text style={styles.buttonText}>+ Receive stock</Text>
          </Pressable>
        </View>
        <Text style={styles.subtitle}>Record supplier purchases and increase stock on hand.</Text>
        {procurements.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No procurement recorded</Text>
            <Text style={styles.emptyText}>Received purchases will appear here with their stock movement.</Text>
          </View>
        ) : procurements.map((entry) => (
          <View style={styles.card} key={entry.id}>
            <View style={styles.row}>
              <View style={styles.grow}>
                <Text style={styles.productName}>{entry.productName} · Size {entry.size}</Text>
                <Text style={styles.meta}>{entry.supplier} · {new Date(entry.createdAt).toLocaleString()}</Text>
                <Text style={styles.meta}>{entry.quantity} pairs · {formatAmount(entry.unitCostMinor)} each</Text>
                <Text style={styles.meta}>Recorded by {entry.createdBy}</Text>
                <Text style={styles.meta}>{entry.paidMinor === entry.totalMinor ? 'Paid' : `${formatAmount(entry.paidMinor)} paid · ${formatAmount(entry.totalMinor - entry.paidMinor)} unpaid`}</Text>
              </View>
              <Text style={styles.total}>{formatAmount(entry.totalMinor)}</Text>
            </View>
            {entry.receiptUri && <Text style={styles.receipt}>Receipt attached</Text>}
            {entry.accountId && <Text style={styles.meta}>Paid from account · {formatAmount(entry.paidMinor)}</Text>}
          </View>
        ))}
      </ScrollView>

      <Modal visible={showForm} animationType="slide" onRequestClose={() => setShowForm(false)}>
        <KeyboardAvoidingView style={styles.modalScreen} behavior="padding">
          <ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
            <Text style={styles.eyebrow}>STOCK RECEIVING</Text>
            <Text style={styles.modalTitle}>Record purchase</Text>
            <Text style={styles.subtitle}>This milestone records one product size per purchase entry.</Text>
            <FormField label="Supplier" value={supplier} onChangeText={setSupplier} placeholder="Supplier name" />
            <Text style={styles.label}>Product and size</Text>
            {products.length === 0 ? (
              <Text style={styles.hint}>Add a product and size in Inventory before recording a purchase.</Text>
            ) : products.map((product) => (
              <Pressable
                key={product.id}
                style={[styles.productChoice, selectedProduct?.id === product.id && styles.selectedProductChoice]}
                onPress={() => chooseProduct(product)}
              >
                <Text style={styles.choiceName}>{product.name} · Size {product.size}</Text>
                <Text style={styles.choiceStock}>{product.stock} in stock</Text>
              </Pressable>
            ))}
            <FormField label="Quantity received" value={quantity} onChangeText={setQuantity} placeholder="1" keyboardType="number-pad" />
            <FormField label="Unit cost" value={unitCost} onChangeText={setUnitCost} placeholder="0.00" keyboardType="decimal-pad" />
            <ReceiptField uri={receiptUri} onChange={setReceiptUri} />
            <FormField label="Amount paid now (0 for unpaid)" value={paidAmount} onChangeText={setPaidAmount} placeholder="0.00" keyboardType="decimal-pad" />
            {showPaymentAccounts && (
              <>
                <Text style={styles.label}>Payment account</Text>
                {accounts.map((account) => (
                  <Pressable
                    key={account.id}
                    style={[styles.productChoice, accountId === account.id && styles.selectedProductChoice]}
                    onPress={() => setAccountId(account.id)}
                  >
                    <Text style={styles.choiceName}>{account.name} · {account.kind}</Text>
                    <Text style={styles.choiceStock}>{formatAmount(account.balanceMinor)}</Text>
                  </Pressable>
                ))}
              </>
            )}
            <Text style={styles.hint}>Paid amounts reduce the selected account balance. A zero payment records an unpaid purchase.</Text>
            <Pressable
              style={[styles.button, styles.saveButton, (saving || products.length === 0) && styles.disabled]}
              disabled={saving || products.length === 0}
              onPress={save}
            >
              <Text style={styles.buttonText}>{saving ? 'Saving…' : 'Save purchase and stock'}</Text>
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
  keyboardType?: 'default' | 'decimal-pad' | 'number-pad';
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{props.label}</Text>
      <TextInput
        style={styles.input}
        value={props.value}
        onChangeText={props.onChangeText}
        placeholder={props.placeholder}
        keyboardType={props.keyboardType ?? 'default'}
      />
    </View>
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
  productName: { color: '#17231f', fontSize: 15, fontWeight: '700' },
  meta: { marginTop: 6, color: '#66736e', fontSize: 12 },
  total: { color: '#1d6b58', fontSize: 16, fontWeight: '800' },
  receipt: { marginTop: 8, color: '#1d6b58', fontSize: 12, fontWeight: '700' },
  modalScreen: { flex: 1, backgroundColor: '#f4f6f3' },
  modalContent: { padding: 22, paddingTop: 62, paddingBottom: 36 },
  modalTitle: { marginTop: 8, color: '#17231f', fontSize: 24, fontWeight: '800' },
  field: { marginTop: 18 },
  label: { marginBottom: 7, color: '#344740', fontSize: 13, fontWeight: '700' },
  input: { minHeight: 50, backgroundColor: '#fff', borderWidth: 1, borderColor: '#d8e1db', borderRadius: 12, paddingHorizontal: 14, color: '#17231f', fontSize: 16 },
  hint: { marginTop: 12, color: '#66736e', fontSize: 12, lineHeight: 18 },
  productChoice: { marginTop: 8, padding: 13, borderWidth: 1, borderColor: '#d8e1db', borderRadius: 12, backgroundColor: '#fff', flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  selectedProductChoice: { borderColor: '#1d6b58', backgroundColor: '#e4f1eb' },
  choiceName: { flex: 1, color: '#17231f', fontSize: 13, fontWeight: '600' },
  choiceStock: { color: '#66736e', fontSize: 12 },
  saveButton: { marginTop: 22 },
  disabled: { opacity: 0.65 },
  cancel: { marginTop: 10, padding: 13, alignItems: 'center' },
  cancelText: { color: '#52635b', fontWeight: '700', fontSize: 15 },
});
