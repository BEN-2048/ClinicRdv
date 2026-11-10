ALTER TABLE doctors
  ADD COLUMN IF NOT EXISTS professional_phone VARCHAR(30);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'doctors_professional_phone_check') THEN
    ALTER TABLE doctors
      ADD CONSTRAINT doctors_professional_phone_check
      CHECK (professional_phone IS NULL OR professional_phone ~ '^\+?[0-9 ]{6,20}$');
  END IF;
END $$;
