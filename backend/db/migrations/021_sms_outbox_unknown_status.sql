ALTER TABLE sms_outbox
  DROP CONSTRAINT IF EXISTS sms_outbox_status_check;

ALTER TABLE sms_outbox
  ADD CONSTRAINT sms_outbox_status_check
  CHECK (status IN ('sent', 'failed', 'unknown'));

ALTER TABLE appointment_reminders
  DROP CONSTRAINT IF EXISTS appointment_reminders_sms_check;

ALTER TABLE appointment_reminders
  ADD CONSTRAINT appointment_reminders_sms_check
  CHECK (sms_status IN ('none', 'sent', 'failed', 'unknown'));
