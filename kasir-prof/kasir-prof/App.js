import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  FlatList,
  Modal,
  TextInput,
  SafeAreaView,
  StatusBar,
  Alert,
  Platform,
  ScrollView,
} from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

// --- Kunci Penyimpanan ---
const PRODUCTS_KEY = '@products_v3'; // Versi baru untuk struktur data dengan harga awal
const TRANSACTIONS_KEY = '@transactions_v3';

// --- Fungsi Bantuan ---
const formatRupiah = (angka) => {
  if (angka === null || angka === undefined || isNaN(angka) || angka === '') return '0';
  return angka.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
};

const cleanNumber = (text) => {
    return text.replace(/[^0-9]/g, '');
}

// --- Komponen Layar ---

// 1. Layar Kasir (Point of Sale)
function CashierScreen() {
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [total, setTotal] = useState(0);
  const [isPaymentModalVisible, setPaymentModalVisible] = useState(false);
  const [customerPayment, setCustomerPayment] = useState('');
  const [change, setChange] = useState(0);
  const isFocused = useIsFocused();

  const loadProducts = useCallback(async () => {
    try {
      const jsonValue = await AsyncStorage.getItem(PRODUCTS_KEY);
      const savedProducts = jsonValue != null ? JSON.parse(jsonValue) : [];
      setProducts(savedProducts.sort((a, b) => a.name.localeCompare(b.name)));
    } catch (e) {
      console.log("Error loading products from storage: ", e);
      Alert.alert("Gagal", "Tidak dapat memuat data produk.");
    }
  }, []);

  useEffect(() => {
    if (isFocused) {
      loadProducts();
    }
  }, [isFocused, loadProducts]);

  useEffect(() => {
    const newTotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
    setTotal(newTotal);
  }, [cart]);

  // Hitung kembalian saat uang konsumen berubah
  useEffect(() => {
    const paymentAmount = parseFloat(customerPayment);
    if (!isNaN(paymentAmount) && paymentAmount >= total) {
        setChange(paymentAmount - total);
    } else {
        setChange(0);
    }
  }, [customerPayment, total]);

  const addToCart = (product) => {
    const cartItem = cart.find(item => item.id === product.id);
    const currentQuantityInCart = cartItem ? cartItem.quantity : 0;
    if (product.stock <= currentQuantityInCart) {
      Alert.alert("Stok Habis", `Stok untuk ${product.name} tidak mencukupi.`);
      return;
    }
    setCart((prevCart) => {
      const existingItem = prevCart.find((item) => item.id === product.id);
      if (existingItem) {
        return prevCart.map((item) =>
          item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prevCart, { ...product, quantity: 1 }];
    });
  };
  
  const removeFromCart = (product) => {
     setCart((prevCart) => {
      const existingItem = prevCart.find((item) => item.id === product.id);
      if (existingItem && existingItem.quantity > 1) {
        return prevCart.map((item) =>
          item.id === product.id ? { ...item, quantity: item.quantity - 1 } : item
        );
      }
      return prevCart.filter(item => item.id !== product.id);
    });
  };

  const handleOpenPaymentModal = () => {
    if (cart.length === 0) {
        Alert.alert("Keranjang Kosong", "Tambahkan produk terlebih dahulu.");
        return;
    }
    setPaymentModalVisible(true);
  }

  const finalizeTransaction = async () => {
    const paymentAmount = parseFloat(customerPayment);
    if (isNaN(paymentAmount) || paymentAmount < total) {
        Alert.alert("Pembayaran Kurang", "Uang yang dibayarkan konsumen tidak mencukupi.");
        return;
    }

    try {
      const productsJson = await AsyncStorage.getItem(PRODUCTS_KEY);
      let currentProducts = productsJson ? JSON.parse(productsJson) : [];

      let stockSufficient = true;
      const updatedProducts = currentProducts.map(p => {
        const cartItem = cart.find(item => item.id === p.id);
        if (cartItem) {
          if (p.stock < cartItem.quantity) {
            stockSufficient = false;
            Alert.alert("Stok Berubah", `Stok ${p.name} tidak cukup.`);
          }
          return { ...p, stock: p.stock - cartItem.quantity };
        }
        return p;
      });

      if (!stockSufficient) return;

      await AsyncStorage.setItem(PRODUCTS_KEY, JSON.stringify(updatedProducts));

      const newTransaction = {
        id: Date.now(),
        total: total,
        items: cart,
        date: new Date().toISOString(),
      };
      const existingTransactionsJson = await AsyncStorage.getItem(TRANSACTIONS_KEY);
      const existingTransactions = existingTransactionsJson ? JSON.parse(existingTransactionsJson) : [];
      await AsyncStorage.setItem(TRANSACTIONS_KEY, JSON.stringify([...existingTransactions, newTransaction]));
      
      Alert.alert("Transaksi Sukses", `Kembalian: Rp ${formatRupiah(change)}`);
      
      // Reset state
      setCart([]);
      setCustomerPayment('');
      setChange(0);
      setPaymentModalVisible(false);
      loadProducts();

    } catch (e) {
      console.log("Error completing transaction: ", e);
      Alert.alert("Gagal", "Terjadi kesalahan saat menyimpan transaksi.");
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.mainContent}>
        <View style={styles.productListContainer}>
          <Text style={styles.sectionTitle}>Pilih Produk</Text>
          <FlatList
            data={products}
            keyExtractor={(item) => item.id.toString()}
            numColumns={3}
            renderItem={({ item }) => (
              <TouchableOpacity style={[styles.productCard, item.stock === 0 && styles.disabledCard]} onPress={() => addToCart(item)} disabled={item.stock === 0}>
                <Text style={styles.productName}>{item.name}</Text>
                <Text style={styles.productPrice}>Rp {formatRupiah(item.price)}</Text>
                <Text style={item.stock > 10 ? styles.stockInfo : styles.stockWarning}>Stok: {item.stock}</Text>
              </TouchableOpacity>
            )}
            ListEmptyComponent={<Text style={styles.emptyText}>Belum ada produk.</Text>}
          />
        </View>

        <View style={styles.cartContainer}>
          <Text style={styles.sectionTitle}>Keranjang</Text>
          <FlatList
            data={cart}
            keyExtractor={(item) => item.id.toString()}
            renderItem={({ item }) => (
              <View style={styles.cartItem}>
                <View style={{flex: 1}}>
                    <Text style={styles.cartItemName}>{item.name}</Text>
                    <Text style={styles.cartItemPrice}>Rp {formatRupiah(item.price)}</Text>
                </View>
                <View style={styles.quantityControl}>
                    <TouchableOpacity onPress={() => removeFromCart(item)} style={styles.quantityButton}><Text style={styles.quantityButtonText}>-</Text></TouchableOpacity>
                    <Text style={styles.cartItemQuantity}>{item.quantity}</Text>
                    <TouchableOpacity onPress={() => addToCart(item)} style={styles.quantityButton}><Text style={styles.quantityButtonText}>+</Text></TouchableOpacity>
                </View>
              </View>
            )}
            ListEmptyComponent={<Text style={styles.emptyText}>Keranjang kosong</Text>}
          />
          <View style={styles.totalContainer}>
            <Text style={styles.totalText}>Total:</Text>
            <Text style={styles.totalAmount}>Rp {formatRupiah(total)}</Text>
          </View>
          <TouchableOpacity style={styles.payButton} onPress={handleOpenPaymentModal}>
            <Text style={styles.payButtonText}>SELESAIKAN TRANSAKSI</Text>
          </TouchableOpacity>
        </View>
      </View>
      
      {/* Modal Pembayaran */}
      <Modal animationType="fade" transparent={true} visible={isPaymentModalVisible} onRequestClose={() => setPaymentModalVisible(false)}>
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Pembayaran</Text>
            <View style={styles.paymentInfo}>
                <Text style={styles.paymentLabel}>Total Belanja</Text>
                <Text style={styles.paymentValue}>Rp {formatRupiah(total)}</Text>
            </View>
            <TextInput 
                style={styles.input} 
                placeholder="Uang Konsumen" 
                keyboardType="numeric" 
                value={formatRupiah(customerPayment)} 
                onChangeText={(text) => setCustomerPayment(cleanNumber(text))}
            />
            <View style={styles.paymentInfo}>
                <Text style={styles.paymentLabel}>Kembalian</Text>
                <Text style={[styles.paymentValue, {color: '#27ae60'}]}>Rp {formatRupiah(change)}</Text>
            </View>
            <View style={styles.modalButtonContainer}>
              <TouchableOpacity style={[styles.modalButton, styles.cancelButton]} onPress={() => setPaymentModalVisible(false)}>
                <Text style={styles.modalButtonText}>Batal</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, styles.saveButton]} onPress={finalizeTransaction}>
                <Text style={styles.modalButtonText}>Konfirmasi</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// 2. Layar Manajemen Produk
function ProductsScreen() {
  const [products, setProducts] = useState([]);
  const [isModalVisible, setModalVisible] = useState(false);
  const [productName, setProductName] = useState('');
  const [productCostPrice, setProductCostPrice] = useState('');
  const [productPrice, setProductPrice] = useState('');
  const [productStock, setProductStock] = useState('');
  const isFocused = useIsFocused();

  const loadProducts = useCallback(async () => {
    try {
      const jsonValue = await AsyncStorage.getItem(PRODUCTS_KEY);
      setProducts(jsonValue != null ? JSON.parse(jsonValue) : []);
    } catch (e) { console.log("Error loading products: ", e); }
  }, []);

  useEffect(() => {
    if (isFocused) { loadProducts(); }
  }, [isFocused, loadProducts]);

  const addProduct = async () => {
    if (!productName || !productPrice || !productStock || !productCostPrice) {
      Alert.alert("Input Tidak Lengkap", "Semua kolom harus diisi.");
      return;
    }
    const costPrice = parseFloat(productCostPrice);
    const price = parseFloat(productPrice);
    const stock = parseInt(productStock, 10);
    if (isNaN(price) || price <= 0 || isNaN(stock) || stock < 0 || isNaN(costPrice) || costPrice < 0) {
      Alert.alert("Input Tidak Valid", "Masukkan angka yang valid untuk harga dan stok.");
      return;
    }
    if (costPrice > price) {
        Alert.alert("Tidak Valid", "Harga jual harus lebih tinggi dari harga awal.");
        return;
    }

    const newProduct = { id: Date.now(), name: productName, costPrice: costPrice, price: price, stock: stock };

    try {
      const updatedProducts = [...products, newProduct];
      await AsyncStorage.setItem(PRODUCTS_KEY, JSON.stringify(updatedProducts));
      loadProducts();
      setModalVisible(false);
      setProductName(''); setProductCostPrice(''); setProductPrice(''); setProductStock('');
    } catch (e) {
      console.log("Error adding product: ", e);
    }
  };
  
  const deleteProduct = (id) => {
      Alert.alert("Hapus Produk", "Apakah Anda yakin?",
        [
            { text: "Batal", style: "cancel" },
            { text: "Hapus", style: "destructive", onPress: async () => {
                try {
                    const updatedProducts = products.filter(p => p.id !== id);
                    await AsyncStorage.setItem(PRODUCTS_KEY, JSON.stringify(updatedProducts));
                    loadProducts();
                } catch (e) { console.log("Error deleting product: ", e); }
            }}
        ]
      );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.headerTitle}>Manajemen Produk</Text>
      <FlatList
        data={products}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => (
          <View style={styles.productListItem}>
            <View>
                <Text style={styles.productListItemName}>{item.name} (Stok: {item.stock})</Text>
                <Text style={styles.productListItemPrice}>Jual: Rp {formatRupiah(item.price)}</Text>
                 <Text style={styles.productListItemCost}>Awal: Rp {formatRupiah(item.costPrice)}</Text>
            </View>
            <TouchableOpacity onPress={() => deleteProduct(item.id)}><Ionicons name="trash-bin-outline" size={24} color="#e74c3c" /></TouchableOpacity>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.emptyText}>Belum ada produk.</Text>}
      />
      <TouchableOpacity style={styles.addButton} onPress={() => setModalVisible(true)}><Text style={styles.addButtonText}>+ Tambah Produk</Text></TouchableOpacity>

      <Modal animationType="slide" transparent={true} visible={isModalVisible} onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Produk Baru</Text>
            <TextInput style={styles.input} placeholder="Nama Produk" value={productName} onChangeText={setProductName}/>
            <TextInput style={styles.input} placeholder="Harga Awal / Modal" keyboardType="numeric" value={formatRupiah(productCostPrice)} onChangeText={(text) => setProductCostPrice(cleanNumber(text))}/>
            <TextInput style={styles.input} placeholder="Harga Jual" keyboardType="numeric" value={formatRupiah(productPrice)} onChangeText={(text) => setProductPrice(cleanNumber(text))}/>
            <TextInput style={styles.input} placeholder="Stok Awal" keyboardType="numeric" value={productStock} onChangeText={setProductStock}/>
            <View style={styles.modalButtonContainer}>
              <TouchableOpacity style={[styles.modalButton, styles.cancelButton]} onPress={() => setModalVisible(false)}><Text style={styles.modalButtonText}>Batal</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, styles.saveButton]} onPress={addProduct}><Text style={styles.modalButtonText}>Simpan</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// 3. Layar Riwayat Transaksi
