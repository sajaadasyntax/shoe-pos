import { Redirect, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { ArabicAlert as Alert, ArabicText as Text, arabicText } from '../../components/ArabicUI';
import { useSQLiteContext } from 'expo-sqlite';
import { formatAmount, getReportSummary, type ReportSummary } from '../../lib/database';
import { useAuth } from '../../providers/AuthProvider';

function dateValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dateFromValue(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export default function ReportsScreen() {
  const db = useSQLiteContext();
  const { user } = useAuth();
  const today = dateValue(new Date());
  const [startDate, setStartDate] = useState(`${today.slice(0, 8)}01`);
  const [endDate, setEndDate] = useState(today);
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [datePickerTarget, setDatePickerTarget] = useState<'start' | 'end' | null>(null);

  const refresh = useCallback(async () => {
    if (!user || user.role !== 'admin') return;
    setLoading(true);
    try {
      setSummary(await getReportSummary(db, user, startDate, endDate));
    } catch (error) {
      Alert.alert('Could not load reports', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setLoading(false);
    }
  }, [db, endDate, startDate, user]);

  useFocusEffect(useCallback(() => {
    refresh();
  }, [refresh]));

  if (!user) return <Redirect href="/login" />;
  if (user.role !== 'admin') return <Redirect href="/(tabs)" />;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.eyebrow}>STORE PERFORMANCE</Text>
      <Text style={styles.title}>Reports</Text>
      <Text style={styles.subtitle}>Sales, procurement, expenses, and estimated profit for this device.</Text>

      <View style={styles.rangeCard}>
        <DateField label="From date" value={startDate} onPress={() => setDatePickerTarget('start')} />
        <DateField label="To date" value={endDate} onPress={() => setDatePickerTarget('end')} />
        <Pressable style={styles.button} disabled={loading} onPress={() => refresh()}>
          <Text style={styles.buttonText}>{loading ? 'Loading…' : 'Apply date range'}</Text>
        </Pressable>
      </View>
      {datePickerTarget && (
        <DateTimePicker
          value={dateFromValue(datePickerTarget === 'start' ? startDate : endDate)}
          mode="date"
          display="calendar"
          maximumDate={datePickerTarget === 'start' ? dateFromValue(endDate) : undefined}
          minimumDate={datePickerTarget === 'end' ? dateFromValue(startDate) : undefined}
          onChange={(event, selectedDate) => {
            if (event.type === 'set' && selectedDate) {
              const value = dateValue(selectedDate);
              if (datePickerTarget === 'start') setStartDate(value);
              else setEndDate(value);
            }
            setDatePickerTarget(null);
          }}
        />
      )}

      {summary && (
        <>
          <Text style={styles.sectionTitle}>Sales report</Text>
          <ReportCard label="Sales transactions" count={summary.salesCount} amount={summary.salesMinor} />
          <Text style={styles.sectionTitle}>Procurement report</Text>
          <ReportCard label="Procurement entries" count={summary.procurementCount} amount={summary.procurementMinor} />
          <Text style={styles.sectionTitle}>Profit and loss</Text>
          <Metric label="Sales revenue" amount={summary.salesMinor} />
          <Metric label="Cost of goods sold" amount={-summary.costOfGoodsMinor} />
          <Metric label="Gross profit" amount={summary.grossProfitMinor} emphasized />
          <Metric label="Recorded expenses" amount={-summary.expenseMinor} />
          <Metric label="Net profit (estimate)" amount={summary.netProfitMinor} emphasized />
          <Text style={styles.note}>
            Formula: sales revenue − the captured unit costs of items sold − recorded expenses. Procurement is a stock purchase, not an immediate P&L expense. This report does not yet account for returns, discounts, taxes, unpaid supplier balances, or historical account balances.
          </Text>
        </>
      )}
    </ScrollView>
  );
}

function DateField(props: { label: string; value: string; onPress: () => void }) {
  return (
    <View style={styles.dateField}>
      <Text style={styles.label}>{props.label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${arabicText(props.label) ?? props.label}: ${props.value}`}
        onPress={props.onPress}
        style={styles.dateButton}
      >
        <Text style={styles.dateButtonText}>{props.value}</Text>
        <Text style={styles.calendarIcon}>📅</Text>
      </Pressable>
    </View>
  );
}

function ReportCard(props: { label: string; count: number; amount: number }) {
  return (
    <View style={styles.reportCard}>
      <Text style={styles.metricLabel}>{props.label}</Text>
      <Text style={styles.amount}>{formatAmount(props.amount)}</Text>
      <Text style={styles.count}>{props.count} records</Text>
    </View>
  );
}

function Metric(props: { label: string; amount: number; emphasized?: boolean }) {
  return (
    <View style={[styles.metric, props.emphasized && styles.emphasizedMetric]}>
      <Text style={[styles.metricLabel, props.emphasized && styles.emphasizedText]}>{props.label}</Text>
      <Text style={[styles.metricValue, props.emphasized && styles.emphasizedText]}>{formatAmount(props.amount)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f4f6f3' },
  content: { padding: 20, paddingTop: 56, paddingBottom: 36 },
  eyebrow: { color: '#58776a', fontSize: 11, fontWeight: '700', letterSpacing: 1.2 },
  title: { marginTop: 7, color: '#17231f', fontSize: 30, fontWeight: '800' },
  subtitle: { marginTop: 7, marginBottom: 15, color: '#66736e', fontSize: 14, lineHeight: 20 },
  rangeCard: { padding: 16, backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#e2e9e4' },
  dateField: { marginTop: 5 },
  label: { marginBottom: 7, color: '#344740', fontSize: 13, fontWeight: '700' },
  dateButton: { minHeight: 48, backgroundColor: '#fff', borderWidth: 1, borderColor: '#d8e1db', borderRadius: 12, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dateButtonText: { color: '#17231f', fontSize: 15, writingDirection: 'ltr' },
  calendarIcon: { color: '#1d6b58', fontSize: 20, fontWeight: '700' },
  button: { marginTop: 14, backgroundColor: '#1d6b58', padding: 13, borderRadius: 12, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  sectionTitle: { marginTop: 22, marginBottom: 9, color: '#17231f', fontSize: 17, fontWeight: '800' },
  reportCard: { padding: 16, backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#e2e9e4' },
  metricLabel: { color: '#52635b', fontSize: 13, fontWeight: '600' },
  amount: { marginTop: 8, color: '#1d6b58', fontSize: 22, fontWeight: '800' },
  count: { marginTop: 5, color: '#718078', fontSize: 12 },
  metric: { paddingVertical: 13, paddingHorizontal: 15, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#edf0ee', flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  emphasizedMetric: { backgroundColor: '#e4f1eb' },
  metricValue: { color: '#17231f', fontSize: 14, fontWeight: '700' },
  emphasizedText: { color: '#1d6b58', fontWeight: '800' },
  note: { marginTop: 14, color: '#66736e', fontSize: 12, lineHeight: 18 },
});
