const app = require('./app');
const { port, remindersEnabled, reminderIntervalMinutes } = require('./config/env');
const reminders = require('./services/reminders.service');

app.listen(port, () => console.log(`API ClinicRDV sur http://localhost:${port}`));

if (remindersEnabled) reminders.start({ intervalMinutes: reminderIntervalMinutes });
