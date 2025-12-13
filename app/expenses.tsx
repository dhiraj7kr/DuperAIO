import { FontAwesome5, Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import React, { useEffect, useRef, useState } from 'react';
import {
    Alert,
    Animated,
    FlatList,
    KeyboardAvoidingView,
    Modal,
    PanResponder,
    Platform,
    // SafeAreaView, // REMOVED from here
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';

// ADDED THIS IMPORT
import { SafeAreaView } from 'react-native-safe-area-context';

import { theme } from '../src/theme/theme';

// ==========================================
// 1. TYPES & DATA
// ==========================================

type TransactionType = 'credit' | 'debit';
type PaymentMethod = 'Online' | 'Cash' | 'Card' | 'Bank';

type Transaction = {
  id: string;
  title: string;
  amount: number;
  type: TransactionType;
  category: string;
  paymentMethod: PaymentMethod;
  date: string; // ISO String
  note?: string;
  isArchived?: boolean; // New Field
};

type ExpenseDataStore = {
  transactions: Transaction[];
  currencySymbol: string;
  monthlyBudget: number;
};

// FIX: Ignore TS check for documentDirectory
// @ts-ignore
const docDir = FileSystem.documentDirectory || '';
const DATA_FILE = docDir + 'app_data_expenses_v5.json';

const INCOME_CATEGORIES = ['Salary', 'Freelance', 'Business', 'Investment', 'Gift', 'General'];
const EXPENSE_CATEGORIES = ['Food', 'Transport', 'Rent', 'Shopping', 'Health', 'Bills', 'Entertainment', 'General'];

const CATEGORY_COLORS: Record<string, string> = {
  // Expenses
  'Food': '#F87171', 'Transport': '#60A5FA', 'Rent': '#818CF8', 
  'Shopping': '#F472B6', 'Health': '#34D399', 'Bills': '#FBBF24', 
  'Entertainment': '#A78BFA', 'General': '#9CA3AF',
  // Income
  'Salary': '#34D399', 'Freelance': '#60A5FA', 'Business': '#FBBF24',
  'Investment': '#818CF8', 'Gift': '#F472B6'
};

// ==========================================
// 2. HELPER FUNCTIONS
// ==========================================

const formatCurrency = (amount: number) => {
  return '₹' + amount.toFixed(2).replace(/\d(?=(\d{3})+\.)/g, '$&,');
};

const formatDate = (isoString: string) => {
  const date = new Date(isoString);
  return date.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
};

const saveToJSON = async (data: ExpenseDataStore) => {
  if (!docDir) return;
  try {
    await FileSystem.writeAsStringAsync(DATA_FILE, JSON.stringify(data));
  } catch (error) {
    console.error('Error saving expenses:', error);
  }
};

const loadFromJSON = async (): Promise<ExpenseDataStore> => {
  if (!docDir) return { transactions: [], currencySymbol: '₹', monthlyBudget: 10000 };
  try {
    const info = await FileSystem.getInfoAsync(DATA_FILE);
    if (!info.exists) return { transactions: [], currencySymbol: '₹', monthlyBudget: 10000 };
    const content = await FileSystem.readAsStringAsync(DATA_FILE);
    return JSON.parse(content);
  } catch (error) {
    return { transactions: [], currencySymbol: '₹', monthlyBudget: 10000 };
  }
};

// ==========================================
// 3. MAIN SCREEN
// ==========================================

export default function ExpensesScreen() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'history' | 'insights'>('dashboard');
  const [data, setData] = useState<ExpenseDataStore>({ transactions: [], currencySymbol: '₹', monthlyBudget: 10000 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadFromJSON().then((d) => {
      setData(d);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!loading) saveToJSON(data);
  }, [data, loading]);

  const addTransaction = (t: Transaction) => {
    setData(prev => ({ ...prev, transactions: [t, ...prev.transactions] }));
  };

  const deleteTransaction = (id: string) => {
    // Hard delete
    setData(prev => ({ ...prev, transactions: prev.transactions.filter(t => t.id !== id) }));
  };

  const archiveTransaction = (id: string) => {
    // Soft delete (Hide from main view)
    setData(prev => ({
      ...prev,
      transactions: prev.transactions.map(t => t.id === id ? { ...t, isArchived: true } : t)
    }));
  };

  const importData = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'application/json' });
      if (result.canceled) return;

      const fileUri = result.assets[0].uri;
      const fileContent = await FileSystem.readAsStringAsync(fileUri);
      const parsedData = JSON.parse(fileContent);

      if (parsedData.transactions && Array.isArray(parsedData.transactions)) {
        Alert.alert('Import', 'Merge or Replace?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Merge', onPress: () => setData(prev => ({ ...prev, transactions: [...parsedData.transactions, ...prev.transactions] })) },
            { text: 'Replace', style: 'destructive', onPress: () => setData(parsedData) }
        ]);
      } else {
        Alert.alert('Error', 'Invalid file format');
      }
    } catch (e) { Alert.alert('Error', 'Import failed'); }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Finance Manager</Text>
          <Text style={styles.headerSubtitle}>Track your wealth</Text>
        </View>
        <TouchableOpacity style={styles.headerIconBtn}>
          <Ionicons name="notifications-outline" size={24} color={theme.colors.text} />
        </TouchableOpacity>
      </View>

      {/* TABS */}
      <View style={styles.tabBar}>
        <TabButton title="Dashboard" icon="grid-outline" active={activeTab === 'dashboard'} onPress={() => setActiveTab('dashboard')} />
        <TabButton title="History" icon="list-outline" active={activeTab === 'history'} onPress={() => setActiveTab('history')} />
        <TabButton title="Insights" icon="pie-chart-outline" active={activeTab === 'insights'} onPress={() => setActiveTab('insights')} />
      </View>

      {/* CONTENT */}
      <View style={styles.content}>
        {activeTab === 'dashboard' && (
          <DashboardTab 
            data={data} 
            addTransaction={addTransaction} 
            onSeeAll={() => setActiveTab('history')} 
            onDelete={deleteTransaction}
            onArchive={archiveTransaction}
          />
        )}
        {activeTab === 'history' && (
          <HistoryTab 
            transactions={data.transactions} 
            onDelete={deleteTransaction} 
            onArchive={archiveTransaction}
            onImport={importData} 
          />
        )}
        {activeTab === 'insights' && (
          <InsightsTab transactions={data.transactions} />
        )}
      </View>
    </SafeAreaView>
  );
}

