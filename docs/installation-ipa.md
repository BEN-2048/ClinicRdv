# Installation de l'application iOS (IPA)

Ce guide installe ClinicRDV sur un iPhone depuis un PC Windows, **sans Mac et sans compte Apple Developer payant**.

L'IPA est compilé sans signature sur un runner macOS de GitHub Actions. Il est ensuite signé et installé avec **Sideloadly** et un Apple ID gratuit.

## Prérequis

| Élément | Remarque |
|---------|----------|
| PC Windows 64 bits | |
| iPhone et câble USB **de données** | Beaucoup de câbles ne font que charger |
| Apple ID gratuit | Celui de l'iPhone convient |
| [iTunes 64 bits](https://www.apple.com/itunes/download/win64) | Version du site Apple, **pas** celle du Microsoft Store |
| [iCloud](https://support.apple.com/fr-fr/103232) | Version du site Apple, **pas** celle du Microsoft Store. Inutile de s'y connecter |
| [Sideloadly](https://sideloadly.io) | L'installateur n'est pas signé : à l'avertissement de Windows, choisir **Informations complémentaires → Exécuter quand même** |
| Accès au dépôt GitHub | Le workflow tourne sur GitHub, pas sur GitLab |

Installer dans cet ordre : iTunes, iCloud, **redémarrer le PC**, puis Sideloadly.

## 1. Compiler l'IPA

1. Pousser le code sur GitHub :
   ```powershell
   git push github main
   ```
2. Trouver l'adresse IP du PC sur le réseau qui servira pendant l'utilisation, avec `ipconfig` :
   - Wi-Fi : adresse de la carte Wi-Fi, par exemple `192.168.1.x` ;
   - partage de connexion de l'iPhone : en général `172.20.10.x`.
3. Sur GitHub, ouvrir **Actions → iOS IPA → Run workflow** et saisir l'URL de l'API : `http://<IP du PC>:4000/api`.
4. Attendre la fin du build (20 à 30 min).
5. En bas de la page du build, télécharger l'artefact **ClinicRDV-ipa**, puis le décompresser pour obtenir `ClinicRDV.ipa`.

> L'URL de l'API est **figée dans l'IPA**. Si l'IP du PC change (autre Wi-Fi, partage de connexion), il faut relancer le workflow.

## 2. Installer l'IPA sur l'iPhone

1. Déverrouiller l'iPhone et le brancher au PC en USB.
2. Ouvrir iTunes. Sur l'iPhone, répondre **Se fier** à « Faire confiance à cet ordinateur ? », puis saisir le code.
3. Vérifier que l'icône de l'iPhone apparaît en haut à gauche d'iTunes, puis fermer iTunes.
4. Ouvrir Sideloadly et vérifier que l'iPhone apparaît dans la liste des appareils.
5. Glisser `ClinicRDV.ipa` dans Sideloadly, saisir son Apple ID, puis cliquer sur **Start**.
   - Si l'identifiant `com.clinicrdv.app` est refusé, dans *Advanced options*, cocher la modification automatique du *bundle ID*.
6. Attendre le message **Done**.

## 3. Autoriser l'application sur l'iPhone

1. **Faire confiance au développeur** : **Réglages → Général → VPN et gestion de l'appareil**, toucher son Apple ID, puis **Faire confiance**. L'iPhone doit être connecté à Internet.
2. **Activer le Mode développeur** : **Réglages → Confidentialité et sécurité → Mode développeur** (tout en bas). Activer, puis **Redémarrer**. Après le redémarrage, confirmer **Activer** et saisir le code.
3. Ouvrir ClinicRDV et accepter l'autorisation **Réseau local**.

## 4. Lancer le backend et tester

1. Sur le PC :
   ```powershell
   cd backend
   npm start
   ```
2. Connecter l'iPhone au **même réseau** que le PC.
3. Dans Safari sur l'iPhone, ouvrir `http://<IP du PC>:4000/health` : la page doit répondre.
4. Ouvrir ClinicRDV et se connecter avec un compte de test (voir le `README.md`).

## Renouvellement

Avec un Apple ID gratuit, l'application **expire au bout de 7 jours**. Pour la renouveler, refaire l'étape 2 avec le même IPA. Il n'est pas nécessaire de recompiler. Le faire la veille d'une démonstration.

Un Apple ID gratuit permet au maximum 3 applications installées de cette façon par appareil.

## Dépannage

| Problème | Solution |
|----------|----------|
| L'iPhone n'apparaît pas dans Sideloadly | Déverrouiller l'iPhone, changer de câble (câble de données), brancher directement sur le PC sans hub, ouvrir iTunes et accepter « Se fier ». Si l'iPhone ne propose plus de faire confiance : **Réglages → Général → Transférer ou réinitialiser → Réinitialiser → Réinitialiser localisation et confidentialité** |
| « Untrusted Developer » / « Développeur non approuvé » | Étape 3.1 : faire confiance à son Apple ID |
| « Developer Mode Required » / « Mode développeur requis » | Étape 3.2. Si l'option n'apparaît pas, rebrancher l'iPhone et ouvrir Sideloadly quelques secondes |
| L'application ne s'ouvre plus après quelques jours | Signature expirée (7 jours) : réinstaller avec Sideloadly |
| Erreur réseau dans l'application | Vérifier que le backend tourne, que l'iPhone est sur le même réseau et que `/health` répond dans Safari. Autoriser Node.js sur les **réseaux privés** dans le pare-feu Windows et régler le Wi-Fi en réseau privé. Vérifier que l'IP du PC n'a pas changé depuis le build |
| Autorisation « Réseau local » refusée | **Réglages → ClinicRDV → Réseau local** : activer |

## Limites du workflow GitHub

Sur un dépôt privé, les minutes macOS comptent 10 fois. Les quelque 200 minutes offertes par mois permettent 6 à 8 builds. Un dépôt public n'a pas cette limite.
