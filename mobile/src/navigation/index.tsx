import React from 'react';
import { ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Role, useAuth } from '../context/AuthContext';
import { color, fonts, palette } from '../theme';
import Icon, { IconName } from '../components/ui/Icon';

import LoginScreen from '../screens/auth/LoginScreen';
import RegisterScreen from '../screens/auth/RegisterScreen';

import HomeScreen from '../screens/patient/HomeScreen';
import DoctorListScreen from '../screens/patient/DoctorListScreen';
import DoctorProfileScreen from '../screens/patient/DoctorProfileScreen';
import SlotPickerScreen from '../screens/patient/SlotPickerScreen';
import BookingConfirmScreen from '../screens/patient/BookingConfirmScreen';
import BookingReviewScreen from '../screens/patient/BookingReviewScreen';
import BookingConflictScreen from '../screens/patient/BookingConflictScreen';
import MyAppointmentsScreen from '../screens/patient/MyAppointmentsScreen';
import MedicalRecordScreen from '../screens/patient/MedicalRecordScreen';
import NotificationsScreen from '../screens/patient/NotificationsScreen';
import WaitingListScreen from '../screens/patient/WaitingListScreen';

import DoctorDashboardScreen from '../screens/doctor/DoctorDashboardScreen';
import DoctorAgendaScreen from '../screens/doctor/DoctorAgendaScreen';
import AgendaSettingsScreen from '../screens/doctor/AgendaSettingsScreen';
import AppointmentDetailScreen from '../screens/doctor/AppointmentDetailScreen';

import ClinicManagementScreen from '../screens/admin/ClinicManagementScreen';
import ProfileScreen from '../screens/common/ProfileScreen';

import SecretaryDashboardScreen from '../screens/secretary/SecretaryDashboardScreen';
import SecretaryAppointmentsScreen from '../screens/secretary/SecretaryAppointmentsScreen';
import SecretaryDoctorsScreen from '../screens/secretary/SecretaryDoctorsScreen';
import SecretaryStatsScreen from '../screens/secretary/SecretaryStatsScreen';
import SecretaryBookScreen from '../screens/secretary/SecretaryBookScreen';
import SecretaryDoctorFormScreen from '../screens/secretary/SecretaryDoctorFormScreen';
import SecretaryDoctorScheduleScreen from '../screens/secretary/SecretaryDoctorScheduleScreen';


const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

type TabDef = {
  name: string;
  component: React.ComponentType<any>;
  icon: IconName;
  iconActive: IconName;
  headerShown?: boolean;
};

const profileTab: TabDef = {
  name: 'Profil',
  component: ProfileScreen,
  icon: 'person-outline',
  iconActive: 'person',
};

const tabsByRole: Record<Role, { headerShown: boolean; tabs: TabDef[] }> = {
  patient: {
    headerShown: false,
    tabs: [
      { name: 'Accueil', component: HomeScreen, icon: 'home-outline', iconActive: 'home' },
      { name: 'Médecins', component: DoctorListScreen, icon: 'medkit-outline', iconActive: 'medkit' },
      { name: 'Mes RDV', component: MyAppointmentsScreen, icon: 'calendar-outline', iconActive: 'calendar' },
      profileTab,
    ],
  },
  doctor: {
    headerShown: false,
    tabs: [
      { name: 'Tableau de bord', component: DoctorDashboardScreen, icon: 'grid-outline', iconActive: 'grid' },
      { name: 'Agenda', component: DoctorAgendaScreen, icon: 'calendar-outline', iconActive: 'calendar' },
      profileTab,
    ],
  },
  admin: {
    headerShown: false,
    tabs: [
      { name: 'Cabinet', component: ClinicManagementScreen, icon: 'business-outline', iconActive: 'business' },
      { name: 'Rendez-vous', component: SecretaryAppointmentsScreen, icon: 'calendar-outline', iconActive: 'calendar' },
      { name: 'Médecins', component: SecretaryDoctorsScreen, icon: 'medkit-outline', iconActive: 'medkit' },
      { name: 'Statistiques', component: SecretaryStatsScreen, icon: 'stats-chart-outline', iconActive: 'stats-chart' },
      profileTab,
    ],
  },
  secretary: {
    headerShown: false,
    tabs: [
      { name: 'Accueil', component: SecretaryDashboardScreen, icon: 'home-outline', iconActive: 'home' },
      { name: 'Rendez-vous', component: SecretaryAppointmentsScreen, icon: 'calendar-outline', iconActive: 'calendar' },
      { name: 'Médecins', component: SecretaryDoctorsScreen, icon: 'medkit-outline', iconActive: 'medkit' },
      { name: 'Statistiques', component: SecretaryStatsScreen, icon: 'stats-chart-outline', iconActive: 'stats-chart' },
      profileTab,
    ],
  },
};

