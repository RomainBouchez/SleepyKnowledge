import React from 'react';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {StyleSheet, View, Text} from 'react-native';

import DashboardScreen from '../screens/DashboardScreen';
import ChatScreen from '../screens/ChatScreen';
import PatternsScreen from '../screens/PatternsScreen';
import ReportScreen from '../screens/ReportScreen';
import {Colors, Spacing} from '../theme';

// ── Tab param list ────────────────────────────────────────────────────────────

export type RootTabParamList = {
  Dashboard: undefined;
  Chat: undefined;
  Patterns: undefined;
  Report: undefined;
};

const Tab = createBottomTabNavigator<RootTabParamList>();

// ── Tab icon (emoji-based, no native icon fonts needed during dev) ─────────────

function TabIcon({
  label,
  focused,
}: {
  label: string;
  focused: boolean;
}): React.JSX.Element {
  const icons: Record<string, string> = {
    Dashboard: '🌙',
    Chat: '💬',
    Patterns: '📊',
    Report: '📋',
  };
  return (
    <View style={styles.iconWrapper}>
      <Text style={[styles.iconText, focused && styles.iconFocused]}>
        {icons[label] ?? '●'}
      </Text>
    </View>
  );
}

// ── Navigator ─────────────────────────────────────────────────────────────────

export default function AppNavigator(): React.JSX.Element {
  return (
    <Tab.Navigator
      screenOptions={({route}) => ({
        headerShown: false,
        tabBarIcon: ({focused}) => (
          <TabIcon label={route.name} focused={focused} />
        ),
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarLabelStyle: styles.tabLabel,
        tabBarItemStyle: styles.tabItem,
      })}>
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{tabBarLabel: 'Nuit'}}
      />
      <Tab.Screen
        name="Chat"
        component={ChatScreen}
        options={{tabBarLabel: 'Coach IA'}}
      />
      <Tab.Screen
        name="Patterns"
        component={PatternsScreen}
        options={{tabBarLabel: 'Patterns'}}
      />
      <Tab.Screen
        name="Report"
        component={ReportScreen}
        options={{tabBarLabel: 'Rapport'}}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: Colors.surface,
    borderTopColor: Colors.border,
    borderTopWidth: 1,
    height: 84,
    paddingBottom: Spacing.lg,
    paddingTop: Spacing.sm,
  },
  tabItem: {
    paddingTop: 4,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 0.3,
  },
  iconWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: {
    fontSize: 22,
    opacity: 0.5,
  },
  iconFocused: {
    opacity: 1,
  },
});