// ==========================================
// 4. TAB: DASHBOARD
// ==========================================

const DashboardTab = ({ data, addTransaction, onSeeAll, onDelete, onArchive }: any) => {
  const [modalVisible, setModalVisible] = useState(false);
  
  // Filter out archived for calculations
  const activeTransactions = data.transactions.filter((t: Transaction) => !t.isArchived);

  const totalIncome = activeTransactions.filter((t: Transaction) => t.type === 'credit').reduce((acc: number, curr: Transaction) => acc + curr.amount, 0);
  const totalExpense = activeTransactions.filter((t: Transaction) => t.type === 'debit').reduce((acc: number, curr: Transaction) => acc + curr.amount, 0);
  const balance = totalIncome - totalExpense;
  const recentTransactions = activeTransactions.slice(0, 5);

  return (
    <View style={styles.flex1}>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Total Balance</Text>
          <Text style={styles.balanceAmount}>{formatCurrency(balance)}</Text>
          <View style={styles.balanceRow}>
            <View style={styles.balanceItem}>
              <View style={[styles.arrowIcon, { backgroundColor: 'rgba(34, 197, 94, 0.2)' }]}>
                <Ionicons name="arrow-down" size={16} color={theme.colors.primary} />
              </View>
              <View>
                <Text style={styles.balanceSubLabel}>Income</Text>
                <Text style={styles.incomeText}>{formatCurrency(totalIncome)}</Text>
              </View>
            </View>
            <View style={styles.balanceItem}>
              <View style={[styles.arrowIcon, { backgroundColor: 'rgba(239, 68, 68, 0.2)' }]}>
                <Ionicons name="arrow-up" size={16} color={theme.colors.danger} />
              </View>
              <View>
                <Text style={styles.balanceSubLabel}>Expense</Text>
                <Text style={styles.expenseText}>{formatCurrency(totalExpense)}</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent Transactions</Text>
          <TouchableOpacity onPress={onSeeAll}>
            <Text style={styles.seeAllText}>See All</Text>
          </TouchableOpacity>
        </View>

        {recentTransactions.map((item: Transaction) => (
          <SwipeableTransaction 
            key={item.id} 
            item={item} 
            onDelete={() => onDelete(item.id)} 
            onArchive={() => onArchive(item.id)} 
          />
        ))}
        {recentTransactions.length === 0 && <Text style={styles.emptyText}>No recent transactions.</Text>}
        <View style={{height: 80}} />
      </ScrollView>

      <TouchableOpacity style={styles.fab} onPress={() => setModalVisible(true)}>
        <Ionicons name="add" size={32} color="#FFF" />
      </TouchableOpacity>

      <AddTransactionModal 
        visible={modalVisible} 
        onClose={() => setModalVisible(false)} 
        onSave={addTransaction} 
      />
    </View>
  );
};

