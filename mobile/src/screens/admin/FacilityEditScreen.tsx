import React, { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { errorMessage } from '../../api/client';
import {
  FACILITY_TYPE_LABEL,
  FacilitiesApi,
  FacilityInput,
  FacilityStatus,
  FacilityTimeZone,
  FacilityType,
  ManagedFacility,
  StaffApi,
} from '../../api/services';
import {
  Button,
  Card,
  Chip,
  ErrorState,
  Input,
  ListItem,
  Loader,
  Notice,
  Screen,
  SectionTitle,
  StatusBadge,
} from '../../components/ui';
import { color, space, type } from '../../theme';
import { FACILITY_STATUS_BADGE } from './FacilitiesManageScreen';

const TYPES = Object.keys(FACILITY_TYPE_LABEL) as FacilityType[];
const TIMEZONES: { key: FacilityTimeZone; label: string }[] = [
  { key: 'Africa/Kinshasa', label: 'Kinshasa (UTC+1)' },
  { key: 'Africa/Lubumbashi', label: 'Lubumbashi (UTC+2)' },
];
const STATUSES: FacilityStatus[] = ['pending', 'active', 'suspended'];

type Form = {
  name: string;
  type: FacilityType;
  timezone: FacilityTimeZone;
  status: FacilityStatus;
  city: string;
  province: string;
  address: string;
  phone: string;
  emergencyPhone: string;
  email: string;
  latitude: string;
  longitude: string;
};

const emptyForm: Form = {
  name: '',
  type: 'clinic',
  timezone: 'Africa/Lubumbashi',
  status: 'pending',
  city: '',
  province: '',
  address: '',
  phone: '',
  emergencyPhone: '',
  email: '',
  latitude: '',
  longitude: '',
};

const toForm = (f: ManagedFacility): Form => ({
  name: f.name,
  type: f.type,
  timezone: f.timezone,
  status: f.status,
  city: f.city ?? '',
  province: f.province ?? '',
  address: f.address ?? '',
  phone: f.phone ?? '',
  emergencyPhone: f.emergency_phone ?? '',
  email: f.email ?? '',
  latitude: f.latitude ?? '',
  longitude: f.longitude ?? '',
});

const orNull = (v: string) => (v.trim() ? v.trim() : null);

export default function FacilityEditScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const initialId = route.params?.facilityId ? Number(route.params.facilityId) : null;

  const [facilityId, setFacilityId] = useState<number | null>(initialId);
  const [facility, setFacility] = useState<ManagedFacility | null>(null);
  const [platformAdmin, setPlatformAdmin] = useState(false);
  const [form, setForm] = useState<Form>(emptyForm);
  const [catalog, setCatalog] = useState<{ code: string; name: string }[]>([]);
  const [services, setServices] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [memberEmail, setMemberEmail] = useState('');
  const [memberRole, setMemberRole] = useState<'secretary' | 'facility_admin'>('secretary');
  const [memberFirstName, setMemberFirstName] = useState('');
  const [memberLastName, setMemberLastName] = useState('');
  const [memberPassword, setMemberPassword] = useState('');

  const apply = (f: ManagedFacility) => {
    setFacility(f);
    setForm(toForm(f));
    setServices(Object.fromEntries(f.services.map((sv) => [sv.code, sv.available24h])));
  };

  const load = useCallback(async () => {
    setError(null);
    try {
      const [scope, meta] = await Promise.all([StaffApi.scope(), FacilitiesApi.meta()]);
      setPlatformAdmin(scope.data.platformAdmin);
      setCatalog(meta.data.services);
      if (facilityId) apply((await StaffApi.facility(facilityId)).data);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [facilityId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    navigation.setOptions({ title: facility ? facility.name : 'Nouvel établissement' });
  }, [facility, navigation]);

  const canEdit = facilityId ? !!facility?.can_manage : platformAdmin;
  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));

  const buildPayload = (): FacilityInput | null => {
    if (form.name.trim().length < 2) {
      Alert.alert('Nom requis', 'Indiquez le nom de l’établissement.');
      return null;
    }
    const lat = form.latitude.trim() ? Number(form.latitude.replace(',', '.')) : null;
    const lng = form.longitude.trim() ? Number(form.longitude.replace(',', '.')) : null;
    if ((lat === null) !== (lng === null) || (lat !== null && (Number.isNaN(lat) || Number.isNaN(lng)))) {
      Alert.alert('Coordonnées invalides', 'Renseignez la latitude et la longitude, ou laissez les deux vides.');
      return null;
    }
    const payload: FacilityInput = {
      name: form.name.trim(),
      type: form.type,
      timezone: form.timezone,
      city: orNull(form.city),
      province: orNull(form.province),
      address: orNull(form.address),
      phone: orNull(form.phone),
      emergencyPhone: orNull(form.emergencyPhone),
      email: orNull(form.email),
      latitude: lat,
      longitude: lng,
    };
    if (platformAdmin) payload.status = form.status;
    return payload;
  };

  const save = async () => {
    const payload = buildPayload();
    if (!payload) return;
    setSaving(true);
    try {
      let saved: ManagedFacility;
      if (facilityId) {
        const { timezone, status, ...rest } = payload;
        saved = (await StaffApi.updateFacility(facilityId, platformAdmin ? payload : rest)).data;
      } else {
        saved = (await StaffApi.createFacility(payload)).data;
        setFacilityId(saved.id);
      }
      saved = (await StaffApi.setFacilityServices(
        saved.id,
        Object.entries(services).map(([code, available24h]) => ({ code, available24h }))
      )).data;
      apply(saved);
      Alert.alert('Enregistré', `${saved.name} a été mis à jour.`);
    } catch (e) {
      Alert.alert('Enregistrement impossible', errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const outageOf = (code: string) => facility?.services.find((sv) => sv.code === code)?.unavailableUntil ?? null;

  const setOutage = async (code: string, days: number | null) => {
    if (!facility) return;
    try {
      const until = days ? new Date(Date.now() + days * 86400000).toISOString() : null;
      const saved = (await StaffApi.setFacilityServices(
        facility.id,
        Object.entries(services).map(([c, available24h]) => (c === code ? { code: c, available24h, unavailableUntil: until } : { code: c, available24h }))
      )).data;
      apply(saved);
    } catch (e) {
      Alert.alert('Modification impossible', errorMessage(e));
    }
  };

  const editOutage = (code: string, name: string) => {
    const until = outageOf(code);
    if (until) {
      Alert.alert(name, `Indisponible jusqu’au ${new Date(until).toLocaleString('fr-FR')}.`, [
        { text: 'Retour', style: 'cancel' },
        { text: 'Remettre en service', onPress: () => setOutage(code, null) },
      ]);
      return;
    }
    Alert.alert(name, 'Déclarer ce service temporairement indisponible ? Il ne sera plus proposé dans la recherche jusqu’à la date choisie.', [
      { text: 'Retour', style: 'cancel' },
      { text: '24 heures', onPress: () => setOutage(code, 1) },
      { text: '7 jours', onPress: () => setOutage(code, 7) },
    ]);
  };

  const toggleService = (code: string) =>
    setServices((cur) => {
      const next = { ...cur };
      if (code in next) delete next[code];
      else next[code] = false;
      return next;
    });

  const addMember = async () => {
    if (!facilityId || !memberEmail.trim()) return;
    setSaving(true);
    try {
      apply((await StaffApi.addFacilityMember(facilityId, {
        email: memberEmail.trim(),
        role: memberRole,
        firstName: memberFirstName.trim() || undefined,
        lastName: memberLastName.trim() || undefined,
        password: memberPassword || undefined,
      })).data);
      setMemberEmail('');
      setMemberFirstName('');
      setMemberLastName('');
      setMemberPassword('');
    } catch (e) {
      Alert.alert('Ajout impossible', errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const revokeMember = (memberId: number, name: string) =>
    Alert.alert('Retirer l’accès', `${name} n’aura plus accès aux données de cet établissement.`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Retirer',
        style: 'destructive',
        onPress: async () => {
          try {
            apply((await StaffApi.revokeFacilityMember(facilityId as number, memberId)).data);
          } catch (e) {
            Alert.alert('Action impossible', errorMessage(e));
          }
        },
      },
    ]);

  const toggleDoctor = async (doctorId: number, active: boolean) => {
    try {
      const { data } = await StaffApi.updateAffiliation(facilityId as number, doctorId, {
        status: active ? 'inactive' : 'active',
      });
      apply(data);
      if (active && data.upcoming_appointments > 0) {
        Alert.alert(
          'Rendez-vous à traiter',
          `${data.upcoming_appointments} rendez-vous à venir restent prévus avec ce médecin dans cet établissement. Contactez les patients pour les reporter ou les annuler.`
        );
      }
    } catch (e) {
      Alert.alert('Action impossible', errorMessage(e));
    }
  };

  if (loading) return <Loader fullscreen label="Chargement..." />;
  if (error) return <Screen><ErrorState message={error} onRetry={load} /></Screen>;

  return (
    <Screen
      footer={canEdit ? <Button title="Enregistrer" icon="save-outline" loading={saving} onPress={save} /> : undefined}
    >
      {facility ? (
        <View style={s.row}>
          <Text style={s.muted}>{facility.code}</Text>
          <StatusBadge {...FACILITY_STATUS_BADGE[facility.status]} />
        </View>
      ) : null}

      {!canEdit ? (
        <Notice icon="eye-outline" title="Consultation seule" message="Seuls les administrateurs de cet établissement peuvent modifier ces informations." />
      ) : null}

      <Card style={s.section}>
        <Input label="Nom *" value={form.name} onChangeText={(v) => set('name', v)} editable={canEdit} maxLength={150} />
        <Text style={s.label}>Type</Text>
        <View style={s.chips}>
          {TYPES.map((t) => (
            <Chip key={t} label={FACILITY_TYPE_LABEL[t]} selected={form.type === t} onPress={canEdit ? () => set('type', t) : undefined} />
          ))}
        </View>
        <Input label="Ville" value={form.city} onChangeText={(v) => set('city', v)} editable={canEdit} />
        <Input label="Province" value={form.province} onChangeText={(v) => set('province', v)} editable={canEdit} />
        <Input label="Adresse" value={form.address} onChangeText={(v) => set('address', v)} editable={canEdit} />
        <Input label="Téléphone" value={form.phone} onChangeText={(v) => set('phone', v)} keyboardType="phone-pad" editable={canEdit} />
        <Input label="Téléphone des urgences" value={form.emergencyPhone} onChangeText={(v) => set('emergencyPhone', v)} keyboardType="phone-pad" editable={canEdit} />
        <Input label="E-mail" value={form.email} onChangeText={(v) => set('email', v)} keyboardType="email-address" autoCapitalize="none" editable={canEdit} />
        <View style={s.actions}>
          <Input label="Latitude" value={form.latitude} onChangeText={(v) => set('latitude', v)} keyboardType="numbers-and-punctuation" editable={canEdit} containerStyle={s.flex} />
          <Input label="Longitude" value={form.longitude} onChangeText={(v) => set('longitude', v)} keyboardType="numbers-and-punctuation" editable={canEdit} containerStyle={s.flex} />
        </View>

        {platformAdmin ? (
          <>
            <Text style={s.label}>Fuseau horaire</Text>
            <View style={s.chips}>
              {TIMEZONES.map((t) => (
                <Chip key={t.key} label={t.label} selected={form.timezone === t.key} onPress={() => set('timezone', t.key)} />
              ))}
            </View>
            <Text style={s.label}>Statut</Text>
            <View style={s.chips}>
              {STATUSES.map((st) => (
                <Chip key={st} label={FACILITY_STATUS_BADGE[st].label} selected={form.status === st} onPress={() => set('status', st)} />
              ))}
            </View>
          </>
        ) : null}
      </Card>

      <SectionTitle title="Services proposés" />
      <View style={s.chips}>
        {catalog.map((sv) => (
          <Chip key={sv.code} label={sv.name} selected={sv.code in services} onPress={canEdit ? () => toggleService(sv.code) : undefined} />
        ))}
      </View>
      {'emergency' in services ? (
        <Chip
          icon="time-outline"
          label="Urgences ouvertes 24h/24"
          selected={!!services.emergency}
          onPress={canEdit ? () => setServices((cur) => ({ ...cur, emergency: !cur.emergency })) : undefined}
        />
      ) : null}

      {facility && canEdit && facility.services.length ? (
        <>
          <SectionTitle title="Indisponibilités temporaires" />
          <Text style={s.muted}>Touchez un service pour le déclarer indisponible (panne, rupture, absence) ou le remettre en service.</Text>
          <View style={s.chips}>
            {facility.services.map((sv) => {
              const name = catalog.find((c) => c.code === sv.code)?.name ?? sv.code;
              return (
                <Chip
                  key={sv.code}
                  icon={sv.unavailableUntil ? 'warning-outline' : 'checkmark-circle-outline'}
                  label={sv.unavailableUntil ? `${name} · indisponible` : name}
                  selected={!!sv.unavailableUntil}
                  onPress={() => editOutage(sv.code, name)}
                />
              );
            })}
          </View>
        </>
      ) : null}

      {facility ? (
        <>
          <SectionTitle title={`Médecins rattachés (${facility.doctors.filter((d) => d.status === 'active').length})`} />
          <Card style={s.list}>
            {facility.doctors.length === 0 ? (
              <Text style={s.muted}>Aucun médecin. Créez-en un depuis l’onglet Médecins.</Text>
            ) : (
              facility.doctors.map((d, i) => (
                <ListItem
                  key={d.doctor_id}
                  title={`Dr. ${d.first_name} ${d.last_name}`}
                  subtitle={`${d.specialty} · ${d.status === 'active' ? 'Actif' : 'Inactif'}`}
                  right={canEdit ? (
                    <Button
                      title={d.status === 'active' ? 'Désactiver' : 'Réactiver'}
                      size="sm"
                      variant="secondary"
                      fullWidth={false}
                      onPress={() => toggleDoctor(d.doctor_id, d.status === 'active')}
                    />
                  ) : undefined}
                  style={i > 0 ? s.divider : undefined}
                />
              ))
            )}
          </Card>

          <SectionTitle title="Personnel" />
          <Card style={s.list}>
            {facility.members.filter((m) => m.status === 'active').map((m, i) => (
              <ListItem
                key={m.id}
                title={`${m.first_name} ${m.last_name}`}
                subtitle={`${m.role === 'facility_admin' ? 'Administrateur' : 'Secrétaire'} · ${m.email}`}
                right={canEdit && (platformAdmin || m.role === 'secretary') ? (
                  <Button
                    title="Retirer"
                    size="sm"
                    variant="danger"
                    fullWidth={false}
                    onPress={() => revokeMember(m.id, `${m.first_name} ${m.last_name}`)}
                  />
                ) : undefined}
                style={i > 0 ? s.divider : undefined}
              />
            ))}
          </Card>

          {canEdit ? (
            <Card style={s.section}>
              <Text style={type.h3}>Ajouter un membre du personnel</Text>
              <Input label="E-mail *" value={memberEmail} onChangeText={setMemberEmail} keyboardType="email-address" autoCapitalize="none" />
              {platformAdmin ? (
                <View style={s.chips}>
                  <Chip label="Secrétaire" selected={memberRole === 'secretary'} onPress={() => setMemberRole('secretary')} />
                  <Chip label="Administrateur" selected={memberRole === 'facility_admin'} onPress={() => setMemberRole('facility_admin')} />
                </View>
              ) : null}
              <Text style={s.muted}>Si le compte n’existe pas encore, renseignez aussi :</Text>
              <Input label="Prénom" value={memberFirstName} onChangeText={setMemberFirstName} />
              <Input label="Nom" value={memberLastName} onChangeText={setMemberLastName} />
              <Input label="Mot de passe provisoire" value={memberPassword} onChangeText={setMemberPassword} secureTextEntry />
              <Button title="Ajouter" icon="person-add-outline" variant="secondary" loading={saving} disabled={!memberEmail.trim()} onPress={addMember} />
            </Card>
          ) : null}
        </>
      ) : (
        <Notice icon="information-circle-outline" message="Enregistrez d’abord l’établissement pour ajouter son personnel et ses médecins." />
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  section: { gap: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { ...type.label, color: color.textSecondary },
  muted: { ...type.caption, color: color.textMuted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  actions: { flexDirection: 'row', gap: space.sm },
  list: { paddingVertical: 0 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.border },
});
