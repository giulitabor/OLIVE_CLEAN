import React, { useState, useRef, useEffect } from 'react';
import {
  StyleSheet,
  SafeAreaView,
  StatusBar,
  Platform,
  BackHandler,
  ActivityIndicator,
  View,
  Text,
  Alert,
  Modal,
  TouchableOpacity,
  Linking,
} from 'react-native';
import { WebView } from 'react-native-webview';
import * as WebBrowser from 'expo-web-browser';

// Polyfills
import 'react-native-get-random-values';
import { Buffer } from 'buffer';

global.Buffer = Buffer;

export default function App() {
  const webViewRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [walletConnected, setWalletConnected] = useState(false);

  // ============================================
  // 1. PUT THE DEEP LINK HANDLER HERE (inside useEffect)
  // ============================================
  useEffect(() => {
    // Handle deep link return from Phantom wallet
    const handleDeepLink = async (event: { url: string }) => {
      const url = event.url;
      console.log('[DEEP LINK] Received:', url);
      
      // Check if this is a return from Phantom
      if (url && url.startsWith('olivium://phantom')) {
        // Extract the wallet address from the return URL
        const match = url.match(/public_key=([^&]+)/);
        if (match && match[1]) {
          console.log('[DEEP LINK] Wallet address found:', match[1]);
          injectWalletConnection(match[1]);
          setWalletConnected(true);
          setShowWalletModal(false);
        }
      }
      
      // Also handle other wallet deep links
      if (url && url.includes('phantom')) {
        const match = url.match(/public_key=([^&]+)/);
        if (match && match[1]) {
          injectWalletConnection(match[1]);
          setWalletConnected(true);
          setShowWalletModal(false);
        }
      }
    };

    // Add event listener for deep links
    const subscription = Linking.addEventListener('url', handleDeepLink);
    
    // Check for initial URL (if app was opened from deep link)
    Linking.getInitialURL().then((url) => {
      if (url) handleDeepLink({ url });
    });

    // Android back button handler
    if (Platform.OS === 'android') {
      BackHandler.addEventListener('hardwareBackPress', handleBackPress);
    }

    // Cleanup
    return () => {
      subscription.remove();
      if (Platform.OS === 'android') {
        BackHandler.removeEventListener('hardwareBackPress', handleBackPress);
      }
    };
  }, []); // Empty dependency array means this runs once when component mounts

  const handleBackPress = () => {
    if (webViewRef.current) {
      webViewRef.current.goBack();
      return true;
    }
    return false;
  };

  // ============================================
  // 2. PUT THE openPhantomWallet FUNCTION HERE
  // ============================================
  const openPhantomWallet = async () => {
    try {
      // Generate a random request ID for this connection session
      const requestId = Date.now().toString();
      
      // Use phantom:// custom protocol (NOT https://)
      const phantomDeepLink = `phantom://connect?app=${encodeURIComponent('Olivium DAO')}&redirect_link=${encodeURIComponent('olivium://phantom')}&request_id=${requestId}`;
      
      console.log('[PHANTOM] Opening with custom protocol:', phantomDeepLink);
      
      // Check if Phantom can handle this custom protocol
      const canOpen = await Linking.canOpenURL('phantom://');
      
      if (canOpen) {
        // Open Phantom app directly
        await Linking.openURL(phantomDeepLink);
        
        // Show instruction alert
        Alert.alert(
          'Connect Wallet',
          'Open Phantom and approve the connection request, then return to this app',
          [{ text: 'OK' }]
        );
        
        // Set timeout to handle case where user doesn't return
        setTimeout(() => {
          if (!walletConnected) {
            Alert.alert(
              'Connection Pending',
              'Make sure to approve the connection in Phantom app',
              [
                { text: 'Try Again', onPress: () => openPhantomWallet() },
                { text: 'Cancel', style: 'cancel' }
              ]
            );
          }
        }, 30000);
      } else {
        // Phantom not installed - show install options
        Alert.alert(
          'Phantom Wallet Required',
          'Please install Phantom Wallet to continue',
          [
            { text: 'Cancel', style: 'cancel' },
            { 
              text: 'Install from Play Store', 
              onPress: () => Linking.openURL('https://play.google.com/store/apps/details?id=app.phantom') 
            },
            { 
              text: 'Install from Website', 
              onPress: () => Linking.openURL('https://phantom.app/download') 
            }
          ]
        );
      }
    } catch (err) {
      console.error('[PHANTOM] Error:', err);
      Alert.alert('Error', 'Could not open Phantom wallet');
    }
  };

  // Open Solflare Wallet
  const openSolflareWallet = async () => {
    try {
      const solflareDeepLink = `solflare://connect?app=${encodeURIComponent('Olivium DAO')}&redirect_link=${encodeURIComponent('olivium://solflare')}`;
      
      console.log('[SOLFLARE] Opening deep link:', solflareDeepLink);
      
      const canOpen = await Linking.canOpenURL('solflare://');
      
      if (canOpen) {
        await Linking.openURL(solflareDeepLink);
        Alert.alert(
          'Connect Wallet',
          'Open Solflare and approve the connection request, then return to this app',
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert(
          'Solflare Wallet Required',
          'Please install Solflare Wallet to continue',
          [
            { text: 'Cancel', style: 'cancel' },
            { 
              text: 'Install from Play Store', 
              onPress: () => Linking.openURL('https://play.google.com/store/apps/details?id=com.solflare.mobile') 
            }
          ]
        );
      }
    } catch (err) {
      console.error('[SOLFLARE] Error:', err);
      Alert.alert('Error', 'Could not open Solflare wallet');
    }
  };

  // Inject wallet connection into WebView
  const injectWalletConnection = (walletAddress: string) => {
    const script = `
      (function() {
        console.log('[EXPO] Injecting wallet:', '${walletAddress.slice(0, 8)}...');
        
        window.solana = {
          publicKey: { toBase58: () => '${walletAddress}' },
          isPhantom: true,
          isConnected: true,
          connect: async () => ({ publicKey: { toBase58: () => '${walletAddress}' } }),
          disconnect: async () => { window.solana.isConnected = false; }
        };
        
        localStorage.setItem('olivium_identity', JSON.stringify({
          type: 'wallet',
          wallet: '${walletAddress}',
          source: 'mobile_wallet'
        }));
        
        window.dispatchEvent(new Event('solana:connection-complete'));
        
        if (window.updateWalletUI) window.updateWalletUI();
        if (window.updateStatsUI) window.updateStatsUI();
        if (window.loadUserTreePositions) window.loadUserTreePositions();
        
        const connectModal = document.getElementById('connectModal');
        if (connectModal) connectModal.style.display = 'none';
        
        console.log('[EXPO] Wallet connected successfully');
      })();
    `;
    webViewRef.current?.injectJavaScript(script);
  };

  // Handle messages from WebView
  const handleMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      console.log('[EXPO] Message:', data);
      
      switch (data.type) {
        case 'OPEN_URL':
          if (data.url) {
            WebBrowser.openBrowserAsync(data.url);
          }
          break;
          
        case 'ALERT':
          Alert.alert('Olivium DAO', data.message);
          break;
          
        case 'REQUEST_WALLET_CONNECT':
          setShowWalletModal(true);
          break;
      }
    } catch (err) {
      // Ignore non-JSON messages
    }
  };

  // JavaScript to inject into WebView
  const injectedJavaScript = `
    (function() {
      console.log('[EXPO] Bridge initializing...');
      
      window.__EXPO_ENV__ = true;
      window.isMobileApp = true;
      
      window.connectWallet = async function() {
        console.log('[EXPO] Connect wallet requested');
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'REQUEST_WALLET_CONNECT'
        }));
        return new Promise(() => {});
      };
      
      const walletBtn = document.querySelector('#walletConnectCard #connectWalletBtn');
      if (walletBtn) {
        walletBtn.onclick = async (e) => {
          e.preventDefault();
          e.stopPropagation();
          console.log('[EXPO] Wallet button clicked');
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'REQUEST_WALLET_CONNECT'
          }));
          return false;
        };
      }
      
      console.log('[EXPO] Bridge ready');
    })();
  `;

  // Wallet Selection Modal Component
  const WalletSelectionModal = () => (
    <Modal
      visible={showWalletModal}
      transparent={true}
      animationType="slide"
      onRequestClose={() => setShowWalletModal(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>Connect Wallet</Text>
          <Text style={styles.modalSubtitle}>Choose your wallet provider</Text>
          
          <TouchableOpacity 
            style={styles.walletOption}
            onPress={openPhantomWallet}  // ← Calls the function
          >
            <Text style={styles.walletName}>🟣 Phantom Wallet</Text>
            <Text style={styles.walletDesc}>Connect with Solana's most popular mobile wallet</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={styles.walletOption}
            onPress={openSolflareWallet}  // ← Calls the function
          >
            <Text style={styles.walletName}>🟠 Solflare Wallet</Text>
            <Text style={styles.walletDesc}>Secure Solana wallet with mobile app</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.walletOption, styles.demoWalletOption]}
            onPress={() => {
              const mockAddress = 'Demo' + Math.random().toString(36).substring(2, 15);
              injectWalletConnection(mockAddress);
              setWalletConnected(true);
              setShowWalletModal(false);
            }}
          >
            <Text style={styles.walletName}>🧪 Demo Wallet (Testing)</Text>
            <Text style={styles.walletDesc}>Use mock wallet for testing without real wallet</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={styles.cancelButton}
            onPress={() => setShowWalletModal(false)}
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  // Main render
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0C0E0A" />
      
      <WebView
        ref={webViewRef}
        source={{ uri: 'https://olive-clean.vercel.app/index2.html' }}
        style={styles.webview}
        onLoadStart={() => setLoading(true)}
        onLoadEnd={() => setLoading(false)}
        onMessage={handleMessage}
        injectedJavaScript={injectedJavaScript}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        allowsInlineMediaPlayback={true}
        originWhitelist={['*']}
        scalesPageToFit={Platform.OS === 'android'}
      />
      
      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#C5A059" />
          <Text style={styles.loadingText}>Loading Olivium Grove...</Text>
        </View>
      )}
      
      <WalletSelectionModal />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0C0E0A',
  },
  webview: {
    flex: 1,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#0C0E0A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    color: '#C5A059',
    fontSize: 14,
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1a1a1a',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#C5A059',
    textAlign: 'center',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 24,
  },
  walletOption: {
    backgroundColor: '#2a2a2a',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#333',
  },
  demoWalletOption: {
    borderColor: '#C5A059',
    backgroundColor: '#2a2a1a',
  },
  walletName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  walletDesc: {
    fontSize: 12,
    color: '#888',
  },
  cancelButton: {
    marginTop: 16,
    padding: 16,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 16,
    color: '#888',
  },
});
