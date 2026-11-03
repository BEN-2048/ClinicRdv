
import React from 'react';
import { ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useAuth } from '../context/AuthContext';
import { colors } from '../theme/colors';

import LoginScreen from '../screens/auth/LoginScreen';
import RegisterScreen from '../screens/auth/RegisterScreen';
import HomeScreen from '../screens/patient/HomeScreen';
import DoctorListScreen from '../screens/patient/DoctorListScreen';
import DoctorProfileScreen from '../screens/patient/DoctorProfileScreen';
import SlotPickerScreen from '../screens/patient/SlotPickerScreen';
import BookingConfirmScreen from '../screens/patient/BookingConfirmScreen';
import MyAppointmentsScreen from '../screens/patient/MyAppointmentsScreen';
import DoctorDashboardScreen from '../screens/doctor/DoctorDashboardScreen';
import DoctorAgendaScreen from '../screens/doctor/DoctorAgendaScreen';
import AppointmentDetailScreen from '../screens/doctor/AppointmentDetailScreen';
import ClinicManagementScreen from '../screens/admin/ClinicManagementScreen';
import ProfileScreen from '../screens/common/ProfileScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const tabOpts = {
  tabBarActiveTintColor: colors.primary,
};

const PatientTabs = () => (
  <Tab.Navigator screenOptions={tabOpts}>
    <Tab.Screen name="Accueil" component={HomeScreen} />
    <Tab.Screen name="Médecins" component={DoctorListScreen} />
    <Tab.Screen name="Mes RDV" component={MyAppointmentsScreen} />
    <Tab.Screen name="Profil" component={ProfileScreen} />
  </Tab.Navigator>
);

const DoctorTabs = () => (
  <Tab.Navigator screenOptions={tabOpts}>
    <Tab.Screen name="Tableau de bord" component={DoctorDashboardScreen} />
    <Tab.Screen name="Agenda" component={DoctorAgendaScreen} />
    <Tab.Screen name="Profil" component={ProfileScreen} />
  </Tab.Navigator>
);

const AdminTabs = () => (
  <Tab.Navigator screenOptions={tabOpts}>
    <Tab.Screen name="Clinique" component={ClinicManagementScreen} />
    <Tab.Screen name="Profil" component={ProfileScreen} />
  </Tab.Navigator>
);

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
              component={
                user.role === 'doctor'
                  ? DoctorTabs
                  : user.role === 'admin'
                    ? AdminTabs
                    : SlotPickerScreen
              }
              options={{ headerShown: false }}
            />

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

            <Stack.Screen
              name="AppointmentDetail"
              component={AppointmentDetailScreen}
              options={{ title: 'Rendez-vous' }}
            />
          </>
        )}

      </Stack.Navigator>
    </NavigationContainer>
  );
}
