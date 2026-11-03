// Données entièrement fictives pour la démonstration hors ligne.
export type DemoDoctor = { id: number; name: string; specialty: string; clinic: string; address: string; rating: string; fee: string; available: string; initials: string; tint: string };
export const demoDoctors: DemoDoctor[] = [
  { id: 1, name: 'Dr. Hélène Dubois', specialty: 'Médecine générale', clinic: 'Cabinet Saint-Lazare', address: 'Centre médical fictif A', rating: '4.9', fee: '25 USD', available: 'Demain à 09:30', initials: 'HD', tint: '#E5E9FF' },
  { id: 2, name: 'Dr. Marc Laurent', specialty: 'Cardiologie', clinic: 'Institut Cardio', address: 'Centre médical fictif B', rating: '4.8', fee: '30 USD', available: 'Jeudi à 10:30', initials: 'ML', tint: '#DCEFF4' },
  { id: 3, name: 'Dr. Amina Benali', specialty: 'Dermatologie', clinic: 'Clinique Horizon', address: 'Centre médical fictif C', rating: '5.0', fee: '20 USD', available: 'Vendredi à 15:00', initials: 'AB', tint: '#F9E7DC' },
];
export const specialties = ['Toutes', 'Médecine générale', 'Cardiologie', 'Dermatologie', 'Pédiatrie', 'Dentiste'];
