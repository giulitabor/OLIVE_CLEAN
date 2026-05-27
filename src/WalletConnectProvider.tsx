import React, { useEffect, useRef } from 'react';
import { View, Text, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import * as Linking from 'expo-linking';
import * as Application from 'expo-application';

// Polyfills required for WalletConnect
import 'react-native-get-random-values';
import '@walletconnect/react-native-compat';
import { Buffer } from 'buffer';

// Make Buffer globally available
global.Buffer = Buffer;

// WalletConnect config
export const walletConnectConfig = {
  projectId: '63354e30a16132d477272948aac10e62', // Replace with your actual Project ID
  metadata: {
    name: 'Olivium DAO',
    description: 'Digital olive tree adoption and stewardship',
    url: 'https://olive-clean.vercel.app',
    icons: ['https://raw.githubusercontent.com/kyngrick/olivium_photos/main/olivium_logo2.png'],
    redirect: {
      native: 'olivium://',
      universal: 'https://olive-clean.vercel.app'
    }
  }
};

// Deep link handling for wallet redirects
export const setupDeepLinks = () => {
  const handleDeepLink = (event: { url: string }) => {
    const { url } = event;
    console.log('[DEEP LINK] Received:', url);
    
    // Handle wallet redirects
    if (url && (
      url.includes('wc:') ||
      url.includes('phantom') ||
      url.includes('solflare')
    )) {
      // Notify WebView about the deep link
      if (window.webViewRef) {
        window.webViewRef.injectJavaScript(`
          if (window.walletConnectListener) {
            window.walletConnectListener('${url}');
          }
        `);
      }
    }
  };

  // Add listener for deep links
  const subscription = Linking.addEventListener('url', handleDeepLink);
  
  // Check initial URL
  Linking.getInitialURL().then((url) => {
    if (url) handleDeepLink({ url });
  });

  return subscription;
};
