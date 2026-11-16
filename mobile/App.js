import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { IBMPlexSans_400Regular, IBMPlexSans_500Medium, IBMPlexSans_600SemiBold, useFonts } from '@expo-google-fonts/ibm-plex-sans';
import Ionicons from '@expo/vector-icons/Ionicons';
import { loadSession, logout, setExpiredHandler } from './src/api';
import { colors, fonts } from './src/theme';
import { Loading, ToastProvider } from './src/ui';
import LoginScreen from './src/screens/LoginScreen';
import HomeScreen from './src/screens/HomeScreen';
import SalesScreen from './src/screens/SalesScreen';
import ProductionScreen from './src/screens/ProductionScreen';
import IngredientsScreen from './src/screens/IngredientsScreen';
import AssistantScreen from './src/screens/AssistantScreen';
import { AccountScreen, CashScreen, MoreScreen, TruthScreen } from './src/screens/MoreScreens';

const Tabs = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const navTheme = { ...DefaultTheme, colors: { ...DefaultTheme.colors, background: colors.ground, primary: colors.accent, card: colors.surface, text: colors.text, border: colors.border } };

const TABS = {
  admin: [['Início', HomeScreen, 'home'], ['Vendas', SalesScreen, 'bag-handle'], ['Produção', ProductionScreen, 'flame'], ['Insumos', IngredientsScreen, 'cube'], ['Mais', MoreScreen, 'menu']],
  seller: [['Início', HomeScreen, 'home'], ['Vendas', SalesScreen, 'bag-handle'], ['Assistente', AssistantScreen, 'sparkles'], ['Mais', MoreScreen, 'menu']],
  producer: [['Início', HomeScreen, 'home'], ['Produção', ProductionScreen, 'flame'], ['Assistente', AssistantScreen, 'sparkles'], ['Mais', MoreScreen, 'menu']],
};

function MainTabs({ user, onLogout }) {
  return <Tabs.Navigator screenOptions={({ route }) => {
    const icon = (TABS[user.role] || TABS.seller).find(([name]) => name === route.name)?.[2];
    return {
      headerShown: false,
      tabBarActiveTintColor: colors.accentInk,
      tabBarInactiveTintColor: colors.faint,
      tabBarLabelStyle: { fontFamily: fonts.medium, fontSize: 11 },
      tabBarStyle: { borderTopColor: colors.border, backgroundColor: colors.surface },
      tabBarIcon: ({ focused, color, size }) => <Ionicons name={focused ? icon : `${icon}-outline`} size={size - 2} color={color} />,
    };
  }}>
    {(TABS[user.role] || TABS.seller).map(([name, Component]) => <Tabs.Screen key={name} name={name}>{props => <Component {...props} user={user} onLogout={onLogout} />}</Tabs.Screen>)}
  </Tabs.Navigator>;
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState(null);
  const [fontsLoaded] = useFonts({ IBMPlexSans_400Regular, IBMPlexSans_500Medium, IBMPlexSans_600SemiBold });

  useEffect(() => {
    setExpiredHandler(() => setUser(null));
    loadSession().then(session => { setUser(session.token ? session.user : null); setReady(true); });
  }, []);

  const handleLogout = async () => { await logout(); setUser(null); };

  if (!ready || !fontsLoaded) return <View style={{ flex: 1, justifyContent: 'center', backgroundColor: colors.ground }}><Loading /></View>;

  return <SafeAreaProvider>
    <ToastProvider>
      <StatusBar style="dark" />
      {!user ? <LoginScreen onLogin={setUser} /> : <NavigationContainer theme={navTheme}>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Tabs">{() => <MainTabs user={user} onLogout={handleLogout} />}</Stack.Screen>
          <Stack.Screen name="Assistente" options={{ presentation: 'modal' }}>{props => <AssistantScreen {...props} user={user} />}</Stack.Screen>
          <Stack.Screen name="Caixa" options={{ presentation: 'modal' }} component={CashScreen} />
          <Stack.Screen name="Verdade" options={{ presentation: 'modal' }} component={TruthScreen} />
          <Stack.Screen name="Conta" options={{ presentation: 'modal' }} component={AccountScreen} />
        </Stack.Navigator>
      </NavigationContainer>}
    </ToastProvider>
  </SafeAreaProvider>;
}
