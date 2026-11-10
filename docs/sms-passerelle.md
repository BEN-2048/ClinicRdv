# Envoi des SMS (codes de vérification)

ClinicRDV envoie les codes de vérification par SMS au moyen d'un **pilote** choisi dans `backend/.env` (`SMS_DRIVER`). Toutes les options sont gratuites.

## Développement : `SMS_DRIVER=console` (par défaut)

Aucun SMS n'est envoyé. Le code apparaît dans le terminal du serveur :

```
[SMS de développement] vers +24381•••78 : ClinicRDV: votre code est 123456 (valable 10 min). ...
```

Ce pilote est **refusé en production**.

## Démonstration avec de vrais SMS : `SMS_DRIVER=smsgate`

[SMSGate](https://sms-gate.app/) est une application Android gratuite et open source qui envoie des SMS depuis la carte SIM du téléphone.

1. **Utilisez une carte SIM dédiée.** Les codes envoyés restent visibles dans les messages envoyés de ce téléphone.
2. Installez SMSGate sur le téléphone Android, activez **Local Server**, puis appuyez sur **Start Service**. Notez l'adresse IP locale, le port (8080), l'identifiant et le mot de passe affichés.
3. Branchez l'ordinateur qui fait tourner le backend sur **le même Wi-Fi** que le téléphone.
4. Dans `backend/.env` :
   ```
   SMS_DRIVER=smsgate
   SMSGATE_URL=http://<ip-du-telephone>:8080
   SMSGATE_USERNAME=<identifiant affiché>
   SMSGATE_PASSWORD=<mot de passe affiché>
   ```
5. Redémarrez le backend.

## Limites et plafonds

- **5 SMS par numéro et par 24 h** (`SMS_PER_NUMBER_DAILY`), **200 SMS par jour** au total (`SMS_DAILY_CAP`).
- Seuls les numéros de RDC (+243) sont acceptés.
- Le téléphone passerelle doit rester allumé, avec l'application ouverte.
- Les SMS sont décomptés du forfait de la SIM. L'opérateur peut bloquer un envoi massif.
- Le journal `sms_outbox` enregistre chaque envoi (destinataire, statut), **jamais le code**.
