import React, { useEffect, useMemo } from 'react';
import { useNavigation, useRoute } from '@react-navigation/native';
import { StaffApi } from '../../api/services';
import ScheduleEditor, { ScheduleApi } from '../common/ScheduleEditor';

export default function SecretaryDoctorScheduleScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const doctorId = Number(route.params?.doctorId);
  const name: string = route.params?.name ?? 'Médecin';

  useEffect(() => {
    navigation.setOptions({ title: `Horaires · ${name}` });
  }, [navigation, name]);

  const api = useMemo<ScheduleApi>(
    () => ({
      workingHours: () => StaffApi.workingHours(doctorId),
      setWorkingHours: (hours, minutes) => StaffApi.setWorkingHours(doctorId, hours, minutes),
      leaves: () => StaffApi.leaves(doctorId),
      addLeave: (start, end, reason) => StaffApi.addLeave(doctorId, start, end, reason),
      deleteLeave: (leaveId) => StaffApi.deleteLeave(doctorId, leaveId),
      conflicts: () => StaffApi.conflicts(doctorId),
      cancelConflicts: (ids, note) => StaffApi.cancelConflicts(doctorId, ids, note),
    }),
    [doctorId]
  );

  return <ScheduleEditor api={api} />;
}
