import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { AppDataProvider, useAppData } from '../src/context/AppDataContext';
import { theme } from '../src/theme/theme';

function InnerLayout() {
  const { loading } = useAppData();

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: theme.colors.card,
          borderTopColor: theme.colors.border
        },
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textSecondary,
        tabBarLabel: ({ focused, color }) => (
          <Text
            style={{
              color,
              fontSize: theme.fontSize.xs,
              fontWeight: focused ? '600' : '400'
            }}
          >
            {route.name === 'index'
              ? 'Home'
              : route.name.charAt(0).toUpperCase() + route.name.slice(1)}
          </Text>
        ),
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: keyof typeof Ionicons.glyphMap = 'home-outline';

          if (route.name === 'index') {
            iconName = focused ? 'home' : 'home-outline';
          } else if (route.name === 'projects') {
            iconName = focused ? 'briefcase' : 'briefcase-outline';
          } else if (route.name === 'about') {
            iconName = focused ? 'person' : 'person-outline';
          } else if (route.name === 'contact') {
            iconName = focused ? 'chatbubble' : 'chatbubble-outline';
          }

          return <Ionicons name={iconName} size={size} color={color} />;
        }
      })}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="projects" options={{ title: 'Projects' }} />
      <Tabs.Screen name="about" options={{ title: 'About' }} />
      <Tabs.Screen name="contact" options={{ title: 'Contact' }} />
    </Tabs>
  );
}

export default function RootLayout() {
  return (
    <AppDataProvider>
      <InnerLayout />
    </AppDataProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: theme.colors.background,
    alignItems: 'center',
    justifyContent: 'center'
  }
});