// ==========================================
// 5. TAB: HISTORY
// ==========================================

const HistoryTab = ({ transactions, onDelete, onArchive, onImport }: any) => {
  const [filter, setFilter] = useState<'all' | 'credit' | 'debit' | 'archived'>('all');
  const [search, setSearch] = useState('');

  const filtered = transactions.filter((t: Transaction) => {
    if (filter === 'archived') {
      return t.isArchived === true;
    }
    if (t.isArchived) return false;

    const matchesFilter = filter === 'all' ? true : t.type === filter;
    const matchesSearch = t.title.toLowerCase().includes(search.toLowerCase()) || t.category.toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const handleExport = () => {
    Alert.alert('Export Data', 'Choose format:', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'CSV', onPress: () => exportFile('csv') },
      { text: 'JSON', onPress: () => exportFile('json') }
    ]);
  };

  const exportFile = async (format: 'csv' | 'json') => {
    try {
      if (!docDir) {
        Alert.alert('Error', 'Device storage is not accessible.');
        return;
      }

      let content = '';
      let fileName = `expenses_export.${format}`;

      if (format === 'json') {
        content = JSON.stringify({ transactions: filtered }, null, 2);
      } else {
        content = "Date,Title,Category,Type,Amount\n";
        filtered.forEach((t: Transaction) => {
          content += `${t.date.substring(0,10)},"${t.title}",${t.category},${t.type},${t.amount}\n`;
        });
      }

      const uri = docDir + fileName;
      // FIX: Use string literal 'utf8'
      await FileSystem.writeAsStringAsync(uri, content, {
        encoding: 'utf8' 
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri);
      } else {
        Alert.alert('Error', 'Sharing is not available on this device');
      }

    } catch (error: any) {
      console.error("Export Error:", error);
      Alert.alert('Export Failed', 'An error occurred.');
    }
  };

  return (
    <View style={styles.flex1}>
      <View style={styles.filterContainer}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color="#999" />
          <TextInput style={styles.searchInput} placeholder="Search..." value={search} onChangeText={setSearch} />
        </View>
        <TouchableOpacity style={styles.iconBtn} onPress={onImport}><Ionicons name="cloud-upload-outline" size={20} color="#333" /></TouchableOpacity>
        <TouchableOpacity style={styles.iconBtn} onPress={handleExport}><Ionicons name="download-outline" size={20} color="#333" /></TouchableOpacity>
      </View>

      <View style={styles.segmentRow}>
        {['all', 'credit', 'debit', 'archived'].map((f) => (
          <TouchableOpacity key={f} style={[styles.segmentBtn, filter === f && styles.segmentActive]} onPress={() => setFilter(f as any)}>
            <Text style={[styles.segmentText, filter === f && styles.segmentTextActive]}>
              {f === 'all' ? 'All' : f === 'credit' ? 'Income' : f === 'debit' ? 'Expense' : 'Archived'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16 }}
        renderItem={({ item }) => (
          <SwipeableTransaction 
            item={item} 
            onDelete={() => onDelete(item.id)} 
            onArchive={() => onArchive(item.id)} 
          />
        )}
        ListEmptyComponent={<Text style={styles.emptyText}>No records found.</Text>}
      />
    </View>
  );
};

// ==========================================
// 6. TAB: INSIGHTS
// ==========================================

const InsightsTab = ({ transactions }: { transactions: Transaction[] }) => {
  const [insightType, setInsightType] = useState<'debit' | 'credit'>('debit');

  const activeTransactions = transactions.filter(t => !t.isArchived && t.type === insightType);
  const totalAmount = activeTransactions.reduce((acc, c) => acc + c.amount, 0);

  const categoryMap: Record<string, number> = {};
  activeTransactions.forEach(t => {
    categoryMap[t.category] = (categoryMap[t.category] || 0) + t.amount;
  });

  const sortedCategories = Object.keys(categoryMap)
    .map(cat => ({ 
      name: cat, 
      amount: categoryMap[cat], 
      percentage: totalAmount ? (categoryMap[cat] / totalAmount) * 100 : 0,
      color: CATEGORY_COLORS[cat] || '#9CA3AF'
    }))
    .sort((a, b) => b.amount - a.amount);

  return (
    <ScrollView style={styles.flex1} contentContainerStyle={{ padding: 16 }}>
      
      <View style={styles.insightToggleContainer}>
         <TouchableOpacity 
           style={[styles.insightToggleBtn, insightType === 'debit' && styles.insightToggleActive]}
           onPress={() => setInsightType('debit')}
         >
            <Text style={[styles.insightToggleText, insightType === 'debit' && {color:'#fff'}]}>Expenses</Text>
         </TouchableOpacity>
         <TouchableOpacity 
           style={[styles.insightToggleBtn, insightType === 'credit' && styles.insightToggleActive]}
           onPress={() => setInsightType('credit')}
         >
            <Text style={[styles.insightToggleText, insightType === 'credit' && {color:'#fff'}]}>Income</Text>
         </TouchableOpacity>
      </View>

      <View style={styles.chartCard}>
        <Text style={styles.chartTitle}>{insightType === 'debit' ? 'Expense' : 'Income'} Breakdown</Text>
        {totalAmount > 0 ? (
          <View style={styles.pieContainer}>
             <SimplePieChart data={sortedCategories} />
             <View style={styles.pieCenterOverlay}>
               <Text style={styles.chartTotal}>{formatCurrency(totalAmount)}</Text>
               <Text style={styles.chartSub}>Total</Text>
             </View>
          </View>
        ) : (
          <Text style={{textAlign:'center', color:'#999', marginVertical:20}}>No data</Text>
        )}
      </View>

      <Text style={styles.sectionTitle}>Categories</Text>
      
      {sortedCategories.map((cat, index) => (
        <View key={index} style={styles.statRow}>
          <View style={styles.statInfo}>
             <View style={styles.row}>
                <View style={[styles.dot, { backgroundColor: cat.color }]} />
                <Text style={styles.statName}>{cat.name}</Text>
             </View>
             <Text style={styles.statAmount}>{formatCurrency(cat.amount)}</Text>
          </View>
          <View style={styles.progressBarBg}>
             <View style={[styles.progressBarFill, { width: `${cat.percentage}%`, backgroundColor: cat.color }]} />
          </View>
          <Text style={styles.statPercent}>{cat.percentage.toFixed(1)}%</Text>
        </View>
      ))}
    </ScrollView>
  );
};

const SimplePieChart = ({ data }: { data: any[] }) => {
  return (
    <View style={{ height: 200, width: 200, position: 'relative', alignItems: 'center', justifyContent: 'center' }}>
       {data.map((item, index) => (
          <View 
            key={index} 
            style={{
              position: 'absolute',
              width: 200 - (index * 25),
              height: 200 - (index * 25),
              borderRadius: 100,
              borderWidth: 10,
              borderColor: item.color,
              opacity: 1
            }} 
          />
       ))}
    </View>
  );
};

// ==========================================
// 7. SWIPEABLE CARD COMPONENT
// ==========================================

const SwipeableTransaction = ({ item, onDelete, onArchive }: { item: Transaction, onDelete: () => void, onArchive: () => void }) => {
  const pan = useRef(new Animated.ValueXY()).current;
  
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        return Math.abs(gestureState.dx) > 10;
      },
      onPanResponderMove: Animated.event([null, { dx: pan.x }], { useNativeDriver: false }),
      onPanResponderRelease: (evt, gestureState) => {
        if (gestureState.dx > 120) {
          // Swipe Right -> Delete
          Animated.timing(pan, { toValue: { x: 500, y: 0 }, duration: 200, useNativeDriver: false }).start(() => {
             onDelete();
          });
        } else if (gestureState.dx < -120) {
          // Swipe Left -> Archive
          Animated.timing(pan, { toValue: { x: -500, y: 0 }, duration: 200, useNativeDriver: false }).start(() => {
             onArchive();
          });
        } else {
          // Reset
          Animated.spring(pan, { toValue: { x: 0, y: 0 }, friction: 5, useNativeDriver: false }).start();
        }
      }
    })
  ).current;

  return (
    <View style={styles.swipeContainer}>
      <View style={styles.swipeBackLayer}>
         <View style={styles.swipeLeftAction}><Ionicons name="trash" size={24} color="#fff" /></View>
         <View style={styles.swipeRightAction}><Ionicons name="archive" size={24} color="#fff" /></View>
      </View>

      <Animated.View 
        style={[
          { transform: [{ translateX: pan.x }], backgroundColor: '#fff', borderRadius: 16 }, 
        ]} 
        {...panResponder.panHandlers}
      >
        <TransactionCard item={item} />
      </Animated.View>
    </View>
  );
};

