# OpenFox — Description détaillée

## 1. Vue d'ensemble et objectifs fonctionnels

OpenFox est un assistant de codage agentique "Local-LLM-first" (v2.0.160). C'est un agent autonome conçu pour fonctionner avec des backends LLM locaux (vLLM, sglang, ollama, llamacpp) via une API compatible OpenAI.

Fonctionnalités clés :

- Workflows multi-tours avec planification et exécution
- Exécution contractuelle (critères d'acceptation)
- Workflows déclaratifs multi-étapes
- Vérification itérative
- Intégration LSP (Language Server Protocol)
- Support des plugins
- Interface web React + CLI
- Internationalisation EN/FR

## 2. Architecture interne

```
┌─────────────────────────────────────────────────────────────┐
│                        OpenFox                               │
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │ CLI      │  │ Serveur  │  │ UI Web   │  │ Plugins  │   │
│  │ (src/cli)│  │ (Express │  │ (React   │  │ (src/    │   │
│  │          │  │  + WS)   │  │  + Vite) │  │  plugin) │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                    Serveur (src/server/)              │   │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐        │   │
│  │  │ agents │ │ chat   │ │ config │ │ context│        │   │
│  │  └────────┘ └────────┘ └────────┘ └────────┘        │   │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐        │   │
│  │  │ db     │ │ git    │ │ llm    │ │ lsp    │        │   │
│  │  └────────┘ └────────┘ └────────┘ └────────┘        │   │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐        │   │
│  │  │ mcp    │ │ routes │ │ runner │ │ session│        │   │
│  │  └────────┘ └────────┘ └────────┘ └────────┘        │   │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐        │   │
│  │  │ skills │ │ tasks  │ │terminal│ │tools   │        │   │
│  │  └────────┘ └────────┘ └────────┘ └────────┘        │   │
│  │  ┌────────┐ ┌────────┐ ┌────────┐                  │   │
│  │  │workflows│ │ events │ │ queue  │                  │   │
│  │  └────────┘ └────────┘ └────────┘                  │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                    Shared (src/shared/)               │   │
│  │  Code partagé entre client et serveur                │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## 3. Flux principaux

### Flux 1 : Utilisateur envoie un message

```
1. web/src/App.tsx → composant Chat
2. openfox/src/server/routes/ → route POST /api/chat
3. openfox/src/server/llm/ → provider-manager sélectionne le provider
4. openfox/src/server/providers/ → provider LLM
5. Réponse → WebSocket → web/src/stores/ → UI
```

### Flux 2 : Agent exécute une tâche

```
1. openfox/src/server/runner/ → agent loop
2. openfox/src/server/tools/ → exécution des outils
3. openfox/src/server/llm/ → appel LLM
4. openfox/src/server/session/ → mise à jour de la session
5. openfox/src/server/events/ → événements → WebSocket → UI
```

### Flux 3 : Workflow déclaratif

```
1. openfox/src/server/workflows/ → moteur de workflows
2. openfox/src/server/agents/ → sous-agents
3. openfox/src/server/tasks/ → tâches
4. openfox/src/server/runner/ → exécution
```

### Flux 4 : Plugin LLM

```
1. openfox/src/server/llm/ → provider-manager
2. provider-manager → plugin (ex: openfox-cheaperinference)
3. plugin → transport HTTP → API du provider
4. Réponse → provider-manager → runner → UI
```

## 4. Modèle de données et API publique

### Entités principales (SQLite)

- **Session** : session de travail avec un agent
- **Message** : message dans une session
- **Project** : projet ouvert dans OpenFox
- **Task** : tâche dans le task board
- **Event** : événement (event sourcing)

### API HTTP (routes)

- `POST /api/chat` — envoyer un message
- `GET /api/sessions` — lister les sessions
- `GET /api/projects` — lister les projets
- `GET /api/tasks` — lister les tâches
- `GET /api/mcp/servers` — lister les serveurs MCP
- `GET /api/board` — récupérer le task board

### API WebSocket

- Streaming des messages agent
- Streaming des tool calls et résultats
- Mise à jour en temps réel des sessions

## 5. Modules rôle, fichiers clés, dépendances

| Module    | Rôle                           | Fichiers clés                                    |
| --------- | ------------------------------ | ------------------------------------------------ |
| CLI       | Interface en ligne de commande | `src/cli/index.ts`, `src/cli/main.ts`            |
| Serveur   | Backend Express + WebSocket    | `src/server/index.ts`, `src/server/routes/`      |
| UI Web    | Interface React                | `web/src/App.tsx`, `web/src/components/`         |
| Plugins   | Système de plugins             | `src/plugin/index.ts`                            |
| Providers | Providers LLM                  | `src/provider/index.ts`, `src/server/providers/` |
| Agents    | Sous-agents                    | `src/server/agents/`, `src/server/sub-agents/`   |
| Workflows | Moteur de workflows            | `src/server/workflows/`                          |
| Tasks     | Gestion des tâches             | `src/server/tasks/`                              |
| Terminal  | Terminal (node-pty + xterm)    | `src/server/terminal/`                           |
| Tools     | Outils de l'agent              | `src/server/tools/`                              |
| MCP       | Model Context Protocol         | `src/server/mcp/`                                |
| LSP       | Language Server Protocol       | `src/server/lsp/`                                |
| DB        | Base de données SQLite         | `src/server/db/`                                 |
| Git       | Intégration Git                | `src/server/git/`                                |
| Skills    | Système de skills              | `src/server/skills/`                             |
| Events    | Système d'événements           | `src/server/events/`                             |
| Queue     | File d'attente                 | `src/server/queue/`                              |
| Session   | Gestion des sessions           | `src/server/session/`                            |
| Context   | Gestion du contexte            | `src/server/context/`                            |
| Config    | Configuration                  | `src/server/config.ts`                           |
| Auth      | Authentification               | `src/server/auth.ts`                             |
| I18N      | Internationalisation           | `src/server/i18n.ts`                             |

## 6. Configuration variables d'environnement

| Variable             | Rôle               | Défaut                               |
| -------------------- | ------------------ | ------------------------------------ |
| `OPENFOX_DEV`        | Mode développement | `false`                              |
| `OPENFOX_PORT`       | Port du serveur    | `10369` (prod), `10370+` (dev)       |
| `OPENFOX_PASSWORD`   | Mot de passe       | `password`                           |
| `OPENFOX_CONFIG_DIR` | Dossier de config  | `~/.config/openfox/`                 |
| `OPENFOX_DB_PATH`    | Chemin de la DB    | `~/.local/share/openfox/sessions.db` |

## 7. Tests et déploiement

### Tests

- **Unitaires** : Vitest (`npx vitest run`)
- **E2E** : Playwright (`cd e2e-playwright && npx playwright test`)
- **Web** : Testing Library + happy-dom/jsdom

### Déploiement

- **Build** : `npm run build` (tsup pour le serveur, Vite pour le web)
- **Production** : `npm start` (port 10369)
- **Développement** : `npm run dev` (port 10370+)
