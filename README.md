# Shafe - Transfert de fichiers P2P décentralisé

Une application web de transfert de fichiers privé et décentralisé, sans stockage intermédiaire. Shafe repose sur une architecture distribuée s'appuyant sur WebRTC pour établir des connexions pair-à-pair directes et sécurisées, orchestrées par un serveur de signalement Spring Boot.

État : Fonctionnel en local et validé par des scénarios de transfert P2P, avec un client complet et un backend stable pour la gestion des salles et du signaling.

---

## Etat du projet

* Backend (Spring Boot) : API REST de création de salle, WebSocket de signalement, gestion de la durée de vie des salles et promotion du survivant ; tests d'intégration et unitaires en place.
* Client (TypeScript & WebRTC) : Gestion complète du cycle de vie de la connexion, négociation SDP, ICE, RTCDataChannel, partages de fichiers, téléchargement local et journal de connexion.
* Frontend / UI : Interface utilisateur complète avec écran d'accueil, vue de transfert, bouton de copie de l'id de salle, journal d'événements et affichage des transferts.
* Transfert P2P : Fonctionnel, avec envoi de fichiers multiples, progression, annulation, rétablissement de connexion et réception d'un fichier téléchargeable directement dans le navigateur.

---

## Architecture

Shafe fonctionne en deux phases distinctes :

1. Création de salle & Signalement (REST API + WebSocket)
   * Un client crée une salle via l'API REST du serveur Spring Boot, récupère l'id de la salle et rejoint la salle en se connectant au WebSocket du serveur avec ce paramètre.
   * Un second client peut rejoindre la même salle en envoyant l'id à travers le serveur de signalement.
   * La connexion WebSocket sert à échanger les messages de signalement (offre SDP, réponse, candidats ICE, messages de présence et de départ).
   * Le serveur attribue les rôles et gère la vie des salles, y compris les cas d'expiration et de promotion du peer restant.
2. Transfert P2P (WebRTC DataChannel)
   * Une fois le signaling terminé, la connexion P2P est établie directement entre les navigateur.
   * Les fichiers sont répartis en paquets, envoyés sur le RTCDataChannel et reconstitués côté réception.
   * Le transfert reste hors ligne du serveur : aucune donnée n'est stockée intermédiaire dans un backend de fichiers.

```
      +-----------------------------------------+
      |         Serveur Spring Boot             |
      |    (REST API + WebSocket Signaling)     |
      +-----------------------------------------+
          /                                   \
    1. Signaling                         1. Signaling
        /                                        \
 +---------------+     2. Transfert Direct     +---------------+
 | Client A (P2P)| <-------------------------> | Client B (P2P)|
 +---------------+     (WebRTC DataChannel)    +---------------+

```

---

## Structure du projet

Le dépôt est découpé en deux modules distincts :

```text
shafe/
├── client/                      # Module Front-end / P2P TypeScript
│   ├── dist/                    # Destination de transpilation et index.html
│   ├── e2e/                    # Tests end-to-end Playwright du flux complet
│   ├── src/
│   │   ├── signaling/           # Gestion des WebSocket, messages de signalement et connexion
│   │   ├── types/               # Typage TypeScript (interfaces des messages P2P et transferts)
│   │   ├── ui/                  # Manipulation du DOM, animations et interface
│   │   ├── utils/               # Helpers (parsing, formatage, utilitaires)
│   │   ├── webrtc/             # Services WebRTC et gestion du RTCDataChannel
│   │   ├── workers/             # Worker dédié au découpage et assemblage des fichiers
│   │   └── index.ts             # Point d'entrée de l'application
│   ├── .env                     # Endpoints HTTP REST et WS
│   ├── index.html               # Shell principal de l'application
│   ├── Makefile                 # Orchestration de la compilation TypeScript
│   ├── package.json             # Dépendances et scripts Vite/Vitest/Playwright
│   └── tsconfig.json
│
└── server/                      # Module Back-end Spring Boot
    ├── src/
    │   ├── main/java/...        # Salles de signalement, WebSocket, API REST, gestion du cycle de vie
    │   └── test/java/...        # Tests d'intégration et unitaires du serveur
    └── build.gradle.kts         # Configuration et dépendances Gradle

```

---

## Stack technique

| Composant | Technologie / Outils |
| --- | --- |
| Backend | Java, Spring Boot 4, Gradle (Kotlin DSL) |
| Signalement | WebSocket (Spring WebSocket / Messaging) |
| Client / P2P | TypeScript, Vite, WebRTC (RTCPeerConnection, RTCDataChannel) |
| Transfert de fichiers | Chunking / reconstitution via worker navigateur, téléchargement direct du blob reçu |
| Validation | Vitest, Playwright, tests d'intégration Spring |
| Build & Tooling | Makefile (Client), Gradle Wrapper (Server) |

---

## Installation & Lancement

### Prérequis

* Java JDK 25 (selon la configuration Gradle du backend)
* Node.js & npm
* Make (recommandé pour le client)

### 1. Démarrer le serveur (Spring Boot)

```bash
cd server
./gradlew bootRun
```

> Le serveur de signalement démarre sur http://localhost:8080.

### 2. Installer et lancer le client

```bash
cd client
npm install
npm run dev
```

> Le frontend est servi par Vite, généralement sur http://127.0.0.1:5173.

### 3. Version buildée

```bash
cd client
npm run build
```

> Le bundle de production est généré dans le dossier client/dist/ et prêt à être servi.

---

## Roadmap

* Sécurisation et robustesse avancée : validation d'entrée, gestion d'erreurs plus explicite et nettoyage du cycle de vie des sessions.
* Expérience de transfert : optimisation de la gestion des gros fichiers, meilleure ergonomie sur les erreurs et reprise automatique dans des cas de faiblesse réseau.
* Observabilité : journal de connexion plus riche, diagnostics côté client et côté serveur, suivi des expirations de salle.
* Évolutions produit : historique de transferts, prévisualisation de fichiers, gestion des permissions et support multi-pair.

---

## Apprentissages clés

* WebRTC & Network State : établissement de connexions P2P, négociation SDP/ICE, gestion des états de connexion et promotion d'un peer survivant.
* Spring Boot & Concurrence : orchestration de salles de signalement éphémères, sessions WebSocket et propagation des messages à l'ensemble des participants.
* Intégration front/back : synchronisation du statut de connexion, gestion des expirations, flux de création de salle et robustesse des transferts côté navigateur.
* Software Craftsmanship : séparation claire des responsabilités entre serveur de signalement et client P2P, couverture par tests d'intégration et de bout en bout.
