import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScanIcon as Scan, ClockCounterClockwiseIcon as HistoryIcon, ChartLineIcon as ChartLine, UserIcon as User, ClockCounterClockwiseIcon as ClockCounterClockwise } from 'phosphor-react-native';
import { useColors } from '../theme';
import ScannerScreen from '../screens/ScannerScreen';
import HistoryScreen from '../screens/HistoryScreen';
import TodayScreen from '../screens/TodayScreen';
import ProfileScreen from '../screens/ProfileScreen';

const Tab = createBottomTabNavigator();

export default function MainTabNavigator() {
  const insets = useSafeAreaInsets();
  const C = useColors();
  const bottomPad = Math.max(insets.bottom, 8);

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: C.tabActive,
        tabBarInactiveTintColor: C.tabInactive,
        tabBarStyle: {
          backgroundColor: C.tabBarBg,
          borderTopColor: C.tabBarBorder,
          borderTopWidth: 1,
          paddingTop: 6,
          paddingBottom: bottomPad,
          minHeight: 52 + bottomPad,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tab.Screen
        name="Scan"
        component={ScannerScreen}
        options={{
          tabBarLabel: 'Scan',
          tabBarIcon: ({ color, size }) => <Scan color={color} size={size ?? 22} weight="bold" />,
        }}
      />
      <Tab.Screen
        name="History"
        component={HistoryScreen}
        options={{
          tabBarLabel: 'History',
          tabBarIcon: ({ color, size }) => <ClockCounterClockwise color={color} size={size ?? 22} weight="bold" />,
        }}
      />
      <Tab.Screen
        name="Chart"
        component={TodayScreen}
        options={{
          tabBarLabel: 'Chart',
          tabBarIcon: ({ color, size }) => <ChartLine color={color} size={size ?? 22} weight="bold" />,
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarLabel: 'Profile',
          tabBarIcon: ({ color, size }) => <User color={color} size={size ?? 22} weight="bold" />,
        }}
      />
    </Tab.Navigator>
  );
}
