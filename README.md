# Shafe - Transfert de fichiers P2P décentralisé

Une application web de transfert de fichiers privé et décentralisé, sans stockage intermédiaire. Shafe repose sur une architecture distribuée s'appuyant sur WebRTC pour établir des connexions pair-à-pair directes et sécurisées, orchestrées par un serveur de signalement Spring Boot.

Etat : En développement actif - Structuration du client et consolidation du backend.

---

## Etat du projet

* Backend (Spring Boot) : WebSocket configuré, API REST de gestion des salles, tests d'intégration et unitaires en place.
* Client (TypeScript & WebRTC) : Module de signalement, gestion des RTCPeerConnection et du RTCDataChannel en cours de finalisation.
* Frontend / UI : Interface utilisateur basique en intégration dans le client.
* Transfert P2P : Validation de la transmission de fichiers de bout en bout.

---

## Architecture

Shafe fonctionne en deux phases distinctes :

1. Création de salle & Signalement (REST API + WebSocket)
   * Le client crée ou rejoint une salle via l'API REST du serveur Spring Boot.
   * La connexion WebSocket est établie pour échanger les métadonnées du signaling (offres, réponses SDP, candidats ICE).
2. Transfert P2P (WebRTC DataChannel)
   * Une fois le signaling terminé, la connexion P2P est établie directement entre les deux navigateurs.
   * Les données et fichiers transitent sans repasser par le serveur.

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
│   ├── src/
│   │   ├── signaling/           # Gestion des WebSocket et reconnexion au serveur
│   │   ├── types/               # Typage TypeScript (interfaces des messages P2P)
│   │   ├── ui/                  # Manipulation du DOM et liaisons UI
│   │   ├── utils/               # Helpers (parsing, utilitaires)
│   │   └── webrtc/              # Service de transfert P2P & gestion du RTCDataChannel
│   ├── .env                     # Endpoints HTTP REST et WS
│   ├── Makefile                 # Orchestration de la compilation TypeScript
│   └── tsconfig.json
│
└── server/                      # Module Back-end Spring Boot
    ├── src/
    │   ├── main/java/...        # Salles de signalement, WebSocket, API REST
    │   └── test/java/...        # Tests d'intégration (WebSocket) et contrôleurs
    └── build.gradle.kts         # Configuration et dépendances Gradle

```

---

## Stack technique

| Composant | Technologie / Outils |
| --- | --- |
| Backend | Java, Spring Boot, Gradle (Kotlin DSL) |
| Signalement | WebSocket (Spring WebSocket / Messaging) |
| Client / P2P | TypeScript, WebRTC (RTCPeerConnection, RTCDataChannel) |
| Build & Tooling | Makefile (Client), Gradle Wrapper (Server) |

---

## Installation & Lancement

### Prérequis

* Java
* Node.js & npm
* Make

### 1. Démarrer le serveur (Spring Boot)

```bash
cd server
./gradlew bootRun

```

> Le serveur de signalement démarrera sur http://localhost:8080.

### 2. Compiler le client

```bash
cd client
make

```

> Les fichiers transpilés et l'application Web seront générés dans le dossier client/dist/.

---

## Roadmap

* Architecture Mono-dépôt : Séparation propre des responsabilités (client/ et server/).
* Backend Signalement : Consolidation WebSocket, gestion des salles et suite de tests.
* Module WebRTC Client : Finalisation du RTCDataChannel et de la reconnexion automatique.
* Transfert de fichiers P2P : Gestion des streams binaires (ArrayBuffer) et reconstitution côté récepteur.
* UI/UX : Finalisation du tableau de bord d'envoi/réception et indicateur de progression.

---

## Apprentissages clés

* WebRTC & Network State : Gestion du cycle de vie des connexions P2P, NAT traversal (STUN/TURN) et négociations SDP.
* Spring Boot & Concurrence : Orchestration en temps réel de salles de signalement éphémères et gestion synchrone/asynchrone des sessions WebSocket.
* Architecture Software Craftsmanship : Isolation stricte du client P2P et du serveur de signalement, couverture par tests d'intégration.