const TransactionCard = ({ item }: { item: Transaction }) => {
  const isCredit = item.type === 'credit';
  return (
    <View style={styles.transCard}>
      <View style={[styles.iconBox, { backgroundColor: isCredit ? '#DCFCE7' : '#FEE2E2' }]}>
        <FontAwesome5 name={isCredit ? 'arrow-down' : 'shopping-bag'} size={18} color={isCredit ? '#16A34A' : '#EF4444'} />
      </View>
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={styles.transTitle}>{item.title}</Text>
        <Text style={styles.transSub}>{item.category} • {item.paymentMethod} • {formatDate(item.date)}</Text>
      </View>
      <Text style={[styles.transAmount, { color: isCredit ? '#16A34A' : '#1F2937' }]}>
        {isCredit ? '+' : '-'}{formatCurrency(item.amount)}
      </Text>
    </View>
  );
};

// ==========================================
// 8. ADD MODAL
// ==========================================

const AddTransactionModal = ({ visible, onClose, onSave }: any) => {
  const [type, setType] = useState<TransactionType>('debit');
  const [amount, setAmount] = useState('');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('General');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Online');
  const [date, setDate] = useState(new Date());
  
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [dateText, setDateText] = useState('');

  useEffect(() => {
    if (visible) {
      setAmount(''); setTitle(''); 
      setCategory('General'); 
      setPaymentMethod('Online'); 
      setDate(new Date());
      setDateText('');
      setShowDatePicker(false);
    }
  }, [visible]);

  const handleSave = () => {
    if (!amount || isNaN(Number(amount))) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }
    if (!title) {
      Alert.alert('Error', 'Please enter a description');
      return;
    }

    let finalDate = date;
    if (showDatePicker && dateText) {
       const parts = dateText.split('-');
       if(parts.length === 3) {
         finalDate = new Date(parseInt(parts[0]), parseInt(parts[1])-1, parseInt(parts[2]));
       }
    }

    const newTx: Transaction = {
      id: Date.now().toString(),
      title,
      amount: parseFloat(amount),
      type,
      category,
      paymentMethod,
      date: finalDate.toISOString(),
      isArchived: false,
    };

    onSave(newTx);
    onClose();
  };

  const categories = type === 'credit' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={styles.modalHeader}>
           <Text style={styles.modalTitle}>Add Transaction</Text>
           <TouchableOpacity onPress={onClose}><Ionicons name="close" size={24} color="#333" /></TouchableOpacity>
        </View>
        
        <ScrollView style={styles.modalContent}>
          <View style={styles.typeSegment}>
            <TouchableOpacity onPress={() => setType('debit')} style={[styles.typeBtn, type === 'debit' && styles.typeBtnActiveDebit]}>
               <Text style={[styles.typeText, type === 'debit' && { color: '#fff' }]}>Expense</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setType('credit')} style={[styles.typeBtn, type === 'credit' && styles.typeBtnActiveCredit]}>
               <Text style={[styles.typeText, type === 'credit' && { color: '#fff' }]}>Income</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Amount</Text>
            <TextInput style={styles.amountInput} placeholder="0.00" keyboardType="numeric" value={amount} onChangeText={setAmount} autoFocus />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Description</Text>
            <TextInput style={styles.textInput} placeholder="What is this for?" value={title} onChangeText={setTitle} />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexDirection: 'row', marginTop: 8 }}>
              {categories.map(cat => (
                <TouchableOpacity key={cat} onPress={() => setCategory(cat)} style={[styles.chip, category === cat && styles.chipActive]}>
                  <Text style={[styles.chipText, category === cat && { color: '#fff' }]}>{cat}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Payment Method</Text>
            <View style={styles.rowWrap}>
              {['Online', 'Cash', 'Card', 'Bank'].map((method) => (
                <TouchableOpacity key={method} onPress={() => setPaymentMethod(method as PaymentMethod)} style={[styles.methodCard, paymentMethod === method && styles.methodCardActive]}>
                  <Ionicons name={method === 'Cash' ? 'cash-outline' : method === 'Card' ? 'card-outline' : method === 'Online' ? 'wifi' : 'business-outline'} size={20} color={paymentMethod === method ? theme.colors.primary : '#666'} />
                  <Text style={[styles.methodText, paymentMethod === method && { color: theme.colors.primary, fontWeight:'bold' }]}>{method}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.inputGroup}>
             <View style={styles.rowBetween}>
               <Text style={styles.label}>Date</Text>
               <TouchableOpacity onPress={() => setShowDatePicker(!showDatePicker)}>
                  <Text style={{color: theme.colors.primary}}>{showDatePicker ? 'Use Today' : 'Change Date'}</Text>
               </TouchableOpacity>
             </View>
             {!showDatePicker ? <Text style={styles.dateDisplay}>{date.toDateString()}</Text> : <TextInput style={styles.textInput} placeholder="YYYY-MM-DD" value={dateText} onChangeText={setDateText} />}
          </View>

          <View style={{height: 40}} />
          <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
             <Text style={styles.saveButtonText}>Save Transaction</Text>
          </TouchableOpacity>
          <View style={{height: 60}} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
};

// ==========================================
// 9. STYLES
// ==========================================

const TabButton = ({ title, icon, active, onPress }: any) => (
  <TouchableOpacity onPress={onPress} style={[styles.tabBtn, active && styles.tabBtnActive]}>
    <Ionicons name={icon} size={20} color={active ? theme.colors.primary : '#888'} />
    <Text style={[styles.tabText, active && styles.tabTextActive]}>{title}</Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  flex1: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap' },

  header: { padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  headerTitle: { fontSize: 24, fontWeight: '800', color: '#111827' },
  headerSubtitle: { fontSize: 13, color: '#6B7280' },
  headerIconBtn: { padding: 8, backgroundColor: '#F3F4F6', borderRadius: 20 },

  tabBar: { flexDirection: 'row', padding: 6, marginHorizontal: 16, marginTop: 16, backgroundColor: '#E5E7EB', borderRadius: 12 },
  tabBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 10 },
  tabBtnActive: { backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },
  tabText: { marginLeft: 6, fontWeight: '600', color: '#6B7280', fontSize: 13 },
  tabTextActive: { color: theme.colors.primary, fontWeight: '700' },

  content: { flex: 1, marginTop: 10 },

  // Dashboard
  balanceCard: { backgroundColor: '#111827', borderRadius: 20, padding: 24, marginBottom: 20, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 10, elevation: 5 },
  balanceLabel: { color: '#9CA3AF', fontSize: 14, fontWeight: '500' },
  balanceAmount: { color: '#fff', fontSize: 32, fontWeight: '800', marginVertical: 8 },
  balanceRow: { flexDirection: 'row', marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)' },
  balanceItem: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  arrowIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  balanceSubLabel: { color: '#9CA3AF', fontSize: 12 },
  incomeText: { color: '#4ADE80', fontWeight: '700', fontSize: 16 },
  expenseText: { color: '#F87171', fontWeight: '700', fontSize: 16 },

  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#1F2937' },
  seeAllText: { color: theme.colors.primary, fontWeight: '600' },
  emptyText: { textAlign: 'center', color: '#999', marginTop: 20 },

  // Swipeable
  swipeContainer: { marginBottom: 10, position: 'relative' },
  swipeBackLayer: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, borderRadius: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20 },
  swipeLeftAction: { backgroundColor: '#EF4444', position: 'absolute', left: 0, top: 0, bottom: 0, width: '50%', borderTopLeftRadius: 16, borderBottomLeftRadius: 16, justifyContent: 'center', paddingLeft: 20 },
  swipeRightAction: { backgroundColor: '#3B82F6', position: 'absolute', right: 0, top: 0, bottom: 0, width: '50%', borderTopRightRadius: 16, borderBottomRightRadius: 16, justifyContent: 'center', alignItems: 'flex-end', paddingRight: 20 },

  transCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 14, borderRadius: 16, borderWidth: 1, borderColor: '#F3F4F6' },
  iconBox: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  transTitle: { fontSize: 16, fontWeight: '600', color: '#1F2937' },
  transSub: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  transAmount: { fontSize: 16, fontWeight: '700' },

  fab: { position: 'absolute', bottom: 24, right: 24, width: 60, height: 60, borderRadius: 30, backgroundColor: theme.colors.primary, justifyContent: 'center', alignItems: 'center', shadowColor: theme.colors.primary, shadowOpacity: 0.4, shadowOffset: {width:0, height:4}, shadowRadius: 8, elevation: 6 },

  // History Tab
  filterContainer: { flexDirection: 'row', padding: 16, paddingBottom: 0, gap: 10 },
  searchBox: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', paddingHorizontal: 12, height: 44, borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB' },
  searchInput: { flex: 1, marginLeft: 8, fontSize: 15 },
  iconBtn: { width: 44, height: 44, backgroundColor: '#E5E7EB', borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  segmentRow: { flexDirection: 'row', padding: 16 },
  segmentBtn: { paddingVertical: 6, paddingHorizontal: 16, borderRadius: 20, backgroundColor: '#F3F4F6', marginRight: 8 },
  segmentActive: { backgroundColor: '#1F2937' },
  segmentText: { color: '#6B7280', fontWeight: '600', fontSize: 13 },
  segmentTextActive: { color: '#fff' },

  // Insights
  insightToggleContainer: { flexDirection: 'row', backgroundColor: '#E5E7EB', padding: 4, borderRadius: 12, marginBottom: 20 },
  insightToggleBtn: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 8 },
  insightToggleActive: { backgroundColor: theme.colors.primary },
  insightToggleText: { fontWeight: '600', color: '#6B7280' },

  chartCard: { backgroundColor: '#fff', padding: 20, borderRadius: 20, alignItems: 'center', marginBottom: 20, borderWidth: 1, borderColor: '#E5E7EB' },
  chartTitle: { fontSize: 14, color: '#6B7280', fontWeight: '600', marginBottom: 20 },
  pieContainer: { alignItems: 'center', justifyContent: 'center' },
  pieCenterOverlay: { position: 'absolute', alignItems: 'center' },
  chartTotal: { fontSize: 24, fontWeight: '800', color: '#111' },
  chartSub: { fontSize: 12, color: '#9CA3AF' },
  
  statRow: { marginBottom: 16, backgroundColor: '#fff', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#F9FAFB' },
  statInfo: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  statName: { fontSize: 15, fontWeight: '600', color: '#333' },
  statAmount: { fontWeight: '700', color: '#1F2937' },
  progressBarBg: { height: 6, backgroundColor: '#F3F4F6', borderRadius: 3, marginBottom: 4 },
  progressBarFill: { height: '100%', borderRadius: 3 },
  statPercent: { fontSize: 11, color: '#999', textAlign: 'right' },

  // Modal
  modalHeader: { padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#eee' },
  modalTitle: { fontSize: 18, fontWeight: '700' },
  modalContent: { padding: 20 },
  typeSegment: { flexDirection: 'row', backgroundColor: '#F3F4F6', padding: 4, borderRadius: 12, marginBottom: 20 },
  typeBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10 },
  typeBtnActiveDebit: { backgroundColor: '#EF4444' },
  typeBtnActiveCredit: { backgroundColor: '#16A34A' },
  typeText: { fontWeight: '700', color: '#666' },
  inputGroup: { marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 8 },
  amountInput: { fontSize: 32, fontWeight: '700', color: '#111', borderBottomWidth: 1, borderBottomColor: '#E5E7EB', paddingVertical: 8 },
  textInput: { backgroundColor: '#F9FAFB', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', fontSize: 16 },
  chip: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, backgroundColor: '#F3F4F6', marginRight: 8, borderWidth: 1, borderColor: '#E5E7EB' },
  chipActive: { backgroundColor: '#1F2937', borderColor: '#1F2937' },
  chipText: { fontWeight: '600', color: '#4B5563' },
  methodCard: { flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', marginRight: 10, marginBottom: 10, backgroundColor: '#fff' },
  methodCardActive: { borderColor: theme.colors.primary, backgroundColor: '#EFF6FF' },
  methodText: { marginLeft: 6, color: '#666', fontWeight: '500' },
  dateDisplay: { fontSize: 16, fontWeight: '600', color: '#111', marginTop: 4 },
  saveButton: { backgroundColor: theme.colors.primary, paddingVertical: 16, borderRadius: 16, alignItems: 'center', shadowColor: theme.colors.primary, shadowOpacity: 0.3, shadowOffset: {width:0, height:4} },
  saveButtonText: { color: '#fff', fontWeight: '700', fontSize: 16 }
});