function HistoryScreen() {
  const [transactions, setTransactions] = useState([]);
  const isFocused = useIsFocused();

  const loadTransactions = useCallback(async () => {
    try {
      const jsonValue = await AsyncStorage.getItem(TRANSACTIONS_KEY);
      const savedTransactions = jsonValue != null ? JSON.parse(jsonValue) : [];
      setTransactions(savedTransactions.sort((a, b) => b.date.localeCompare(a.date)));
    } catch (e) { console.log("Error loading transactions: ", e); }
  }, []);

  useEffect(() => {
    if (isFocused) { loadTransactions(); }
  }, [isFocused, loadTransactions]);

  const createReceiptHtml = (transaction) => {
    const logoUrl = 'https://placehold.co/200x100/e0e0e0/000000?text=Logo+Toko';
    const itemsHtml = transaction.items.map(item => `<div class="item"><span>${item.name} (x${item.quantity})</span><span>${formatRupiah(item.price * item.quantity)}</span></div>`).join('');
    
    return `
    <html>
      <head>
        <style>
          body { font-family: 'Courier New', Courier, monospace; color: #000; position: relative; }
          .container { width: 58mm; margin: 0; padding: 5px; }
          .header { text-align: center; margin-bottom: 10px; }
          .header h1 { margin: 0; font-size: 16px; font-weight: bold; }
          .header p { margin: 2px 0; font-size: 12px; }
          .details, .items-table { margin-bottom: 10px; font-size: 12px; }
          .details p, .total p { margin: 2px 0; }
          .item { display: flex; justify-content: space-between; padding: 3px 0; border-bottom: 1px dashed #999; font-size: 12px; }
          .total { text-align: right; margin-top: 10px; font-size: 14px; font-weight: bold; }
          .footer { text-align: center; margin-top: 20px; font-size: 10px; color: #555; }
          .watermark { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-45deg); opacity: 0.08; z-index: -1; width: 100%; }
        </style>
      </head>
      <body>
        <img src="${logoUrl}" class="watermark" />
        <div class="container">
          <div class="header">
            <h1>Nama Toko Anda</h1>
            <p>Jalan Alamat Toko No. 123</p>
            <p>Telp: 081234567890</p>
          </div>
          <div class="details">
            <p><strong>ID:</strong> ${transaction.id}</p>
            <p><strong>Tanggal:</strong> ${new Date(transaction.date).toLocaleString('id-ID')}</p>
          </div>
          <div class="items-table">${itemsHtml}</div>
          <div class="total"><p>Total: Rp ${formatRupiah(transaction.total)}</p></div>
          <div class="footer"><p>-- Terima Kasih --</p></div>
        </div>
      </body>
    </html>`;
  };

  const printReceipt = async (transaction) => {
    const html = createReceiptHtml(transaction);
    try {
      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Bagikan Struk' });
    } catch (error) {
      Alert.alert("Gagal", "Tidak dapat membuat struk PDF.");
      console.error(error);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.headerTitle}>Riwayat Transaksi</Text>
      <FlatList
        data={transactions}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => (
          <View style={styles.transactionCard}>
            <View style={styles.transactionHeader}>
                <Text style={styles.transactionId}>ID: {item.id}</Text>
                <Text style={styles.transactionDate}>{new Date(item.date).toLocaleString('id-ID')}</Text>
            </View>
            <View style={styles.transactionDetails}>
                <Text style={styles.transactionTotalLabel}>Total Belanja:</Text>
                <Text style={styles.transactionTotal}>Rp {formatRupiah(item.total)}</Text>
            </View>
            <View style={styles.transactionItems}>
                {item.items.map(prod => (<Text key={prod.id} style={styles.transactionItemText}>- {prod.name} (x{prod.quantity})</Text>))}
            </View>
            <TouchableOpacity style={styles.printButton} onPress={() => printReceipt(item)}>
                <Ionicons name="print-outline" size={20} color="#fff" />
                <Text style={styles.printButtonText}>Cetak Struk</Text>
            </TouchableOpacity>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.emptyText}>Belum ada riwayat transaksi.</Text>}
      />
    </SafeAreaView>
  );
}

