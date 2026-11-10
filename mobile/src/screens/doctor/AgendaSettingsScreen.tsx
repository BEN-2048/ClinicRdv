import React from 'react';
import { DoctorsApi } from '../../api/services';
import ScheduleEditor, { ScheduleApi } from '../common/ScheduleEditor';

const api: ScheduleApi = {
  workingHours: () => DoctorsApi.workingHours(),
  setWorkingHours: (hours, consultationMinutes) => DoctorsApi.updateWorkingHours({ hours, consultationMinutes }),
  leaves: () => DoctorsApi.leaves(),
  addLeave: (startDate, endDate, reason) => DoctorsApi.addLeave({ startDate, endDate, reason: reason || undefined }),
  deleteLeave: (leaveId) => DoctorsApi.deleteLeave(leaveId),
  conflicts: () => DoctorsApi.conflicts(),
  cancelConflicts: (ids, note) => DoctorsApi.cancelConflicts(ids, note),
};

export default function AgendaSettingsScreen() {
  return <ScheduleEditor api={api} />;
}
