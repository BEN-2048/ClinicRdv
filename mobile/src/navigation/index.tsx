
import React from 'react';
import { ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

import { Role, useAuth } from '../context/AuthContext';
import { colors } from '../theme/colors';

import LoginScreen from '../screens/auth/LoginScreen';
import RegisterScreen from '../screens/auth/RegisterScreen';

import HomeScreen from '../screens/patient/HomeScreen';
import DoctorListScreen from '../screens/patient/DoctorListScreen';
import DoctorProfileScreen from '../screens/patient/DoctorProfileScreen';
import SlotPickerScreen from '../screens/patient/SlotPickerScreen';
import BookingConfirmScreen from '../screens/patient/BookingConfirmScreen';
import MyAppointmentsScreen from '../screens/patient/MyAppointmentsScreen';
import NotificationsScreen from '../screens/patient/NotificationsScreen';

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
