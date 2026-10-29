# Enquête de Marché — Commerces au Cameroun 🇨🇲

Interface web responsive pour la collecte des données d'étude de marché auprès des commerçants camerounais, avec synchronisation en temps réel vers Google Sheets et sauvegarde locale hors-ligne.

---

## 📁 Contenu du Projet

- **[`index.html`](file:///c:/Users/User/Documents/Antigravity/ENQUETTE%20MARCHE/index.html)** : Application web autonome complète (HTML5, CSS3, JavaScript ES6+ embarqué). Légère (< 45 Ko), ultra-rapide et responsive mobile-first.
- **[`Code.gs`](file:///c:/Users/User/Documents/Antigravity/ENQUETTE%20MARCHE/Code.gs)** : Script Google Apps Script prêt à coller dans votre classeur Google Sheets. Gère la création automatique de l'onglet, des 51 en-têtes (colonnes A à AY) et l'insertion ordonnée des réponses en POST.
- **[`INSTRUCTIONS_GOOGLE_SHEETS.md`](file:///c:/Users/User/Documents/Antigravity/ENQUETTE%20MARCHE/INSTRUCTIONS_GOOGLE_SHEETS.md)** : Guide détaillé pas-à-pas pour la configuration de Google Sheets, le déploiement Web App, le partage en lecture seule et le déploiement en ligne gratuit (Vercel, Netlify, GitHub Pages).

---

## ✨ Fonctionnalités Clés

1. **Parcours en 7 sections (A à G) :**
   - Affichage progressif d'une seule section à la fois.
   - Barre de progression dynamique en haut (`Section 1/7` à `7/7`).
   - Puces de navigation rapide (`A` à `G`) et boutons `Précédent` / `Suivant`.
2. **Respect strict des 46 questions :**
   - Coordonnées obligatoires en Section A (Nom, Prénom, Email avec vérification Regex, Ville).
   - Menus déroulants (Q2, Q26, Ville).
   - Questions à choix multiples avec limiteurs stricts :
     - **Q13 : maximum 3 choix** (compteur dynamique, blocage automatique à 3).
     - **Q23 : maximum 5 choix** (compteur dynamique, blocage automatique à 5).
   - Questions radio (Q1 à Q11, Q14 à Q19, Q22, Q27, Q28, Q30, Q33 à Q37, Q40 à Q44, Q46).
   - Textes libres et champs conditionnels "Autre : préciser" avec ouverture automatique.
3. **Double synchronisation & Sécurité des données :**
   - Envoi immédiat en **POST** vers l'API Google Apps Script (timeout 5s).
   - **Sauvegarde locale automatique (Draft & Historique)** dans le `localStorage` du navigateur.
   - **Bouton d'export CSV universel** (avec BOM UTF-8 pour Excel) pour récupérer les données à tout moment même en cas de coupure Internet sur le terrain.
4. **Ergonomie Mobile-First :**
   - Boutons larges et zones tactiles confortables (taille adaptée pour smartphones Android & iPhone).
   - Pas de spinner bloquant : bouton grisé avec message *"Envoi en cours..."*.

