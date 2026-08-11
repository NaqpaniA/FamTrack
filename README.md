# FamTrack

Семейный трекер для Telegram Mini App: задачи, финансы, награды, подписки и список покупок.

Открытые клиенты синхронизируют семейное состояние автоматически. Записи идут
как идемпотентные серверные команды, поэтому два члена семьи могут работать
параллельно без ручного refresh и без замены чужих списков устаревшим snapshot.
XP задачи рассчитывается backend по сложности и приоритету.
Telegram-аватар сначала берётся из подписанного `photo_url`; если поле скрыто
или ссылка не загрузилась, UI запрашивает приватный server-side fallback через
Bot API без передачи bot token в браузер.

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
FAMTRACK_ALERT_BOT_USERNAME=famtrack_alerts_bot
FAMTRACK_INTERNAL_API_SECRET=generate-a-long-random-value
FAMTRACK_AUTH_MODE=telegram
FAMTRACK_INIT_DATA_MAX_AGE_SECONDS=86400
FAMTRACK_BACKUP_RETENTION=10
FAMTRACK_BOOTSTRAP_FAMILY_NAME=Моя семья
FAMTRACK_BOOTSTRAP_DEMO=0
FAMTRACK_OWNER_TELEGRAM_IDS=111111111
FAMTRACK_AGENT_API_BASE=http://127.0.0.1:18080
FAMTRACK_AGENT_TELEGRAM_PROXY=
FAMTRACK_TELEGRAM_PROXY=
FAMTRACK_AGENT_REMINDER_INTERVAL_SECONDS=60
```

`TELEGRAM_BOT_TOKEN` берётся у BotFather. `FAMTRACK_ALLOWED_TELEGRAM_IDS` — числовые Telegram user id членов семьи.

Отдельный alert-процесс читает только `/home/naqpania/apps/famtrack/.env.agent-alerts`:

```dotenv
FAMTRACK_ALERT_BOT_TOKEN=123456:...
FAMTRACK_INTERNAL_API_SECRET=generate-a-long-random-value
FAMTRACK_AGENT_REMINDER_INTERVAL_SECONDS=60
```

## Docker

```bash
cp .env.example .env.production
docker compose up -d --build
curl http://127.0.0.1:18080/api/health
```

Compose публикует контейнер только на `127.0.0.1:18080`, чтобы Docker не открывал приложение наружу мимо firewall. Публичный HTTPS должен идти через infra reverse tunnel/proxy.

## Telegram bot and MCP

`agent/famtrack_agent.py` — long-polling family command bot for the home server. It uses the same bot token and allowlist as the Mini App and never dispatches reminders. It cannot launch Codex and does not process callback queries.

`agent/famtrack_alerts.py` — отдельный one-way reminder dispatcher with its own Telegram bot token and systemd service. Family members must start that bot once (or add it to the family group); `/alerts` in the family bot shows the onboarding link.

Group chats do not show the private chat Mini App menu button. Use `/app` or `/open`; when `FAMTRACK_TELEGRAM_APP_NAME` or `FAMTRACK_MINIAPP_DIRECT_URL` is configured after BotFather `/newapp`, the agent sends the `https://t.me/<bot>/<app>` Mini App link.

Direct Mini App links принудительно получают `mode=fullscreen`. При старте UI
вызывает Telegram Bot API 8.0 `requestFullscreen()` и сохраняет `expand()` как
fallback для старых клиентов; layout учитывает Telegram content safe area.
Чтобы кнопка **Launch app** на профиле бота тоже открывала этот режим, FamTrack
должен быть настроен в BotFather как Main Mini App, а не только как обычный URL
menu button.

The family bot registers private/group chats only after a linked family member has interacted with it. The alert service uses those chat destinations and the family/task delivery mode. A task with a non-empty `visibleTo` list is always private-only and is never widened to a group chat. Delivery keys are persisted in `FAMTRACK_AGENT_STATE_DIR`, so service restarts do not duplicate an already sent reminder.

The optional `agent/codex_owner_bot.py` is a separate, standalone scaffold for a future personal bot. It is not included in Docker/infra deployment, requires a different `FAMTRACK_CODEX_BOT_TOKEN`, works only in a private chat whose Telegram ID is listed in `FAMTRACK_CODEX_BOT_OWNER_IDS`, and keeps its state outside the family bot. Copy `agent/codex_owner_bot.env.example` to a private environment file only when a separate BotFather token is ready.

On a fresh production database FamTrack creates a clean owner workspace from the first configured owner/allowed Telegram identity. Demo tasks and finance data are seeded only outside production or when `FAMTRACK_BOOTSTRAP_DEMO=1` is explicitly set.

`mcp/famtrack_mcp.py` — stdio MCP bridge for Codex/tools. Reads and writes go through the FamTrack HTTP API, so Telegram identity and RBAC stay enforced by the backend.

If Telegram API is unavailable from the home network, the agents use
`FAMTRACK_AGENT_TELEGRAM_PROXY=socks5h://127.0.0.1:11080`. The application uses
the same tunnel through the Docker bridge as
`FAMTRACK_TELEGRAM_PROXY=socks5h://host.docker.internal:11080`. The SSH tunnel
and its two interface-scoped listeners are managed by the infra repo.

Production install/restart commands live in the infra repo. This repo only keeps app code and neutral configuration examples.
Release-контур в infra сначала прогоняет миграцию на копии SQLite; production
переключается только после финального snapshot и имеет автоматический rollback.

## Checks

```bash
npm run check
python3 -m py_compile agent/famtrack_agent.py agent/famtrack_alerts.py agent/codex_owner_bot.py mcp/famtrack_mcp.py
```
