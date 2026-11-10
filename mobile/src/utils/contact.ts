import { Alert, Linking } from 'react-native';

const digits = (phone: string) => phone.replace(/[^\d+]/g, '');

const open = async (url: string, what: string) => {
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert(`${what} impossible`, 'Ce téléphone ne peut pas ouvrir cette application. Composez le numéro manuellement.');
  }
};

export const callNumber = (phone: string) => open(`tel:${digits(phone)}`, 'Appel');

export const sendSms = (phone: string) => open(`sms:${digits(phone)}`, 'Envoi de SMS');
