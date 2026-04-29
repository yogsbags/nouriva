import React from 'react';
import { Platform } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScanIcon as Scan, ClockCounterClockwiseIcon as HistoryIcon, ChartLineIcon as ChartLine, UserIcon as User, ClockCounterClockwiseIcon as ClockCounterClockwise } from 'phosphor-react-native';
import { useColors } from '../theme';
import ScannerScreen from '../screens/ScannerScreen';
import HistoryScreen from '../screens/HistoryScreen';
import TodayScreen from '../screens/TodayScreen';
import ProfileScreen from '../screens/ProfileScreen';

const Tab = createBottomTabNavigator();

// Android 3-button nav bar is ~48dp tall. useSafeAreaInsets().bottom can
// return 0 on some Android devices when window insets aren't forwarded,
// so we use a platform-specific minimum to ensure labels are never cut off.
const ANDROID_NAV_FALLBACK = 28;

export default function MainTabNavigator() {
  const insets = useSafeAreaInsets();
  const C = useColors();
  const bottomPad = Platform.OS === 'android'
    ? Math.max(insets.bottom, ANDROID_NAV_FALLBACK)
    : Math.max(insets.bottom, 8);

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
          paddingTop: 8,
          paddingBottom: bottomPad,
          minHeight: 60 + bottomPad,
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
