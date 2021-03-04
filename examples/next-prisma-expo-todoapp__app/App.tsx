import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { trpc } from './utils/trpc';
import { QueryClientProvider } from 'react-query';

export default function App() {
  return (
    <QueryClientProvider client={trpc.queryClient}>
      <View style={styles.container}>
        <Text>Open up App.tsx to start working on your app!</Text>
      </View>
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