const makeRoleTabs = (role: Role) =>
  function RoleTabs() {
    const insets = useSafeAreaInsets();
    const config = tabsByRole[role];
    const compact = config.tabs.length > 4;

    return (
      <Tab.Navigator
        screenOptions={{
          headerShown: config.headerShown,
          headerTitleStyle: { fontFamily: fonts.semibold, color: color.text },
          headerStyle: { backgroundColor: color.surface },
          headerShadowVisible: false,
          tabBarActiveTintColor: palette.primaryBright,
          tabBarInactiveTintColor: color.textSecondary,
          tabBarLabelStyle: {
            fontFamily: fonts.semibold,
            fontSize: compact ? 11 : 12,
            lineHeight: 16,
            letterSpacing: compact ? 0 : 0.24,
          },
          tabBarIconStyle: { marginTop: 2 },
          tabBarStyle: {
            height: 64 + insets.bottom,
            paddingTop: 8,
            paddingBottom: 8 + insets.bottom,
            backgroundColor: 'rgba(255,255,255,0.95)',
            borderTopWidth: 0,
            shadowColor: palette.shadow,
            shadowOpacity: 0.06,
            shadowRadius: 20,
            shadowOffset: { width: 0, height: -4 },
            elevation: 8,
          },
        }}
      >
        {config.tabs.map((t) => (
          <Tab.Screen
            key={t.name}
            name={t.name}
            component={t.component}
            options={{
              ...(t.headerShown !== undefined ? { headerShown: t.headerShown } : {}),
              tabBarIcon: ({ focused, color: tint }) => (
                <Icon name={focused ? t.iconActive : t.icon} size="lg" color={tint} />
              ),
            }}
          />
        ))}
      </Tab.Navigator>
    );
  };

const stackOptions = {
  headerTitleStyle: { fontFamily: fonts.semibold, fontSize: 17, color: color.text },
  headerStyle: { backgroundColor: color.surface },
  headerTintColor: color.text,
  headerShadowVisible: false,
  headerBackTitle: 'Retour',
  contentStyle: { backgroundColor: color.page },
};

const tabsForRole: Record<Role, React.ComponentType> = {
  patient: makeRoleTabs('patient'),
  doctor: makeRoleTabs('doctor'),
  admin: makeRoleTabs('admin'),
  secretary: makeRoleTabs('secretary'),
};

// ============================================
// NAVIGATEUR PRINCIPAL
// ============================================

export default function RootNavigator() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <ActivityIndicator
        style={{ flex: 1 }}
        color={color.primary}
      />
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={stackOptions}>
        {!user ? (
          <>
            <Stack.Screen
              name="Login"
              component={LoginScreen}
              options={{ headerShown: false }}
            />

            <Stack.Screen
              name="Register"
              component={RegisterScreen}
              options={{ headerShown: false }}
            />
          </>
        ) : (
          <>
            <Stack.Screen
              name="Main"
              component={tabsForRole[user.role] ?? tabsForRole.patient}
              options={{ headerShown: false }}
            />

            {user.role === 'patient' && (
              <Stack.Screen
                name="Notifications"
                component={NotificationsScreen}
                options={{ title: 'Notifications' }}
              />
            )}

            <Stack.Screen
              name="DoctorProfile"
              component={DoctorProfileScreen}
              options={{ title: 'Médecin' }}
            />

            <Stack.Screen
              name="SlotPicker"
              component={SlotPickerScreen}
              options={{ title: 'Choisir un créneau' }}
            />

            <Stack.Screen
              name="MedicalRecord"
              component={MedicalRecordScreen}
              options={{ title: 'Dossier médical' }}
            />

            <Stack.Screen
              name="BookingReview"
              component={BookingReviewScreen}
              options={{ title: 'Confirmation de réservation' }}
            />

            <Stack.Screen
              name="BookingConflict"
              component={BookingConflictScreen}
              options={{ title: 'Créneau indisponible' }}
            />

            <Stack.Screen
              name="WaitingList"
              component={WaitingListScreen}
              options={{ title: 'Alerte désistement' }}
            />

            <Stack.Screen
              name="BookingConfirm"
              component={BookingConfirmScreen}
              options={{ title: 'Confirmation', headerBackVisible: false, gestureEnabled: false }}
            />

            {/* FICHE DE CONSULTATION DU MÉDECIN */}
            <Stack.Screen
              name="AppointmentDetail"
              component={AppointmentDetailScreen}
              options={{
                title: 'Fiche de consultation',
                headerBackTitle: 'Retour',
              }}
            />

            {user.role === 'doctor' && (
              <Stack.Screen
                name="AgendaSettings"
                component={AgendaSettingsScreen}
                options={{ title: 'Horaires et congés' }}
              />
            )}

            <Stack.Screen
              name="SecretaryBook"
              component={SecretaryBookScreen}
              options={{ title: 'Nouveau rendez-vous' }}
            />

            <Stack.Screen
              name="SecretaryDoctorForm"
              component={SecretaryDoctorFormScreen}
              options={{ title: 'Médecin' }}
            />

            <Stack.Screen
              name="SecretaryDoctorSchedule"
              component={SecretaryDoctorScheduleScreen}
              options={{ title: 'Horaires' }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