// 4. Layar Laporan
function ReportsScreen() {
    const [totalSales, setTotalSales] = useState(0);
    const [totalProfit, setTotalProfit] = useState(0);
    const [products, setProducts] = useState([]);
    const isFocused = useIsFocused();

    const loadReportsData = useCallback(async () => {
        try {
            const transactionsJson = await AsyncStorage.getItem(TRANSACTIONS_KEY);
            const transactions = transactionsJson ? JSON.parse(transactionsJson) : [];
            const total = transactions.reduce((sum, tr) => sum + tr.total, 0);
            setTotalSales(total);
            const profit = transactions.reduce((laba, tr) => {
                const transactionProfit = tr.items.reduce((labaItem, item) => {
                    const itemProfit = (item.price - (item.costPrice || 0)) * item.quantity;
                    return labaItem + itemProfit;
                }, 0);
                return laba + transactionProfit;
            }, 0);
            setTotalProfit(profit);
            const productsJson = await AsyncStorage.getItem(PRODUCTS_KEY);
            const savedProducts = productsJson ? JSON.parse(productsJson) : [];
            setProducts(savedProducts.sort((a, b) => a.name.localeCompare(b.name)));
        } catch (e) {
            console.log("Error loading reports data: ", e);
        }
    }, []);

    useEffect(() => {
        if (isFocused) {
            loadReportsData();
        }
    }, [isFocused, loadReportsData]);

    return (
        <SafeAreaView style={styles.container}>
            <Text style={styles.headerTitle}>Laporan</Text>
            <ScrollView style={{paddingHorizontal: 16}}>
                <View style={styles.reportCard}>
                    <Text style={styles.reportTitle}>Total Penjualan</Text>
                    <Text style={styles.reportValue}>Rp {formatRupiah(totalSales)}</Text>
                </View>
                <View style={styles.reportCard}>
                    <Text style={styles.reportTitle}>Total Laba</Text>
                    <Text style={[styles.reportValue, {color: '#27ae60'}]}>Rp {formatRupiah(totalProfit)}</Text>
                </View>
                <View style={styles.reportCard}>
                    <Text style={styles.reportTitle}>Laporan Stok Barang</Text>
                    {products.length > 0 ? products.map(item => (
                        <View key={item.id} style={styles.stockItem}>
                            <Text style={styles.stockItemName}>{item.name}</Text>
                            <Text style={item.stock > 10 ? styles.stockInfo : styles.stockWarning}>{item.stock} Pcs</Text>
                        </View>
                    )) : <Text style={styles.emptyText}>Tidak ada produk.</Text>}
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

// --- Navigasi Utama ---
const Tab = createBottomTabNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <StatusBar barStyle="dark-content" />
      <Tab.Navigator
        screenOptions={({ route }) => ({
          tabBarIcon: ({ focused, color, size }) => {
            let iconName;
            if (route.name === 'Kasir') iconName = focused ? 'calculator' : 'calculator-outline';
            else if (route.name === 'Produk') iconName = focused ? 'cube' : 'cube-outline';
            else if (route.name === 'Riwayat') iconName = focused ? 'receipt' : 'receipt-outline';
            else if (route.name === 'Laporan') iconName = focused ? 'analytics' : 'analytics-outline';
            return <Ionicons name={iconName} size={size} color={color} />;
          },
          tabBarActiveTintColor: '#3498db',
          tabBarInactiveTintColor: 'gray',
          headerShown: false,
        })}
      >
        <Tab.Screen name="Kasir" component={CashierScreen} />
        <Tab.Screen name="Produk" component={ProductsScreen} />
        <Tab.Screen name="Riwayat" component={HistoryScreen} />
        <Tab.Screen name="Laporan" component={ReportsScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

// --- Stylesheet ---
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f6f8', paddingTop: 10, },
  mainContent: { flex: 1, flexDirection: 'row', },
  productListContainer: { flex: 0.6, padding: 10, },
  cartContainer: { flex: 0.4, padding: 10, backgroundColor: '#ffffff', borderLeftWidth: 1, borderLeftColor: '#e0e0e0', },
  sectionTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 10, color: '#2c3e50', },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#2c3e50', paddingHorizontal: 20, paddingVertical: 10, },
  productCard: { backgroundColor: '#ffffff', borderRadius: 8, padding: 15, margin: 5, alignItems: 'center', justifyContent: 'center', flex: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 3, elevation: 2, minHeight: 120, },
  disabledCard: { backgroundColor: '#f0f0f0', opacity: 0.6 },
  productName: { fontSize: 14, fontWeight: '600', textAlign: 'center', },
  productPrice: { fontSize: 12, color: '#27ae60', marginTop: 5, },
  stockInfo: { fontSize: 12, color: '#7f8c8d', marginTop: 5, },
  stockWarning: { fontSize: 12, color: '#e67e22', fontWeight: 'bold', marginTop: 5, },
  cartItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#eee', },
  cartItemName: { fontSize: 16, },
  cartItemPrice: { fontSize: 12, color: '#555' },
  cartItemQuantity: { fontSize: 16, fontWeight: 'bold', marginHorizontal: 10, },
  quantityControl: { flexDirection: 'row', alignItems: 'center', },
  quantityButton: { backgroundColor: '#ecf0f1', width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', },
  quantityButtonText: { fontSize: 18, fontWeight: 'bold', color: '#2c3e50' },
  totalContainer: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 'auto', paddingTop: 15, borderTopWidth: 1, borderTopColor: '#e0e0e0', },
  totalText: { fontSize: 18, fontWeight: 'bold', },
  totalAmount: { fontSize: 18, fontWeight: 'bold', color: '#2980b9', },
  payButton: { backgroundColor: '#27ae60', padding: 15, borderRadius: 8, alignItems: 'center', marginTop: 10, },
  payButtonText: { color: '#ffffff', fontSize: 16, fontWeight: 'bold', },
  productListItem: { backgroundColor: '#fff', padding: 20, marginVertical: 8, marginHorizontal: 16, borderRadius: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', elevation: 1, },
  productListItemName: { fontSize: 16, fontWeight: '500', marginBottom: 4 },
  productListItemPrice: { fontSize: 14, color: '#34495e', },
  productListItemCost: { fontSize: 12, color: '#7f8c8d' },
  addButton: { backgroundColor: '#3498db', padding: 15, margin: 16, borderRadius: 8, alignItems: 'center', },
  addButtonText: { color: '#ffffff', fontSize: 16, fontWeight: 'bold', },
  modalContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)', },
  modalContent: { width: '80%', backgroundColor: 'white', borderRadius: 10, padding: 20, alignItems: 'center', },
  modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 20, },
  input: { width: '100%', borderWidth: 1, borderColor: '#ddd', padding: 10, borderRadius: 5, marginBottom: 15, fontSize: 16, textAlign: 'right' },
  modalButtonContainer: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', },
  modalButton: { flex: 1, padding: 10, borderRadius: 5, alignItems: 'center', marginHorizontal: 5, },
  cancelButton: { backgroundColor: '#e74c3c', },
  saveButton: { backgroundColor: '#2ecc71', },
  modalButtonText: { color: 'white', fontWeight: 'bold', },
  transactionCard: { backgroundColor: '#fff', borderRadius: 8, padding: 15, marginVertical: 8, marginHorizontal: 16, elevation: 2, },
  transactionHeader: { flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#eee', paddingBottom: 10, marginBottom: 10, },
  transactionId: { fontSize: 14, fontWeight: 'bold', },
  transactionDate: { fontSize: 12, color: '#7f8c8d', },
  transactionDetails: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', },
  transactionTotalLabel: { fontSize: 16, color: '#34495e' },
  transactionTotal: { fontSize: 18, fontWeight: 'bold', color: '#2980b9', },
  transactionItems: { marginTop: 10, paddingTop: 10, },
  transactionItemText: { fontSize: 14, color: '#34495e', },
  emptyText: { textAlign: 'center', marginTop: 20, color: '#7f8c8d', },
  printButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#3498db', paddingVertical: 10, borderRadius: 5, marginTop: 15, },
  printButtonText: { color: '#fff', fontWeight: 'bold', marginLeft: 8, },
  reportCard: { backgroundColor: '#fff', padding: 20, borderRadius: 8, marginBottom: 16, elevation: 2, },
  reportTitle: { fontSize: 18, fontWeight: 'bold', color: '#2c3e50', borderBottomWidth: 1, borderBottomColor: '#eee', paddingBottom: 10, marginBottom: 10, },
  reportValue: { fontSize: 28, fontWeight: 'bold', color: '#2980b9', textAlign: 'center', },
  stockItem: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f0f0f0', },
  stockItemName: { fontSize: 16, color: '#34495e' },
  paymentInfo: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginBottom: 15, },
  paymentLabel: { fontSize: 16, color: '#34495e' },
  paymentValue: { fontSize: 18, fontWeight: 'bold', color: '#2980b9' },
});
