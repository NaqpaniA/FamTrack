# 103 — Allowlist: включить и документировать

Модель: haiku · Волна: 1 · Зависит от: —

## Контекст

Env-allowlist (`FAMTRACK_ALLOWED_TELEGRAM_IDS/_USERNAMES`) проверяется только
при `FAMTRACK_REQUIRE_ALLOWLIST === '1'` (`server/auth.ts:58`, применение ~:90),
но эта переменная не упомянута ни в `.env.example`, ни в `README.md`, ни в
`compose.yaml` — в документированной прод-конфигурации allowlist инертен.

## Файлы

- `.env.example` — изменить.
- `README.md` — изменить (раздел Production env).
- `compose.yaml` — изменить.
- `server/auth.ts` — изменить (только добавить warning-лог).
- `server/auth.test.ts` или `server/features.test.ts` — дополнить, если есть подходящий файл; иначе создать `server/auth-allowlist.test.ts`.

## Точные изменения

1. `.env.example`: добавить `FAMTRACK_REQUIRE_ALLOWLIST=1` с комментарием (включает проверку `FAMTRACK_ALLOWED_TELEGRAM_IDS/_USERNAMES` на этапе аутентификации; без него список используется только для bootstrap первого владельца).
2. `compose.yaml`: в environment сервиса `famtrack` добавить `FAMTRACK_REQUIRE_ALLOWLIST=1`.
3. `README.md`: описать переменную в таблице/списке env (рядом с `FAMTRACK_ALLOWED_TELEGRAM_IDS`).
4. `server/auth.ts` в `getAuthConfig()`: если `NODE_ENV === 'production'` и mode `telegram` и `requireAllowlist` ложь — `console.warn('[auth] FAMTRACK_REQUIRE_ALLOWLIST is not enabled: allowlist env vars are NOT enforced')`. Один раз при построении конфига.

## Контракт

Поведение при выставленной переменной не меняется (уже реализовано). Меняется
дефолтная документированная конфигурация.

## Тесты

- Тест на `getAuthConfig`: production+telegram без флага → конфиг строится, warning вызван (перехват `console.warn`); с флагом — warning нет, `requireAllowlist === true`.

## Acceptance criteria

- `grep -n "FAMTRACK_REQUIRE_ALLOWLIST" .env.example README.md compose.yaml server/auth.ts` — по совпадению в каждом.
- `npm run check` зелёный.

## Не трогать

- Логику `validateTelegramInitData`, HMAC, `resolveActor`.

## Самопроверка

- [ ] Warning не срабатывает в dev-режиме.
- [ ] compose разворачивается (`docker compose config` валиден, если docker доступен; иначе YAML-синтаксис проверен глазами).
- [ ] `npm run check` зелёный.
