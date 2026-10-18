import { useCallback, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { ArabicAlert as Alert, ArabicText as Text, ArabicTextInput as TextInput } from '../../components/ArabicUI';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { ReceiptField } from '../../components/ReceiptField';
import {
  createProduct,
  createSale,
  deleteReceiptImage,
  formatAmount,
  getPaymentAccounts,
  getProducts,
  parseAmountToMinorUnits,
  updateProductPrices,
  type Account,
  type Product,
} from '../../lib/database';
import { useAuth } from '../../providers/AuthProvider';

export default function InventoryScreen() {
  const db = useSQLiteContext();
  const { user, signOut } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isAddingProduct, setIsAddingProduct] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [size, setSize] = useState('');
  const [price, setPrice] = useState('');
  const [cost, setCost] = useState('');
  const [openingStock, setOpeningStock] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [paymentAccountId, setPaymentAccountId] = useState('');
  const [saleReceiptUri, setSaleReceiptUri] = useState<string | null>(null);

  const refreshProducts = useCallback(async () => {
    const [result, availableAccounts] = await Promise.all([getProducts(db), getPaymentAccounts(db)]);
    setProducts(result);
    setAccounts(availableAccounts);
    setPaymentAccountId((current) =>
      availableAccounts.some((account) => account.id === current)
        ? current
        : availableAccounts[0]?.id ?? '',
    );
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      refreshProducts().catch((error: unknown) => {
        Alert.alert('Could not load inventory', error instanceof Error ? error.message : 'Please try again.');
      });
    }, [refreshProducts]),
  );

  const resetProductForm = () => {
    setName('');
    setSize('');
    setPrice('');
    setCost('');
    setOpeningStock('');
  };

  const closeProductForm = () => {
    setIsAddingProduct(false);
    setEditingProduct(null);
    resetProductForm();
  };

  const openPriceEditor = (product: Product) => {
    setName(product.name);
    setSize(product.size);
    setPrice(formatAmount(product.priceMinor));
    setCost(formatAmount(product.costMinor));
    setOpeningStock('');
    setEditingProduct(product);
  };

  const saveProduct = async () => {
    const priceMinor = parseAmountToMinorUnits(price);
    const costMinor = parseAmountToMinorUnits(cost);
    const stock = Number(openingStock);
    if (priceMinor === null || costMinor === null || (!editingProduct && openingStock.trim() === '')) {
      Alert.alert('Check product details', 'Enter valid selling and cost prices, plus opening stock for a new item.');
      return;
    }

    setSaving(true);
    try {
      if (!user) throw new Error('Sign in to manage products.');
      if (editingProduct) {
        await updateProductPrices(db, user, editingProduct.id, priceMinor, costMinor);
      } else {
        await createProduct(db, user, { name, size, priceMinor, costMinor, openingStock: stock });
      }
      closeProductForm();
      await refreshProducts();
      if (editingProduct) Alert.alert('Prices updated', 'The new prices apply to future sales.');
    } catch (error) {
      Alert.alert(editingProduct ? 'Could not update prices' : 'Could not save product', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const saveSale = async () => {
    if (!selectedProduct) return;
    const parsedQuantity = Number(quantity);
    if (!Number.isSafeInteger(parsedQuantity) || parsedQuantity <= 0) {
      Alert.alert('Invalid quantity', 'Enter a whole number greater than zero.');
      return;
    }

    setSaving(true);
    try {
      if (!user) throw new Error('Sign in to record a sale.');
      await createSale(db, user, selectedProduct, parsedQuantity, paymentAccountId, saleReceiptUri);
      setSelectedProduct(null);
      setQuantity('1');
      setSaleReceiptUri(null);
      await refreshProducts();
      Alert.alert('Sale saved', 'The sale and stock update were saved on this device.');
    } catch (error) {
      Alert.alert('Could not save sale', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const cancelSale = async () => {
    if (saleReceiptUri) {
      try {
        await deleteReceiptImage(saleReceiptUri);
      } catch (error) {
        Alert.alert('Could not remove receipt image', error instanceof Error ? error.message : 'Please try again.');
        return;
      }
    }
    setSaleReceiptUri(null);
    setSelectedProduct(null);
  };

  const normalizedSearch = searchQuery.trim().toLocaleLowerCase();
  const visibleProducts = normalizedSearch
    ? products.filter((product) =>
      product.name.toLocaleLowerCase().includes(normalizedSearch)
      || product.size.toLocaleLowerCase().includes(normalizedSearch))
    : products;

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>SHOE STORE · OFFLINE POS</Text>
            <Text style={styles.title}>Inventory</Text>
            <Text style={styles.subtitle}>{user?.name} · {user?.role === 'admin' ? 'Admin' : 'Sales user'}</Text>
          </View>
          <View style={styles.headerActions}>
            {user?.role === 'admin' && (
              <Pressable
                style={styles.primaryButton}
                onPress={() => {
                  resetProductForm();
                  setEditingProduct(null);
                  setIsAddingProduct(true);
                }}
              >
                <Text style={styles.primaryButtonText}>+ Add item</Text>
              </Pressable>
            )}
            <Pressable onPress={() => signOut().catch((error: unknown) => Alert.alert('Could not sign out', error instanceof Error ? error.message : 'Please try again.'))}>
              <Text style={styles.signOut}>Sign out</Text>
            </Pressable>
          </View>
        </View>
        <Text style={styles.subtitle}>Stock and prices are stored on this device.</Text>

        {products.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Your inventory is empty</Text>
            <Text style={styles.emptyText}>Add a shoe model, size, price, and opening stock to get started.</Text>
          </View>
        ) : (
          <>
            <TextInput
              accessibilityLabel="Search inventory by product name or size"
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search product name or size"
              returnKeyType="search"
              autoCapitalize="none"
            />
            {visibleProducts.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>No matching items</Text>
                <Text style={styles.emptyText}>Try another product name or shoe size.</Text>
              </View>
            ) : visibleProducts.map((product) => (
            <View key={product.id} style={styles.productRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Sell ${product.name}, size ${product.size}`}
                disabled={product.stock <= 0}
                onPress={() => setSelectedProduct(product)}
                style={[styles.productCard, product.stock <= 0 && styles.outOfStockCard]}
              >
                <View style={styles.productDescription}>
                  <Text style={styles.productName}>{product.name}</Text>
                  <Text style={styles.productMeta}>Size {product.size} · {product.stock} in stock</Text>
                </View>
                <View style={styles.productPriceBlock}>
                  <Text style={styles.productPrice}>{formatAmount(product.priceMinor)}</Text>
                  <Text style={styles.sellHint}>{product.stock > 0 ? 'Tap to sell' : 'Out of stock'}</Text>
                </View>
              </Pressable>
              {user?.role === 'admin' && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Edit prices for ${product.name}, size ${product.size}`}
                  style={styles.editPriceButton}
                  onPress={() => openPriceEditor(product)}
                >
                  <Text style={styles.editPriceButtonText}>Edit prices</Text>
                </Pressable>
              )}
            </View>
            ))}
          </>
        )}
      </ScrollView>

      <Modal
        visible={isAddingProduct || editingProduct !== null}
        animationType="slide"
        onRequestClose={closeProductForm}
      >
        <KeyboardAvoidingView
          style={styles.modalScreen}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
            <Text style={styles.eyebrow}>{editingProduct ? 'ITEM PRICING' : 'CATALOG SETUP'}</Text>
            <Text style={styles.modalTitle}>{editingProduct ? 'Edit item prices' : 'Add shoe size'}</Text>
            <Text style={styles.subtitle}>
              {editingProduct
                ? `${editingProduct.name} · size ${editingProduct.size}. Updated prices apply only to future sales.`
                : 'Add each size as its own stock item.'}
            </Text>
            {!editingProduct && (
              <>
                <Field label="Product name" value={name} onChangeText={setName} placeholder="e.g. Classic Runner" />
                <Field label="Size" value={size} onChangeText={setSize} placeholder="e.g. 39" />
              </>
            )}
            <Field label="Selling price" value={price} onChangeText={setPrice} placeholder="0.00" keyboardType="decimal-pad" />
            <Field label="Unit cost" value={cost} onChangeText={setCost} placeholder="0.00" keyboardType="decimal-pad" />
            {!editingProduct && (
              <Field label="Opening stock" value={openingStock} onChangeText={setOpeningStock} placeholder="0" keyboardType="number-pad" />
            )}
            <Text style={styles.formHint}>Prices are stored as exact minor units; currency display is not configured yet.</Text>
            <Pressable style={[styles.primaryButton, saving && styles.disabledButton]} disabled={saving} onPress={saveProduct}>
              <Text style={styles.primaryButtonText}>
                {saving ? 'Saving…' : editingProduct ? 'Save prices' : 'Save item'}
              </Text>
            </Pressable>
            <Pressable style={styles.cancelButton} onPress={closeProductForm}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={selectedProduct !== null} transparent animationType="fade" onRequestClose={() => { void cancelSale(); }}>
        <View style={styles.scrim}>
          <View style={styles.saleCard}>
            <Text style={styles.eyebrow}>NEW SALE</Text>
            <Text style={styles.modalTitle}>{selectedProduct?.name}</Text>
            <Text style={styles.subtitle}>Size {selectedProduct?.size} · {formatAmount(selectedProduct?.priceMinor ?? 0)} each</Text>
            <Field label="Quantity" value={quantity} onChangeText={setQuantity} keyboardType="number-pad" />
            <Text style={styles.fieldLabel}>Payment account</Text>
            {accounts.map((account) => (
              <ChoiceButton
                key={account.id}
                label={`${account.name} · ${account.kind}`}
                active={paymentAccountId === account.id}
                onPress={() => setPaymentAccountId(account.id)}
              />
            ))}
            {accounts.length === 0 && (
              <Text style={styles.formHint}>No active account is available. Ask an admin to check account setup.</Text>
            )}
            <Text style={styles.formHint}>The sale is recorded as a cash/bank inflow in the selected account.</Text>
            {accounts.find((account) => account.id === paymentAccountId)?.kind === 'bank' && (
              <ReceiptField uri={saleReceiptUri} onChange={setSaleReceiptUri} />
            )}
            <Pressable style={[styles.primaryButton, (saving || accounts.length === 0) && styles.disabledButton]} disabled={saving || accounts.length === 0} onPress={saveSale}>
              <Text style={styles.primaryButtonText}>{saving ? 'Saving…' : 'Save sale offline'}</Text>
            </Pressable>
            <Pressable style={styles.cancelButton} onPress={() => { void cancelSale(); }}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'decimal-pad' | 'number-pad';
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{props.label}</Text>
      <TextInput
        style={styles.input}
        value={props.value}
        onChangeText={props.onChangeText}
        placeholder={props.placeholder}
        keyboardType={props.keyboardType ?? 'default'}
        autoCapitalize="sentences"
      />
    </View>
  );
}

