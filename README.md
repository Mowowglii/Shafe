# Shafe — Transfert de fichiers P2P décentralisé

Une application web de transfert de fichiers **privé et décentralisé**, sans serveur centralisé. 
Shafe explore une architecture distribuée basée sur WebRTC pour établir des connexions pair-à-pair sécurisées.

⚠️ **État : En développement actif** — Backend en consolidation

---

## 📊 État du projet

- ✅ **Backend (SpringBoot)** : WebSocket configuré, gestion des salles de signalement en consolidation
- ⏳ **Communication P2P** : TypeScript + WebRTC (RTCPeerConnection) — à intégrer après stabilisation du backend
- ⏳ **Frontend** : À explorer après stabilisation du backend
- ⏳ **Tests** : À mettre en place

**Prochaine étape immédiate :** Finaliser la consolidation du backend (WebSocket + salles de signalement)

---

## 🏗️ Architecture

Shafe fonctionne en deux phases :

1. **Création de salle & Signaling (REST API + WebSocket)**
   - Le client crée une salle via une requête REST API (gérée par le service de gestion de salle)
   - Le client se connecte au serveur SpringBoot via WebSocket
   - Les clients effectuent le signaling via TypeScript — le serveur redirige les messages (SDP, ICE candidates)

2. **Transfert P2P (WebRTC)**
   - Une fois la connexion P2P établie, les clients peuvent s'envoyer des fichiers directement
   - Le serveur n'intervient plus — communication décentralisée et privée

**Résultat :** Transfert de fichiers privé, sans dépendre d'un stockage centralisé

---

## 🛠️ Stack technique

| Composant | Technologie |
|-----------|-------------|
| **Backend** | Java 25, SpringBoot 4.0.6, Gradle |
| **Serveur temps réel** | WebSocket (SpringBoot) |
| **Communication P2P** | WebRTC en TypeScript (RTCPeerConnection) |
| **Build** | Makefile, tsconfig.json |

---

## 🚀 Installation & Setup

### Prérequis
- Java 25
- Gradle
- Node.js & npm

### Lancer le projet

1. **Compiler le TypeScript**
   ```bash
   make
Lancer le serveur SpringBoot
gradle bootRun
Le serveur démarre sur [http://localhost:8080](http://localhost:8080`)

Architecture des dossiers
shafe/

├── [dossiers backend SpringBoot]

├── webapp/          # Code TypeScript (signaling P2P)

├── ressources/      # Assets transpilés (destination tsconfig.json)

└── Makefile         # Orchestration de la compilation

---

## 📋 Roadmap

- [ ] **Finaliser le backend** — Consolidation WebSocket + salles de signalement (en cours)
- [ ] **Intégrer WebRTC** — Implémenter RTCPeerConnection pour la communication P2P
- [ ] **Tester le transfert de fichiers** — Valider la transmission P2P de bout en bout
- [ ] **Frontend** — Interface utilisateur pour créer/rejoindre des salles
- [ ] **Tests unitaires** — Couvrir les services critiques
- [ ] **Optimisations** — Améliorer les performances et la stabilité

---

## 🎓 Apprentissages

Ce projet est une opportunité d'explorer des technologies modernes et des concepts clés :

- **WebRTC** : Comprendre le signaling, les connexions P2P, et la gestion des ICE candidates
- **SpringBoot & WebSocket** : Gérer les connexions en temps réel et orchestrer le signaling
- **TypeScript** : Monter en compétence sur un langage typé pour la communication P2P
- **Architecture distribuée** : Concevoir une application sans dépendre d'un serveur centralisé
