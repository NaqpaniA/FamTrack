# FamTrack

Семейный трекер для Telegram Mini App: задачи, финансы, награды, подписки и список покупок.

## Что внутри

- React/Vite frontend.
- TypeScript HTTP backend на Node.js.
- SQLite-хранилище с доменными таблицами.
- Telegram `initData` auth с allowlist семьи.
- Docker/Compose для домашнего сервера.

Supabase ADR в `docs/architecture` оставлен как исторический контекст. Production путь сейчас: свой backend на домашнем сервере.

## Локальный запуск

```bash
npm install
npm run build
FAMTRACK_AUTH_MODE=dev \
FAMTRACK_DB_PATH=/tmp/famtrack.sqlite \
FAMTRACK_STATIC_DIR="$PWD/dist" \
PORT=8080 \
npm run server:start
```

Проверка:

```bash
curl http://127.0.0.1:8080/api/health
```

Для разработки фронта можно запустить Vite отдельно:

```bash
npm run dev
```

Vite проксирует `/api` на `http://127.0.0.1:8080`.

## Production env

Секреты не коммитятся. На сервере создаётся `.env.production` рядом с `compose.yaml`:

```dotenv
TELEGRAM_BOT_TOKEN=123456:...
FAMTRACK_ALLOWED_TELEGRAM_IDS=111111111,222222222
FAMTRACK_ALLOWED_TELEGRAM_USERNAMES=
FAMTRACK_PUBLIC_HOST=famtrack.example.com
FAMTRACK_PUBLIC_PORT=
FAMTRACK_PUBLIC_URL=
FAMTRACK_TELEGRAM_BOT_USERNAME=NqpFamBot
FAMTRACK_TELEGRAM_APP_NAME=
FAMTRACK_MINIAPP_DIRECT_URL=
FAMTRACK_SESSION_SECRET=generate-a-long-random-value
FAMTRACK_INTERNAL_API_SECRET=generate-a-long-random-value
FAMTRACK_AUTH_MODE=telegram
FAMTRACK_OWNER_TELEGRAM_IDS=111111111
FAMTRACK_AGENT_API_BASE=http://127.0.0.1:18080
FAMTRACK_AGENT_TELEGRAM_PROXY=
FAMTRACK_AGENT_CODEX_BIN=
```

`TELEGRAM_BOT_TOKEN` берётся у BotFather. `FAMTRACK_ALLOWED_TELEGRAM_IDS` — числовые Telegram user id членов семьи.

## Docker

```bash
cp .env.example .env.production
docker compose up -d --build
curl http://127.0.0.1:18080/api/health
```

Compose публикует контейнер только на `127.0.0.1:18080`, чтобы Docker не открывал приложение наружу мимо firewall. Публичный HTTPS должен идти через infra reverse tunnel/proxy.

## Telegram agent and MCP

`agent/famtrack_agent.py` — long-polling Telegram agent for the home server. It uses the same bot token and allowlist as the Mini App, answers family commands, and keeps owner-only `/plan` and `/agent` flows behind `FAMTRACK_OWNER_TELEGRAM_IDS`.

Group chats do not show the private chat Mini App menu button. Use `/app` or `/open`; when `FAMTRACK_TELEGRAM_APP_NAME` or `FAMTRACK_MINIAPP_DIRECT_URL` is configured after BotFather `/newapp`, the agent sends the `https://t.me/<bot>/<app>` Mini App link.

`mcp/famtrack_mcp.py` — stdio MCP bridge for Codex/tools. Reads and writes go through the FamTrack HTTP API, so Telegram identity and RBAC stay enforced by the backend.

If Telegram API is unavailable from the home network, the agent can use `FAMTRACK_AGENT_TELEGRAM_PROXY=socks5h://127.0.0.1:11080`. The SSH tunnel that provides this proxy is managed by the infra repo.

Production install/restart commands live in the infra repo. This repo only keeps app code and neutral configuration examples.

## Checks

```bash
npm run typecheck
npm run test:server
npm run build
python3 -m py_compile agent/famtrack_agent.py mcp/famtrack_mcp.py
```