function ChoiceButton(props: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: props.active }}
      onPress={props.onPress}
      style={[styles.choiceButton, props.active && styles.activeChoiceButton]}
    >
      <Text style={[styles.choiceButtonText, props.active && styles.activeChoiceButtonText]}>{props.label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f4f6f3' },
  content: { padding: 20, paddingTop: 56, paddingBottom: 32 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  headerActions: { alignItems: 'flex-end', gap: 10 },
  signOut: { color: '#52635b', fontSize: 12, fontWeight: '700' },
  eyebrow: { color: '#58776a', fontSize: 11, fontWeight: '700', letterSpacing: 1.2 },
  title: { marginTop: 7, color: '#17231f', fontSize: 30, fontWeight: '800' },
  subtitle: { marginTop: 7, color: '#66736e', fontSize: 14, lineHeight: 20 },
  primaryButton: { backgroundColor: '#1d6b58', paddingHorizontal: 16, paddingVertical: 13, borderRadius: 12, alignItems: 'center' },
  primaryButtonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  emptyCard: { marginTop: 28, padding: 22, backgroundColor: '#fff', borderRadius: 18, borderWidth: 1, borderColor: '#e2e9e4' },
  emptyTitle: { color: '#17231f', fontSize: 18, fontWeight: '700' },
  emptyText: { marginTop: 8, color: '#66736e', fontSize: 14, lineHeight: 20 },
  searchInput: { marginTop: 18, minHeight: 50, backgroundColor: '#fff', borderWidth: 1, borderColor: '#d8e1db', borderRadius: 12, paddingHorizontal: 14, color: '#17231f', fontSize: 15 },
  productRow: { marginTop: 12 },
  productCard: { padding: 16, backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#e2e9e4', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  outOfStockCard: { opacity: 0.58 },
  productDescription: { flex: 1 },
  productName: { color: '#17231f', fontSize: 16, fontWeight: '700' },
  productMeta: { marginTop: 6, color: '#66736e', fontSize: 13 },
  productPriceBlock: { alignItems: 'flex-end' },
  productPrice: { color: '#1d6b58', fontSize: 17, fontWeight: '800' },
  sellHint: { marginTop: 5, color: '#66736e', fontSize: 12 },
  editPriceButton: { alignSelf: 'flex-end', marginTop: 6, paddingHorizontal: 12, paddingVertical: 7 },
  editPriceButtonText: { color: '#1d6b58', fontSize: 12, fontWeight: '700' },
  modalScreen: { flex: 1, backgroundColor: '#f4f6f3' },
  modalContent: { padding: 22, paddingTop: 62, paddingBottom: 36 },
  modalTitle: { marginTop: 8, color: '#17231f', fontSize: 24, fontWeight: '800' },
  field: { marginTop: 18 },
  fieldLabel: { marginBottom: 7, color: '#344740', fontSize: 13, fontWeight: '700' },
  input: { minHeight: 50, backgroundColor: '#fff', borderWidth: 1, borderColor: '#d8e1db', borderRadius: 12, paddingHorizontal: 14, color: '#17231f', fontSize: 16 },
  formHint: { marginTop: 12, marginBottom: 18, color: '#66736e', fontSize: 12, lineHeight: 17 },
  cancelButton: { marginTop: 10, padding: 13, alignItems: 'center' },
  cancelButtonText: { color: '#52635b', fontWeight: '700', fontSize: 15 },
  disabledButton: { opacity: 0.65 },
  scrim: { flex: 1, backgroundColor: 'rgba(18, 29, 24, 0.45)', justifyContent: 'center', padding: 20 },
  saleCard: { backgroundColor: '#f4f6f3', padding: 22, borderRadius: 20 },
  choiceButton: { marginTop: 4, padding: 13, borderWidth: 1, borderColor: '#cbd8d0', borderRadius: 12, alignItems: 'center', backgroundColor: '#fff' },
  activeChoiceButton: { borderColor: '#1d6b58', backgroundColor: '#e4f1eb' },
  choiceButtonText: { color: '#52635b', fontWeight: '700' },
  activeChoiceButtonText: { color: '#1d6b58' },
});
