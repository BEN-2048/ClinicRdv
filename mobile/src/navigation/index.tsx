
import React from 'react';
import { ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

import { Role, useAuth } from '../context/AuthContext';
import { colors } from '../theme/colors';
import { fonts, palette } from '../theme/figma';
import FigmaIcon, { FigmaIconName } from '../components/FigmaIcon';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
<<<<<<< HEAD
import NotificationsScreen from '../screens/patient/NotificationsScreen';

=======
import WaitingListScreen from '../screens/patient/WaitingListScreen';
>>>>>>> origin/main
import DoctorDashboardScreen from '../screens/doctor/DoctorDashboardScreen';
import DoctorAgendaScreen from '../screens/doctor/DoctorAgendaScreen';
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

const tabOpts = {
  headerShown: false,
  tabBarActiveTintColor: colors.primary,
  tabBarInactiveTintColor: colors.muted,
  tabBarLabelStyle: {
    fontSize: 11,
    fontWeight: '600' as const,
  },
  tabBarStyle: {
    height: 62,
    paddingBottom: 7,
    paddingTop: 5,
    backgroundColor: '#FFFFFF',
    borderTopColor: '#E9EDF6',
  },
};

<<<<<<< HEAD
// ============================================
// NAVIGATION PATIENT
// ============================================

const PatientTabs = () => (
  <Tab.Navigator screenOptions={tabOpts}>
    <Tab.Screen
      name="Accueil"
      component={HomeScreen}
      options={{
        tabBarIcon: ({ color, size }) => (
          <Ionicons name="home-outline" size={size} color={color} />
        ),
      }}
    />

    <Tab.Screen
      name="Médecins"
      component={DoctorListScreen}
      options={{
        tabBarIcon: ({ color, size }) => (
          <MaterialCommunityIcons
            name="stethoscope"
            size={size}
            color={color}
          />
        ),
      }}
    />

    <Tab.Screen
      name="Mes RDV"
      component={MyAppointmentsScreen}
      options={{
        tabBarIcon: ({ color, size }) => (
          <Ionicons name="calendar-outline" size={size} color={color} />
        ),
      }}
    />

    <Tab.Screen
      name="Profil"
      component={ProfileScreen}
      options={{
        tabBarIcon: ({ color, size }) => (
          <Ionicons name="person-outline" size={size} color={color} />
        ),
      }}
    />
  </Tab.Navigator>
);
=======
const patientTabIcons: Record<string, string> = {
  Accueil: 'tab-home',
  Médecins: 'tab-doctors',
  'Mes RDV': 'tab-appointments',
  Profil: 'tab-profile',
};

const PatientTabs = () => {
  const insets = useSafeAreaInsets();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarActiveTintColor: palette.primaryBright,
        tabBarInactiveTintColor: palette.inkSoft,
        tabBarLabelStyle: { fontFamily: fonts.semibold, fontSize: 12, lineHeight: 16, letterSpacing: 0.24 },
        tabBarIconStyle: { marginTop: 2 },
        tabBarStyle: {
          height: 64 + insets.bottom,
          paddingTop: 8,
          paddingBottom: 8 + insets.bottom,
          backgroundColor: 'rgba(255,255,255,0.95)',
          borderTopWidth: 0,
          shadowColor: '#0F172A',
          shadowOpacity: 0.06,
          shadowRadius: 20,
          shadowOffset: { width: 0, height: -4 },
          elevation: 8,
        },
        tabBarIcon: ({ focused }) => (
          <FigmaIcon name={`${patientTabIcons[route.name]}-${focused ? 'active' : 'inactive'}` as FigmaIconName} />
        ),
      })}
    >
      <Tab.Screen name="Accueil" component={HomeScreen} />
      <Tab.Screen name="Médecins" component={DoctorListScreen} />
      <Tab.Screen name="Mes RDV" component={MyAppointmentsScreen} options={{ headerShown: false }} />
      <Tab.Screen name="Profil" component={ProfileScreen} />
    </Tab.Navigator>
  );
};
>>>>>>> origin/main

// ============================================
// NAVIGATION MÉDECIN
// ============================================

const DoctorTabs = () => (
  <Tab.Navigator screenOptions={tabOpts}>
    <Tab.Screen
      name="Tableau de bord"
      component={DoctorDashboardScreen}
    />

    <Tab.Screen
      name="Agenda"
      component={DoctorAgendaScreen}
    />

    <Tab.Screen
      name="Profil"
      component={ProfileScreen}
    />
  </Tab.Navigator>
);

// ============================================
// NAVIGATION ADMINISTRATION
// ============================================

const AdminTabs = () => (
  <Tab.Navigator screenOptions={tabOpts}>
    <Tab.Screen
      name="Clinique"
      component={ClinicManagementScreen}
    />

    <Tab.Screen
      name="Profil"
      component={ProfileScreen}
    />
  </Tab.Navigator>
);

// ============================================
// NAVIGATION SECRÉTARIAT
// ============================================

const SecretaryTabs = () => (
  <Tab.Navigator screenOptions={tabOpts}>
    <Tab.Screen
      name="Accueil"
      component={SecretaryDashboardScreen}
    />

    <Tab.Screen
      name="Rendez-vous"
      component={SecretaryAppointmentsScreen}
    />

    <Tab.Screen
      name="Médecins"
      component={SecretaryDoctorsScreen}
    />

    <Tab.Screen
      name="Statistiques"
      component={SecretaryStatsScreen}
    />

    <Tab.Screen
      name="Profil"
      component={ProfileScreen}
    />
  </Tab.Navigator>
);

// ============================================
// NAVIGATION SELON LE RÔLE
// ============================================

const tabsForRole: Record<Role, React.ComponentType> = {
  patient: PatientTabs,
  doctor: DoctorTabs,
  admin: AdminTabs,
  secretary: SecretaryTabs,
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
        color={colors.primary}
      />
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator>

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
              options={{ title: 'Inscription' }}
            />
          </>
        ) : (
          <>
            <Stack.Screen
              name="Main"
              component={tabsForRole[user.role] ?? PatientTabs}
              options={{ headerShown: false }}
            />

            {user.role === 'patient' && (
              <Stack.Screen
                name="Notifications"
                component={NotificationsScreen}
                options={{
                  title: 'Notifications',
                  headerShown: false,
                }}
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
  name="BookingReview"
  component={BookingReviewScreen}
  options={{
    title: 'Confirmation de réservation',
    headerShown: false,
  }}
/>
<Stack.Screen
  name="BookingConflict"
  component={BookingConflictScreen}
  options={{
    title: 'Conflit de réservation',
    headerShown: false,
  }}
/>
<Stack.Screen
  name="WaitingList"
  component={WaitingListScreen}
  options={{
    title: 'Alerte désistement',
    headerTitleStyle: { fontFamily: fonts.semibold },
    headerStyle: { backgroundColor: palette.page },
    headerShadowVisible: false,
  }}
            />

            <Stack.Screen
              name="BookingConfirm"
              component={BookingConfirmScreen}
              options={{ title: 'Confirmation' }}
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
