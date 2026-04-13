import React, {useEffect, useState} from 'react';
import {StatusBar, View, Text, StyleSheet, ActivityIndicator} from 'react-native';
import {NavigationContainer} from '@react-navigation/native';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {SafeAreaProvider} from 'react-native-safe-area-context';

import AppNavigator from './src/navigation/AppNavigator';
import {initDatabase, seedTestData} from './src/services/database';
import {Colors} from './src/theme';

export default function App(): React.JSX.Element {
  const [dbReady, setDbReady] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        await initDatabase();
        // Comment out seedTestData() once you have real data
        await seedTestData();
        setDbReady(true);
      } catch (err) {
        setDbError(err instanceof Error ? err.message : 'Database init failed');
      }
    })();
  }, []);

  if (dbError) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>DB Error: {dbError}</Text>
      </View>
    );
  }

  if (!dbReady) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Initialisation…</Text>
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <NavigationContainer>
          <StatusBar barStyle="light-content" backgroundColor={Colors.background} />
          <AppNavigator />
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1},
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
  },
  loadingText: {
    color: Colors.textSecondary,
    marginTop: 12,
    fontSize: 14,
  },
  errorText: {
    color: Colors.danger,
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
});
