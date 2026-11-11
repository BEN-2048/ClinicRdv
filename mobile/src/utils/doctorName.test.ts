import { doctorName, doctorShortName } from './doctorName';

describe('doctorName', () => {
  test('ajoute le titre une seule fois', () => {
    expect(doctorName('Paul', 'Kabila')).toBe('Dr. Paul Kabila');
    expect(doctorName('Dr.', 'Ilunga')).toBe('Dr. Ilunga');
    expect(doctorName('Dr. Ilunga')).toBe('Dr. Ilunga');
    expect(doctorName('Dr Dr. Ilunga')).toBe('Dr. Ilunga');
    expect(doctorName('docteur Mutombo')).toBe('Dr. Mutombo');
  });

  test('ne prend pas un nom commencant par dr pour un titre', () => {
    expect(doctorName('Drogba')).toBe('Dr. Drogba');
  });

  test('sans nom, affiche Médecin', () => {
    expect(doctorName(null, undefined)).toBe('Médecin');
    expect(doctorName('Dr.')).toBe('Médecin');
  });

  test('forme courte avec l initiale du prenom', () => {
    expect(doctorShortName('paul', 'Kabila')).toBe('Dr. P. Kabila');
    expect(doctorShortName('Dr.', 'Ilunga')).toBe('Dr. Ilunga');
  });
});
