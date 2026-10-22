# «ДомовёнокNET», часть 1: новая программа + роутер автора — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Заменить трей-программу на C# и старые скрипты роутера новой Electron-программой «ДомовёнокNET» и новым набором скриптов `domovenok` на роутере, с безопасной миграцией роутера автора.

**Architecture:** Вся логика маршрутизации — shell-скрипты на OpenWrt (`router/`), единая команда `domovenok` с JSON-выводом. Программа (`app/`, Electron) ходит на роутер по SSH (`ssh2`), вызывает `domovenok …`, держит один поток счётчиков для табло скорости и показывает дашборд, мини-окно и трей. Миграция: программа заливает новые скрипты, читает старую настройку, строит план (чистая TS-функция), делает резервную копию на ПК и переключает роутер, с кнопкой отката.

**Tech Stack:** Electron + electron-vite + React + TypeScript; `ssh2`; `zod`; Vitest; electron-builder (NSIS) + electron-updater (GitHub Releases); на роутере — busybox ash, nftables, dnsmasq-full (nftset), AmneziaWG/WireGuard; тесты shell — `bats` (npm-пакет `bats`).

**Spec:** `docs/superpowers/specs/2026-10-22-vpn-router-app-design.md` — исполнители читают его вместе с планом.

## Global Constraints

- Название: «ДомовёнокNET», латиницей `DomovenokNET`; appId `ru.domovenoknet.app`; папка данных `%APPDATA%\DomovenokNET`.
- Интерфейс только на русском. Тёмная тема. Цвета: VPN `#6cc58a`, напрямую `#58a6ff`, отдача `#8b9cf7`, фон `#0f1419`, плитки `#161b22`, вторичный текст `#8b949e`.
- Windows 11, установщик NSIS без подписи кода.
- Только IPv4. VLESS/sing-box, списки «напрямую», `blackbox`, `vps-check`, внешние проверочные адреса (94.140.14.14, 76.76.2.0, 208.67.220.220), устройства/«корп. VPN» — не переносить и не реализовывать.
- Три состояния туннеля: `off` (Выключен), `list` (Только список), `full` (Всё через VPN, без исключений, кроме служебных: NTP `udp 123` напрямую, пакеты туннеля напрямую через fwmark `0x2`).
- Сторож автоматически проверяет только рукопожатие: здоров ⇔ туннель включён и с последнего рукопожатия < 180 с. Напрямую ничего не пускать; единственное исключение — DNS-серверы роутера в режиме `list`, пока туннель нездоров.
- Скрипты роутера: busybox ash (без bash-измов), OpenWrt 25.12 (`apk`) и 24.10 (`opkg`).
- Пакеты туннеля помечаются fwmark `0x2`; `ip rule fwmark 0x2 lookup 200`, таблица 200 = default via WAN.
- Имя GitHub-репозитория — одна настройка: `app/src/shared/config.ts` → `REPO` и `/etc/domovenok/config` → `REPO=`. Значение `prianikc/domovenok-net`.
- Никакие пользовательские строки не попадают в shell без проверки (`validate.ts`) и экранирования (`shq`).
- Секреты на ПК — только через Electron `safeStorage`.

## Review Focus

1. Одиночный клик по значку в трее, за которым следует двойной: двойной клик открывает большое окно и **не** открывает/не закрывает мини-окно (Task 11).
2. Роутер перезагружается или SSH рвётся посреди работы: значок серый, переподключение с паузами, действия в UI показывают ошибку, программа не падает (Task 9, Task 10).
3. Счётчики интерфейсов сбрасываются или меняется интерфейс туннеля (awg0 ↔ wg0, перезапуск WAN): табло показывает 0, а не отрицательные или гигантские числа (Task 6).
4. Мусор в «Моих сайтах»: `https://www.YouTube.com/watch?v=1`, пробелы, кириллический домен, `a.com;reboot` — нормализуется (`youtube.com`, punycode) или отклоняется, никогда не исполняется (Task 6, Task 5).
5. Источник подборки отдаёт 404/HTML/пустоту или недоступен: остаётся последний рабочий список, маршрутизация не очищается (Task 3).

---

## Структура файлов

```
router/                                   # то, что ставится на роутер (пути = пути на роутере)
  usr/bin/domovenok                         # CLI, JSON-вывод
  usr/lib/domovenok/common.sh               # пути, логирование, json-хелперы, валидация
  usr/lib/domovenok/rules.sh                # генерация nft
  usr/lib/domovenok/presets.sh              # каталог, скачивание, кэш, dnsmasq nftset
  usr/lib/domovenok/tunnel.sh               # профили, подъём/спуск туннеля, переключение с откатом
  usr/lib/domovenok/watchdog.sh             # цикл сторожа (procd), DNS-фолбэк
  usr/lib/domovenok/stats.sh                # поток счётчиков и пинга
  usr/lib/domovenok/diag.sh                 # «Проверить»
  usr/lib/domovenok/install.sh              # идемпотентная установка/обновление
  usr/lib/domovenok/migrate.sh              # снятие старой установки (vpnsplit/wgsw)
  usr/lib/domovenok/rollback.sh             # возврат старой установки из бэкапа
  etc/init.d/domovenok
  etc/hotplug.d/iface/90-domovenok-wan
  etc/hotplug.d/ntp/50-domovenok
router/tests/*.bats, router/tests/stubs/  # bats + заглушки nft/uci/ip/awg/wg/uclient-fetch/ping
presets/catalog.txt, presets/own/*.lst    # каталог подборок и собственные списки
app/                                      # Electron
  src/shared/{config,types,validate,shell,speed,profile-import,migration-plan,ipc}.ts
  src/main/{index,tray,windows,hub,notify,autostart,legacy-app}.ts
  src/main/ssh/{client,pairing,keys,gateway}.ts
  src/main/router/{api,deploy}.ts
  src/main/migration/{detect,run}.ts
  src/main/settings.ts
  src/preload/index.ts
  src/renderer/src/{App.tsx,theme.css,mini.tsx}
  src/renderer/src/pages/{Overview,Lists,Profiles,Router,Server,Pairing,Migration}.tsx
  src/renderer/src/components/{SpeedChart,StatusPill,Tile,StateSwitch}.tsx
  test/…                                  # vitest
```

Удаляются в Task 16: `src/`, `build.cmd`, `install.cmd`, `router/usr/bin/{wgsw,vpnmode,vps-check,blackbox}`, `router/usr/lib/vpnctl.sh`, `router/etc/vpnsplit/`, `router/etc/init.d/{vpnsplit,vpnawg}`, `router/etc/hotplug.d/ntp/50-wg-after-timesync`.

## Данные на роутере

```
/etc/domovenok/config          # REPO=prianikc/domovenok-net  VERSION=2.0.0  CACHE=/etc/domovenok/cache
/etc/domovenok/state           # off | list | full
/etc/domovenok/catalog.txt     # копия presets/catalog.txt (скачивается)
/etc/domovenok/presets.enabled # id по строке
/etc/domovenok/mine-domains.txt, mine-ips.txt
/etc/domovenok/profiles/<name>.awg|.conf, /etc/domovenok/profiles/.active
$CACHE/<id>.domains, $CACHE/<id>.subnets, $CACHE/<id>.updated (epoch)
/tmp/domovenok/health          # 1|0, пишет сторож
```

nft: таблица `inet domovenok`, цепочки `lan` (prerouting, mangle, только `iifname "br-lan"`) и `out` (route output, mangle); наборы `tun4` (interval: DNS-серверы роутера + подсети включённых подборок + mine-ips), `dyn_tun4` (timeout 24h, наполняет dnsmasq), `dnsfb4` (interval, наполняет сторож).

## Контракт CLI `domovenok` (stdout — одна строка JSON; ошибка — `{"ok":false,"error":"…"}` и код 1)

| Команда | Ответ (`ok:true` + поля) |
|---|---|
| `status` | `state, profile, type ("awg"\|"wg"\|""), iface, up, hs_age (сек, 999999 = нет), healthy, dns_fallback, endpoint, version` |
| `state off\|list\|full` | `state` |
| `restart` | `profile, healthy` |
| `profile list` | `active, profiles:[{name,type}]` |
| `profile add <name> <awg\|wg>` (конфиг в stdin) | `name` |
| `profile use <name>` | `profile, healthy, rolled_back (bool)` |
| `profile rm <name>` | — |
| `presets list` | `presets:[{id,title,enabled,updated,domains,subnets,sample:[≤3]}]` |
| `presets set <id> on\|off` | — |
| `presets update` | `updated:[id], failed:[id]` |
| `mine list` | `domains:[], ips:[]` |
| `mine add\|rm domain\|ip <value>` | — |
| `apply` | `state, tun4 (число элементов)` |
| `diag` | `checks:[{id,ok,detail}], verdict ("ok"\|"router"\|"provider"\|"server"\|"profile"), message` |
| `stats` | поток строк (не JSON), см. Task 5 |
| `version` | `version` |

---

### Task 1: Переименование и каркас Electron-приложения

**Files:**
- Create: `app/` (шаблон electron-vite react-ts), `app/src/shared/config.ts`, `app/test/smoke.test.ts`
- Modify: `.gitignore` (добавить `.superpowers/`, `node_modules/`, `app/out/`, `app/dist/`), `README.md` (заголовок «ДомовёнокNET», одна строка «в разработке, старая версия — VPN Tray 1.0»)

**Interfaces:**
- Produces: `REPO: string = 'prianikc/domovenok-net'`, `APP_NAME = 'ДомовёнокNET'`, `ROUTER_VERSION = '2.0.0'` в `shared/config.ts`; npm-скрипты `dev`, `build`, `test` (vitest run), `lint`, `typecheck`.

- [ ] **Step 1:** `npm create @quick-start/electron@latest app -- --template react-ts` (без git init); в `package.json` `"name": "domovenok"`, `"productName": "ДомовёнокNET"`; добавить `vitest`, `zod`, `ssh2`, `@types/ssh2`, `@testing-library/react`, `jsdom`, `bats` (dev).
- [ ] **Step 2:** Тест `app/test/smoke.test.ts`: `expect(APP_NAME).toBe('ДомовёнокNET')`, `expect(REPO).toMatch(/^[^/]+\/[^/]+$/)`.
- [ ] **Step 3:** `cd app && npm test` → PASS; `npm run typecheck` → без ошибок; `npm run build` → собирается.
- [ ] **Step 4:** Commit `chore: каркас Electron-приложения «ДомовёнокNET»`.

### Task 2: Роутер — common.sh и генерация правил nft

**Files:**
- Create: `router/usr/lib/domovenok/common.sh`, `router/usr/lib/domovenok/rules.sh`, `router/tests/rules.bats`, `router/tests/helper.bash`, `router/tests/stubs/{uci,nft,ip}`
- Modify: `app/package.json` — скрипт `"test:router": "bats ../router/tests"`

**Interfaces:**
- Produces (common.sh): переменные `ROOT=${DOMOVENOK_ROOT:-}`, `ETC=$ROOT/etc/domovenok`, `RUN=$ROOT/tmp/domovenok`, `CACHE` (из config, по умолчанию `$ETC/cache`); функции `cfg_get KEY`, `state_get` (по умолчанию `off`), `clean_list FILE` (без `#`, пустых строк, `\r`), `is_domain S`, `is_ipv4_or_cidr S`, `is_profile_name S` (`^[A-Za-z0-9_-]{1,32}$`), `json_str S` (экранирует `\` и `"`), `json_arr_lines` (stdin → `["a","b"]`), `die MSG` (печатает ошибку JSON, exit 1), `dns_servers` (из `uci get dhcp.@dnsmasq[0].server`, только IPv4).
- Produces (rules.sh): `rules_gen` → печатает nft-скрипт в stdout; `rules_apply` → `rules_gen > $RUN/domovenok.nft && nft -c -f … && nft -f …`; `tun4_elements` → элементы `tun4` по строке.

Все тесты bats используют `DOMOVENOK_ROOT=$BATS_TEST_TMPDIR/root` и `PATH=router/tests/stubs:$PATH`; заглушки пишут вызовы в `$BATS_TEST_TMPDIR/calls.log` и отдают фиксированный вывод (uci: `dhcp.@dnsmasq[0].server` → `1.1.1.1 8.8.8.8`).

- [ ] **Step 1: Тесты** в `rules.bats`:
  - `off`: вывод содержит `add table inet domovenok`, `flush chain inet domovenok lan`, и **ни одного** `add rule`.
  - `list`: порядок правил в `lan` ровно: `iifname != "br-lan" return` → `ip daddr { 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.0.0.0/8, 169.254.0.0/16, 100.64.0.0/10, 224.0.0.0/4, 240.0.0.0/4 } return` → `ip daddr @dnsfb4 meta mark set 0x2 return` → `udp dport 123 meta mark set 0x2 return` → `ip daddr @tun4 return` → `ip daddr @dyn_tun4 return` → `meta mark set 0x2`; цепочка `out` — то же без первой строки.
  - `full`: только локальные адреса `return` и `udp dport 123 meta mark set 0x2 return`; нет `@dnsfb4`, нет финального `meta mark set 0x2`.
  - `tun4_elements` при `mine-ips.txt` = `5.6.7.0/24`, включённой подборке `telegram` с `$CACHE/telegram.subnets` = `91.108.4.0/22`, и выключенной `discord` с кэшем → ровно `1.1.1.1/32 8.8.8.8/32 5.6.7.0/24 91.108.4.0/22` (порядок любой), discord не попадает.
  - Строки с `\r` и комментарии в списках игнорируются.
- [ ] **Step 2:** `cd app && npm run test:router` → FAIL (нет файлов).
- [ ] **Step 3:** Реализовать `common.sh`, `rules.sh`. Наборы объявлять так: `add set inet domovenok tun4 { type ipv4_addr; flags interval; auto-merge; }`, `dyn_tun4 { type ipv4_addr; flags timeout; timeout 24h; }`, `dnsfb4 { type ipv4_addr; flags interval; }`; при генерации `flush set` для `tun4`, но **не** для `dyn_tun4` и `dnsfb4` (их состояние живое). Цепочки: `lan` — `type filter hook prerouting priority mangle`, `out` — `type route hook output priority mangle`.
- [ ] **Step 4:** `npm run test:router` → PASS.
- [ ] **Step 5:** Commit `feat(router): генерация правил nft для трёх состояний`.

### Task 3: Роутер — подборки и dnsmasq

**Files:**
- Create: `presets/catalog.txt`, `presets/own/{anthropic,openai,jetbrains}.lst`, `router/usr/lib/domovenok/presets.sh`, `router/tests/presets.bats`, `router/tests/stubs/uclient-fetch`

**Interfaces:**
- Consumes: common.sh (Task 2).
- Produces: `presets_update [ID…]` (печатает `updated`/`failed` id), `presets_list_json`, `presets_set ID on|off`, `dnsmasq_gen` (печатает конфиг), `dnsmasq_apply` (пишет `$(dnsmasq_confdir)/domovenok.conf`, рестарт dnsmasq), `dnsmasq_confdir` (значение `conf-dir=` из `/var/etc/dnsmasq.conf.*`, первое найденное), переменная `FETCH` (по умолчанию `uclient-fetch -q -T 30 -O`).

Формат `catalog.txt` — строка на подборку, поля через `|`: `id|Название|домены|подсети`; в полях несколько источников через `;`; источник — полный URL или путь `own/x.lst` (относительно `https://raw.githubusercontent.com/$REPO/main/presets/`). Содержимое:

```
blocked_ru|Всё заблокированное в РФ|https://raw.githubusercontent.com/itdoginfo/allow-domains/main/Russia/inside-raw.lst|
youtube|YouTube|https://raw.githubusercontent.com/itdoginfo/allow-domains/main/Services/youtube.lst|
telegram|Telegram|https://raw.githubusercontent.com/itdoginfo/allow-domains/main/Services/telegram.lst|https://core.telegram.org/resources/cidr.txt
discord|Discord|https://raw.githubusercontent.com/itdoginfo/allow-domains/main/Services/discord.lst|https://raw.githubusercontent.com/itdoginfo/allow-domains/main/Subnets/IPv4/discord.lst
meta|Instagram и Facebook|https://raw.githubusercontent.com/itdoginfo/allow-domains/main/Services/meta.lst|https://raw.githubusercontent.com/itdoginfo/allow-domains/main/Subnets/IPv4/meta.lst
twitter|X (Twitter)|https://raw.githubusercontent.com/itdoginfo/allow-domains/main/Services/twitter.lst|https://raw.githubusercontent.com/itdoginfo/allow-domains/main/Subnets/IPv4/twitter.lst
tiktok|TikTok|https://raw.githubusercontent.com/itdoginfo/allow-domains/main/Services/tiktok.lst|
google_ai|Gemini и Google AI|https://raw.githubusercontent.com/itdoginfo/allow-domains/main/Services/google_ai.lst|
anthropic|Claude (Anthropic)|own/anthropic.lst|own/anthropic.subnets
openai|ChatGPT (OpenAI)|own/openai.lst|
jetbrains|JetBrains|own/jetbrains.lst|
```

`own/anthropic.lst`, `openai.lst`, `jetbrains.lst` — домены из соответствующих разделов текущего `router/etc/vpnsplit/lists/tunnel-domains.txt`; `own/anthropic.subnets` — `160.79.104.0/23` и `35.190.46.17/32` (из `work-ips.txt`). Перед реализацией проверить, что каждый URL itdoginfo отдаёт 200; не отдающий — убрать из каталога.

- [ ] **Step 1: Тесты** (`presets.bats`, заглушка `uclient-fetch` копирует файл из `$BATS_TEST_TMPDIR/web/<имя>` по последнему сегменту URL или выходит с кодом 1):
  - успешное обновление пишет `$CACHE/youtube.domains` (очищенный, только валидные домены) и `.updated`.
  - **Review Focus 5:** источник отдаёт HTML-страницу (`<html>…`) или пустой файл → `failed` содержит `youtube`, старый `$CACHE/youtube.domains` не изменён. Правило «годен»: после очистки ≥1 валидная запись и доля невалидных строк < 50 %.
  - источник недоступен (код 1) → то же.
  - `presets_list_json` для включённой подборки с 15 доменами → `"domains":15`, `"sample"` — первые 3, `"enabled":true`.
  - `dnsmasq_gen` при включённой подборке и `mine-domains.txt` → строки вида `nftset=/a.com/b.com/4#inet#domovenok#dyn_tun4`, не более 50 доменов на строку; дубли убраны.
  - `dnsmasq_gen` при `state=off` → пустой вывод.
- [ ] **Step 2:** `npm run test:router` → FAIL.
- [ ] **Step 3:** Реализовать `presets.sh`; скачивание во временный файл в `$RUN`, валидация, затем `mv` (атомарно). `presets_update` без аргументов обновляет каталог (`catalog.txt` с `$REPO`, при неудаче — оставляет старый) и все включённые подборки.
- [ ] **Step 4:** `npm run test:router` → PASS.
- [ ] **Step 5:** Commit `feat(router): подборки с автообновлением и dnsmasq nftset`.

### Task 4: Роутер — туннель, сторож, init и hotplug

**Files:**
- Create: `router/usr/lib/domovenok/tunnel.sh`, `router/usr/lib/domovenok/watchdog.sh`, `router/etc/init.d/domovenok`, `router/etc/hotplug.d/iface/90-domovenok-wan`, `router/etc/hotplug.d/ntp/50-domovenok`, `router/tests/tunnel.bats`, `router/tests/stubs/{awg,wg,ifup,ifdown}`

**Interfaces:**
- Consumes: common.sh, rules.sh (`rules_apply`).
- Produces: `prof_type NAME` (`awg`|`wg`), `tun_dev` (`awg0`|`wg0`), `hs_age`, `is_healthy` (state≠off и hs_age<180), `tunnel_up NAME`, `tunnel_down`, `wait_handshake SECONDS` (0 — рукопожатие получено), `profile_use NAME` (переключение с откатом, печатает JSON), `wd_tick` (один шаг сторожа), `wd_loop` (бесконечный цикл с `sleep 10`), `endpoint_ip`.

Логика переносится из `router/usr/lib/vpnctl.sh` и `router/usr/bin/wgsw` без sing-box: AmneziaWG — `aw_start` как сейчас (`FwMark = 0x2`, MTU 1376, `ip route replace default dev awg0`); WireGuard — через UCI `network.wg0` как в `wgsw apply`. Профили в `$ETC/profiles`.

- [ ] **Step 1: Тесты** (`tunnel.bats`, заглушка `awg`/`wg` отдаёт `latest-handshakes` из файла `$BATS_TEST_TMPDIR/hs`, `date` подменён через `NOW` в common.sh — функция `now` читает `${DOMOVENOK_NOW:-$(date +%s)}`):
  - `hs_age` при рукопожатии 30 с назад → `30`; при `0` → `999999`.
  - `wd_tick`, state=`list`, рукопожатие 200 с назад → `nft add element inet domovenok dnsfb4 { 1.1.1.1, 8.8.8.8 }` в `calls.log`, `$RUN/health` = `0`.
  - `wd_tick`, state=`list`, рукопожатие 10 с назад, до этого health=0 → `nft flush set inet domovenok dnsfb4`, health = `1`.
  - `wd_tick`, state=`full`, рукопожатие 200 с назад → **нет** добавления в `dnsfb4`, есть `nft flush set inet domovenok dnsfb4` (фолбэк снимается при любом state≠`list`), health=`0`.
  - `profile_use new`, новый не дал рукопожатия, старый дал → JSON `"rolled_back":true`, `.active` = старый.
  - `profile_use new`, ни новый, ни старый не поднялись → `.active` = `new`, state не меняется на `off`, JSON `"healthy":false` (туннель остаётся включённым — решение спеки).
  - `profile_use` с именем `../x` → ошибка JSON, код 1.
- [ ] **Step 2:** `npm run test:router` → FAIL.
- [ ] **Step 3:** Реализовать. `wait_handshake` ждёт до 30 с рукопожатия, более свежего, чем момент подъёма. init.d: `START=19` → `rules_apply`, `dnsmasq_apply`, при state≠off — `tunnel_up $(cat .active)`; procd-инстанс `watchdog` → `/usr/lib/domovenok/watchdog.sh loop`. `90-domovenok-wan` — как текущий `90-wan-direct-table`, тег лога `domovenok`. `50-domovenok` (ntp, `stratum`) — один раз после синхронизации времени, если state≠off и не здоров → `tunnel_up` текущего профиля.
- [ ] **Step 4:** `npm run test:router` → PASS.
- [ ] **Step 5:** Commit `feat(router): туннель, переключение с откатом, сторож по рукопожатию`.

### Task 5: Роутер — CLI `domovenok`, табло, диагностика, установка

**Files:**
- Create: `router/usr/bin/domovenok`, `router/usr/lib/domovenok/{stats,diag,install}.sh`, `router/tests/cli.bats`

**Interfaces:**
- Consumes: всё из Task 2–4.
- Produces: контракт CLI (таблица выше); поток `stats`; `install.sh` печатает JSON `{"ok":true,"version":"2.0.0","missing":["kmod-amneziawg",…],"legacy":true|false,"free_kb":N}` (`free_kb` — свободно на `/overlay`).

Поток `domovenok stats` — каждую секунду строка `S <epoch> <wan_rx_bytes> <wan_tx_bytes> <wan_rx_pkts> <wan_tx_pkts> <tun_rx_bytes> <tun_tx_bytes> <tun_rx_pkts> <tun_tx_pkts>` из `/proc/net/dev` (WAN-устройство — `uci get network.wan.device`, туннель — `tun_dev`; нет устройства → нули), каждые 5 с строка `P <ms>` (ping `-c1 -W1` на `endpoint_ip` через WAN; нет ответа → `P -1`). Каждую минуту — строка `H <0|1>` из `$RUN/health`.

`diag`: проверки `handshake` (hs_age<180), `tunnel_ping` (`ping -c2 -W2 -I <tun_dev>` на внутренний адрес сервера = адрес из `Address` профиля с последним октетом `1`), `dns` (`nslookup openwrt.org <первый dns>`), `wan` (`ping -c2 -W2 -I <wan dev> 77.88.8.8`), `server_direct` (ping endpoint через WAN). Вердикт, по порядку: `wan` не прошёл → `provider` «Нет интернета у провайдера: проверьте кабель или оплату»; `server_direct` не прошёл → `server` «Сервер VPN не отвечает: проверьте, работает ли сервер (возможно, его адрес блокируется)»; `handshake` не прошёл → `profile` «Сервер доступен, но не принимает профиль: профиль мог быть отозван»; `tunnel_ping` не прошёл → `server` «Туннель поднят, но сервер не пропускает трафик»; `dns` не прошёл → `server` «Сервер не выпускает в интернет»; иначе `ok` «Всё в порядке». Туннель выключен → `router` «Туннель выключен».

`install.sh` (идемпотентно): `chmod +x`; создать `/etc/domovenok/{config,state,…}` если нет (`state` по умолчанию `off`); UCI-правило `mark 0x2 lookup 200 priority 200` если нет; удалить `/etc/hotplug.d/iface/90-wan-direct-table` **только если** нет старой установки (при старой — это делает migrate.sh); cron: `<случайная минута> 4 * * * /usr/bin/domovenok presets update >/dev/null 2>&1` (без дублей); `missing` — из `dnsmasq-full kmod-amneziawg amneziawg-tools` по `apk info -e` или `opkg status`; `legacy` = есть `/usr/bin/wgsw`. Не включает и не запускает init, если `legacy=true`.

- [ ] **Step 1: Тесты** (`cli.bats`):
  - `domovenok mine add domain 'a.com;reboot'` → `{"ok":false,…}`, код 1, файл не изменён.
  - `domovenok mine add domain YouTube.com` → в `mine-domains.txt` `youtube.com`; повторное добавление не дублирует.
  - `domovenok mine add ip 1.2.3.0/24` → ok; `1.2.3.0/33` и `300.1.1.1` → ошибка.
  - `domovenok state list` → `state` = `list`, в `calls.log` есть `nft -f`.
  - `domovenok status` при health=1, профиле `myvps_awg` → JSON с `"state":"list","profile":"myvps_awg","type":"awg","healthy":true` (проверять через `jsonfilter` нельзя — проверять подстроками).
  - `domovenok diag` при стабах: wan ok, server_direct fail → `"verdict":"server"`.
  - `install.sh` дважды подряд → одна строка cron, одно UCI-правило; при наличии `usr/bin/wgsw` → `"legacy":true` и нет `enable` в calls.log.
- [ ] **Step 2:** `npm run test:router` → FAIL.
- [ ] **Step 3:** Реализовать.
- [ ] **Step 4:** `npm run test:router` → PASS; `sh -n` на всех скриптах без ошибок.
- [ ] **Step 5:** Commit `feat(router): CLI domovenok, поток табло, диагностика, установка`.

### Task 6: Общие модули — валидация, экранирование, скорость

**Files:**
- Create: `app/src/shared/{types,validate,shell,speed}.ts`, `app/test/{validate,shell,speed}.test.ts`

**Interfaces:**
- Produces:
  - `type TunnelState = 'off' | 'list' | 'full'`; `interface Status { state; profile: string; type: 'awg'|'wg'|''; iface: string; up: boolean; hsAge: number; healthy: boolean; dnsFallback: boolean; endpoint: string; version: string }`; `interface Preset { id; title; enabled: boolean; updated: number; domains: number; subnets: number; sample: string[] }`; `interface DiagResult { checks: {id: string; ok: boolean; detail: string}[]; verdict: 'ok'|'router'|'provider'|'server'|'profile'; message: string }`; `type Connection = 'online' | 'offline' | 'busy'`.
  - `normalizeDomain(input: string): string | null` (в `validate.ts`; убирает схему, путь, порт, `www.`, приводит к нижнему регистру, кириллицу → punycode через `url.domainToASCII`; невалидное → `null`).
  - `normalizeIp(input: string): string | null` (IPv4 или CIDR /0–/32).
  - `isProfileName(s: string): boolean` — `^[A-Za-z0-9_-]{1,32}$`; `toProfileName(s: string): string` — транслит/замена недопустимых на `_`, обрезка до 32.
  - `shq(s: string): string` — одинарные кавычки POSIX.
  - `interface StatSample { t: number; wanRx; wanTx; wanRxPkts; wanTxPkts; tunRx; tunTx; tunRxPkts; tunTxPkts }`; `parseStatLine(line: string): StatSample | {ping: number} | {health: boolean} | null`; `computeRates(prev: StatSample, cur: StatSample): Rates`; `interface Rates { down; up; vpnDown; vpnUp; directDown; directUp }` в Мбит/с; `OVERHEAD_BYTES_PER_PACKET = 80`.

`computeRates`: `dt = cur.t - prev.t` (≤0 → все нули); `vpnDown = Δtun_rx`; `directDown = max(0, Δwan_rx − (Δtun_rx + Δtun_rx_pkts·80))`; `down = vpnDown + directDown`; аналогично отдача по tx; любое отрицательное Δ (сброс счётчика, смена интерфейса) → это Δ = 0. Байты → Мбит/с: `Δ·8/dt/1e6`, округление до 0,1.

- [ ] **Step 1: Тесты:**
  - `normalizeDomain('https://www.YouTube.com/watch?v=1') === 'youtube.com'`; `normalizeDomain(' claude.ai ') === 'claude.ai'`; `normalizeDomain('пример.рф') === 'xn--e1afmkfd.xn--p1ai'`; `normalizeDomain('a.com;reboot') === null`; `normalizeDomain('localhost') === null`.
  - `normalizeIp('1.2.3.4') === '1.2.3.4'`; `normalizeIp('1.2.3.0/24') === '1.2.3.0/24'`; `normalizeIp('1.2.3.0/33') === null`; `normalizeIp('300.1.1.1') === null`.
  - `shq("it's") === "'it'\\''s'"`.
  - `computeRates`: за 1 с wanRx +12 500 000 байт, tunRx +10 000 000 байт, tunRxPkts +10 000 → `vpnDown 80`, `directDown 13.6`, `down 93.6`.
  - **Review Focus 3:** tunRx уменьшился (новый интерфейс) → `vpnDown 0`, нигде нет отрицательных чисел; `dt = 0` → все нули.
  - `parseStatLine('P -1')` → `{ping: -1}`; мусор → `null`.
- [ ] **Step 2:** `npm test` → FAIL. **Step 3:** реализовать. **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** Commit `feat(app): валидация, экранирование, расчёт скорости`.

### Task 7: Импорт профилей (файл и строка `vpn://`)

**Files:**
- Create: `app/src/shared/profile-import.ts`, `app/test/profile-import.test.ts`

**Interfaces:**
- Produces: `interface ImportedProfile { name: string; type: 'awg' | 'wg'; config: string }`; `importProfileFile(fileName: string, text: string): ImportedProfile`; `importVpnString(s: string): ImportedProfile`; ошибки — `class ImportError extends Error { code: 'not_vpn' | 'admin_profile' | 'no_config' | 'bad_config' }`.

Правила: тип `awg`, если в `[Interface]` есть любой из ключей `Jc`, `Jmin`, `Jmax`, `S1`, `S2`, `H1`–`H4`; иначе `wg`. Обязательны `PrivateKey`, `Address`, `PublicKey`, `Endpoint`, иначе `bad_config`. Имя — из имени файла (без расширения) через `toProfileName`. `vpn://`: base64url → буфер; если первые 4 байта (big-endian) — длина и остаток распаковывается `zlib.inflateSync` — это JSON, иначе пробовать буфер как JSON напрямую; иначе `not_vpn`. Конфиг — `containers[i].awg.last_config` или `containers[i].wireguard.last_config` (строка JSON, поле `config`); имя — `description` или `hostName`. Есть данные доступа к серверу (`userName`/`password`), но нет `last_config` → `admin_profile` (текст в UI: «Это админский профиль — его поддержка появится в разделе «Сервер»»).

- [ ] **Step 1: Тесты:** файл `myvps.conf` с `Jc = 4` → `type 'awg'`, `name 'myvps'`; без `Jc` → `wg`; без `Endpoint` → `bad_config`; строка `vpn://`, собранная в тесте (`4 байта длины + zlib(JSON с containers[0].awg.last_config)`) → правильный `config`, `name` из `description`; та же без сжатия → работает; JSON с `userName` без `last_config` → `admin_profile`; `vpn://мусор` → `not_vpn`.
- [ ] **Step 2–4:** FAIL → реализовать → PASS.
- [ ] **Step 5:** Commit `feat(app): импорт профилей из файла и строки vpn://`.

### Task 8: Планировщик миграции

**Files:**
- Create: `app/src/shared/migration-plan.ts`, `app/test/migration-plan.test.ts`, `app/test/fixtures/legacy/` (обезличенные копии старых списков: `tunnel-domains.txt`, `tunnel-ips.txt`, `work-ips.txt`)

**Interfaces:**
- Produces: `interface LegacyInstall { profiles: {file: string; ext: 'conf'|'awg'|'vless'}[]; active: string; enabled: boolean; mode: 'full'|'list'; tunnelDomains: string; tunnelIps: string; workIps: string; extraFiles: string[] }`; `interface MigrationPlan { profiles: {name: string; type: 'awg'|'wg'}[]; skippedProfiles: string[]; active: string; state: TunnelState; presetsOn: string[]; mineDomains: string[]; mineIps: string[]; removed: string[] }`; `planMigration(old: LegacyInstall, presetContent: Record<string, {domains: string[]; subnets: string[]}>): MigrationPlan`.

Правила: состояние = `off`, если `!enabled`, иначе `mode`; `.vless` → `skippedProfiles`; активный профиль `.vless` → `active = ''`, `state = 'off'`. Домен «покрыт» подборкой, если совпадает с доменом подборки или является его поддоменом; подборка включается, если она покрывает ≥1 домен из старого списка; непокрытые домены → `mineDomains` (через `normalizeDomain`). IP: служебные (`1.1.1.1/32`, `1.0.0.1/32`, `8.8.8.8/32`, `8.8.4.4/32`, `94.140.14.14/32`, `76.76.2.0/32`, `208.67.220.220/32`) отбрасываются; подсеть, содержащаяся в подсети включённой (или включаемой) подборки, → покрыта; остальное из `tunnelIps` + `workIps` → `mineIps`. `removed` — человеческие строки: «Списки «напрямую» (сайты, IP, порты, программы)», «VLESS-профили: …», «Журнал blackbox», «Проверка vps-check», «Список рабочих компьютеров (work-pc)», плюс по одному на каждый из `extraFiles`.

- [ ] **Step 1: Тесты:** на фикстурах: `anthropic.com` при подборке anthropic → `presetsOn` содержит `anthropic`, `anthropic.com` нет в `mineDomains`; `rutracker.org` → в `mineDomains`; `www.sub.youtube.com`-подобный поддомен покрыт `youtube.com`; `91.108.4.0/22` при подборке telegram с `91.108.4.0/22` → не в `mineIps`; `160.79.104.0/23` из `workIps` при подборке anthropic → покрыт; служебные IP нигде не появляются; `enabled=false` → `state 'off'`; активный `.vless` → `state 'off'`, профиль в `skippedProfiles`; **`presetContent = {}` (подборки не скачались)** → все домены и не-служебные IP уходят в `mine*`, ничего не теряется.
- [ ] **Step 2–4:** FAIL → реализовать → PASS.
- [ ] **Step 5:** Commit `feat(app): планировщик миграции старой настройки`.

### Task 9: SSH-клиент, ключи, сопряжение, настройки

**Files:**
- Create: `app/src/main/ssh/{client,keys,pairing,gateway}.ts`, `app/src/main/settings.ts`, `app/test/{client,pairing}.test.ts`

**Interfaces:**
- Produces:
  - `class RouterClient { constructor(o: {host: string; privateKey?: Buffer; password?: string; hostKeySha256?: string}); connect(timeoutMs?: number): Promise<{hostKeySha256: string}>; exec(cmd: string, o?: {stdin?: string | Buffer; timeoutMs?: number}): Promise<{code: number; stdout: Buffer; stderr: string}>; execJson<T>(cmd: string, schema: ZodType<T>, o?): Promise<T>; stream(cmd: string, onLine: (l: string) => void, onEnd: (err?: Error) => void): {stop(): void}; writeFile(path: string, content: Buffer | string, mode: string): Promise<void>; close(): void }` — пользователь всегда `root`; `writeFile` = `exec("cat > " + shq(path) + " && chmod " + mode + " " + shq(path), {stdin})` (у dropbear нет sftp). Несовпадение отпечатка хоста → ошибка `HostKeyMismatch`.
  - `keys.ts`: `loadOrCreateAppKey(): {privateKey: Buffer; publicKey: string}` (ed25519 через `ssh2.utils.generateKeyPairSync('ed25519')`, приватный ключ хранится в `%APPDATA%\DomovenokNET\router_key.bin`, зашифрован `safeStorage`).
  - `gateway.ts`: `defaultGateway(): Promise<string | null>` (PowerShell `(Get-NetRoute -DestinationPrefix 0.0.0.0/0 | Sort-Object RouteMetric | Select-Object -First 1).NextHop`).
  - `pairing.ts`: `legacyKeyCandidates(): string[]` — `Key=` из `%APPDATA%\VpnTray\config.ini`, `C:\RouterVPN\router_key`, `%USERPROFILE%\.ssh\id_ed25519`; `pair(host: string, askPassword: () => Promise<string | null>): Promise<{client: RouterClient; hostKeySha256: string}>` — порядок: ключ программы → ключи-кандидаты → без пароля → пароль из `askPassword` (до 3 попыток); после входа не программным ключом — дописать открытый ключ в `/etc/dropbear/authorized_keys`, если его там нет.
  - `settings.ts`: `interface Settings { routerHost: string; hostKeySha256: string; autostart: boolean; deployedVersion: string }`; `loadSettings(): Settings`, `saveSettings(s: Settings): void` (`%APPDATA%\DomovenokNET\settings.json`).

- [ ] **Step 1: Тесты** (`client.test.ts` поднимает `ssh2.Server` на 127.0.0.1 с тестовым ключом хоста; `exec` отвечает эхом команды и stdin):
  - `exec` возвращает stdout и код; `writeFile('/x y', 'a', '600')` шлёт команду с `'/x y'` в кавычках и stdin `a`.
  - `execJson` с ответом `{"ok":false,"error":"нет профиля"}` → бросает ошибку с текстом `нет профиля`.
  - `connect` с неверным `hostKeySha256` → `HostKeyMismatch`.
  - `exec` с `timeoutMs: 100` на зависшей команде → ошибка таймаута, соединение остаётся пригодным.
  - `pair`: сервер принимает только пароль `secret` → `askPassword` вызван, после входа выполнена команда, дописывающая ключ в `authorized_keys`; повторный `pair` входит по ключу программы без `askPassword`.
- [ ] **Step 2–4:** FAIL → реализовать → PASS.
- [ ] **Step 5:** Commit `feat(app): SSH-клиент, ключ программы, сопряжение с роутером`.

### Task 10: API роутера, развёртывание скриптов, центр состояния

**Files:**
- Create: `app/src/main/router/{api,deploy}.ts`, `app/src/main/hub.ts`, `app/src/main/notify.ts`, `app/test/{api,hub}.test.ts`
- Modify: `app/electron-builder.yml` — `extraResources: [{from: ../router, to: router, filter: ['**/*', '!tests/**']}]`

**Interfaces:**
- Consumes: `RouterClient` (Task 9), типы и `shq`, `parseStatLine`, `computeRates` (Task 6).
- Produces:
  - `class RouterApi { constructor(c: RouterClient); status(): Promise<Status>; setState(s: TunnelState); restart(); profiles(): Promise<{active: string; profiles: {name: string; type: 'awg'|'wg'}[]}>; addProfile(p: ImportedProfile); useProfile(name: string): Promise<{healthy: boolean; rolledBack: boolean}>; removeProfile(name: string); presets(): Promise<Preset[]>; setPreset(id: string, on: boolean); updatePresets(): Promise<{updated: string[]; failed: string[]}>; mine(): Promise<{domains: string[]; ips: string[]}>; addMine(kind: 'domain'|'ip', value: string); removeMine(kind, value); diag(): Promise<DiagResult> }` — ответы проверяются zod-схемами; аргументы — только через `shq` и после `normalize*`/`isProfileName`.
  - `deploy.ts`: `deployRouterFiles(c: RouterClient, resourcesDir: string): Promise<{version: string; missing: string[]; legacy: boolean; freeKb: number}>` — до заливки проверяет `df -k /overlay`; меньше 2048 КБ → ошибка «На роутере мало места: нужно ~1,5 МБ, свободно N КБ» — заливает все файлы из `resources/router` по тем же путям (права `755` для `usr/bin/*`, `usr/lib/domovenok/*.sh`, `etc/init.d/*`, `etc/hotplug.d/**`; остальное `644`), затем `sh /usr/lib/domovenok/install.sh`.
  - `class Hub extends EventEmitter` — события `'status' (Status)`, `'connection' (Connection)`, `'rates' (Rates)`, `'ping' (number)`, `'health-lost'`, `'health-restored'`; методы `start()`, `setVisible(v: boolean)` (опрос статуса: 3 с при открытом окне, 15 с при закрытых; поток `domovenok stats` только когда окно видно), `api(): RouterApi`.
  - `notify.ts`: на `'health-lost'` — уведомление Windows «VPN не отвечает», текст «Нет связи с сервером VPN. Откройте «ДомовёнокNET» и нажмите «Проверить».», клик — открыть большое окно на вкладке «Роутер».
- Переподключение (Review Focus 2): при ошибке SSH — `connection = 'offline'`, повтор через 2, 5, 10, 30 с (дальше каждые 30 с); поток статистики перезапускается после переподключения; запросы API во время офлайна сразу отклоняются ошибкой «Роутер не отвечает».

- [ ] **Step 1: Тесты** (`RouterClient` подменён фейком):
  - `addMine('domain', 'a.com;reboot')` → бросает, `exec` не вызывался.
  - `status()` при ответе без поля `healthy` → ошибка схемы, а не `undefined` в UI.
  - `Hub`: фейк-клиент бросает при `exec` → событие `connection 'offline'`, через (фейковые таймеры) 2 с — повторное подключение; после успеха — `connection 'online'`.
  - `Hub`: статусы `healthy:true` → `false` → одно событие `health-lost`; `false` → `false` — без повторного.
  - `Hub`: поток выдаёт две строки `S …` → одно событие `rates` с числами из `computeRates`.
- [ ] **Step 2–4:** FAIL → реализовать → PASS.
- [ ] **Step 5:** Commit `feat(app): API роутера, развёртывание скриптов, центр состояния`.

### Task 11: Трей, окна, IPC, автозапуск, старая программа

**Files:**
- Create: `app/src/main/{tray,windows,autostart,legacy-app}.ts`, `app/src/shared/ipc.ts`, `app/src/preload/index.ts`, `app/resources/tray/{green,yellow,red,grey}.png` (16 и 32 px, круг), `app/scripts/make-icons.mjs`, `app/test/tray.test.ts`
- Modify: `app/src/main/index.ts`

**Interfaces:**
- Consumes: `Hub`, `RouterApi` (Task 10), `Settings` (Task 9).
- Produces:
  - `shared/ipc.ts`: интерфейс `DomovenokNETApi` (то, что preload кладёт в `window.domovenok`): `getStatus(): Promise<Status | null>`, `onStatus(cb)`, `onConnection(cb)`, `onRates(cb)`, `onPing(cb)` (каждый `on*` возвращает функцию отписки), `setState(s)`, `restart()`, `profiles()`, `importProfileFromPath(path: string)`, `importProfileString(s: string)`, `useProfile(name)`, `removeProfile(name)`, `presets()`, `setPreset(id, on)`, `updatePresets()`, `mine()`, `addMine(kind, value)`, `removeMine(kind, value)`, `diag()`, `openMain(tab?: string)`, `closeMini()`, `getAutostart()`, `setAutostart(on)`, плюс `pairing.*` и `migration.*` (Task 15). Все ответы — `{ok: true, data} | {ok: false, error: string}`.
  - `tray.ts`: `iconFor(conn: Connection, status: Status | null): 'green'|'yellow'|'red'|'grey'` — `offline` → grey; `busy` → yellow; `state==='off'` → red; `!healthy` → red; иначе green. Подсказка значка: «ДомовёнокNET — VPN работает · <профиль>» / «… — VPN выключен» / «… — VPN не отвечает» / «… — роутер не отвечает».
  - `class ClickRouter { constructor(onSingle: () => void, onDouble: () => void, delayMs = 300); click(); doubleClick() }` — одиночный срабатывает только если за `delayMs` не пришёл двойной.
  - Меню правого клика ровно: «Открыть», разделитель, «Перезапустить туннель», «Выключить туннель», разделитель, «Закрыть программу».
  - `windows.ts`: большое окно 640×760, `minWidth 560`, тёмный `backgroundColor '#0f1419'`, `titleBarStyle 'hidden'` + `titleBarOverlay {color:'#161b22', symbolColor:'#e6edf3'}`; закрытие крестиком прячет окно (программа остаётся в трее). Мини-окно 300×380, без рамки, `skipTaskbar`, `alwaysOnTop`, позиция — над значком трея в пределах `screen.getDisplayNearestPoint(...).workArea`; прячется по `blur`.
  - `autostart.ts`: `app.setLoginItemSettings({openAtLogin, args: ['--hidden']})`; по умолчанию включён.
  - `legacy-app.ts`: `removeLegacyApp(): Promise<string[]>` — `taskkill /IM VpnTray.exe /F` (ошибку «не найден» игнорировать), удалить значение `VpnTray` из `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`, удалить ярлык `%APPDATA%\Microsoft\Windows\Start Menu\Programs\VPN Tray.lnk`, если есть; возвращает список сделанного. Файлы старой программы не удаляет.
  - Один экземпляр: `app.requestSingleInstanceLock()`; второй запуск открывает большое окно.

- [ ] **Step 1: Тесты:** `iconFor` для всех пяти случаев; **Review Focus 1:** `ClickRouter` с фейковыми таймерами — `click()`, через 100 мс `doubleClick()` → `onDouble` 1 раз, `onSingle` 0 раз; `click()` и 300 мс тишины → `onSingle` 1 раз.
- [ ] **Step 2–4:** FAIL → реализовать → PASS.
- [ ] **Step 5:** `npm run dev` (на Windows) — значок появился; одиночный клик открывает мини-окно, двойной — большое, правый — меню из четырёх пунктов. Проверка вручную, без роутера значок серый.
- [ ] **Step 6:** Commit `feat(app): трей, мини-окно, большое окно, автозапуск`.

### Task 12: Интерфейс — оформление, «Обзор», мини-окно

**Files:**
- Create: `app/src/renderer/src/theme.css`, `components/{SpeedChart,StatusPill,Tile,StateSwitch}.tsx`, `pages/Overview.tsx`, `mini.tsx`, `app/test/speed-chart.test.tsx`
- Modify: `app/src/renderer/src/App.tsx` (навигация «Обзор · Списки · Профили · Роутер · Сервер»)

**Interfaces:**
- Consumes: `window.domovenok` (Task 11), `Rates`, `Status`.
- Produces: `<SpeedChart points: {vpn: number; direct: number}[] (до 60) height: number />` — SVG, две **открытые** линии (`fill="none"`, без замыкания контура), VPN `#6cc58a`, напрямую `#58a6ff`, толщина 2, масштаб по максимуму видимых точек (минимум шкалы 1 Мбит/с); `<StateSwitch value onChange />` — три сегмента «Выключен · Только список · Всё через VPN».

Макеты: `.superpowers/brainstorm/219703-1792661652/content/dashboard-layout-v6.html` (обзор) и `tray-modes-v2.html` (мини-окно) — повторить расположение, цвета и размеры шрифтов. Плашка статуса: «● Защищено · <профиль>» (зелёная) / «● VPN выключен» / «● VPN не отвечает» (красная) / «● Роутер не отвечает» (серая). Большая цифра — `down`, 88 px, `font-weight 300`, `tabular-nums`; число анимируется плавно (rAF-интерполяция ~300 мс). Строка отдачи «↑ <up> Мбит/с отдача» цветом `#8b9cf7`. Подпись графика: «через VPN · напрямую · последние 60 с». Плитки: «Режим», «Через VPN», «Напрямую», «Пинг до сервера» (`P -1` → «нет ответа»). Мини-окно: крестик `✕` в правом верхнем углу (`closeMini`), цифра 44 px, график 40 px, плитки «Режим» и «Пинг», кнопки «Режим ⇄» (циклически `list → full → off → list`), «Перезапуск», «Выключить».

- [ ] **Step 1: Тест** `speed-chart.test.tsx`: рендер с 3 точками → два `<path>`, у обоих `fill="none"`, ни один `d` не заканчивается на `Z`; пустой массив → нет ошибок.
- [ ] **Step 2–4:** FAIL → реализовать → PASS.
- [ ] **Step 5:** `npm run dev` с подключённым роутером — цифра и график живые, сверить с макетами.
- [ ] **Step 6:** Commit `feat(ui): обзор с табло скорости и мини-окно`.

### Task 13: Интерфейс — «Списки»

**Files:**
- Create: `app/src/renderer/src/pages/Lists.tsx`, `app/test/lists.test.tsx`

**Interfaces:**
- Consumes: `presets()`, `setPreset`, `updatePresets`, `mine`, `addMine`, `removeMine` из `window.domovenok`; `normalizeDomain`, `normalizeIp` (Task 6).

Раздел «Подборки»: галочка + название; под ней серым — `sample.join(', ')` и «… и ещё N» (N = `domains + subnets − sample.length`, если > 0); «обновлено <дата>» или «ещё не скачано». Кнопка «Обновить» вызывает `updatePresets`; при `failed` — «Не удалось обновить: <названия>. Используются прежние списки.». Раздел «Мои сайты»: поле + «Добавить», список с удалением; ввод нормализуется до отправки, невалидный — подпись «Это не похоже на адрес сайта». Свёрнутый блок «Дополнительно: IP и подсети» — то же для IP («Пример: 1.2.3.4 или 1.2.3.0/24»). Внизу — постоянная подсказка: «Если в браузере включён «безопасный DNS» (DNS через HTTPS), сайты из списков на этом устройстве пойдут мимо VPN. Отключите его в настройках браузера.».

- [ ] **Step 1: Тесты:** подборка `{domains: 15, subnets: 0, sample: ['a.com','b.com','c.com']}` → текст «a.com, b.com, c.com … и ещё 12»; ввод `https://www.YouTube.com/x` + «Добавить» → `addMine('domain', 'youtube.com')`; ввод `a.com;reboot` → `addMine` не вызван, видна подпись ошибки.
- [ ] **Step 2–4:** FAIL → реализовать → PASS.
- [ ] **Step 5:** Commit `feat(ui): подборки и мои сайты`.

### Task 14: Интерфейс — «Профили» и «Сервер»

**Files:**
- Create: `app/src/renderer/src/pages/{Profiles,Server}.tsx`, `app/test/profiles.test.tsx`
- Modify: `app/src/main/index.ts` — обработчики `importProfileFromPath` (читает файл, `importProfileFile` из Task 7, `api.addProfile`) и `importProfileString`.

Список профилей: имя, тип («AmneziaWG»/«WireGuard»), активный отмечен; «Подключить» (`useProfile`; при `rolledBack` — «Профиль <имя> не подключился, вернулся на <старый>»; при `healthy:false` — «Профиль не подключился: сервер не отвечает»), «Удалить» (с подтверждением; активный удалить нельзя). Добавление: зона перетаскивания файлов `.conf`/`.awg`, кнопка «Выбрать файл», поле «Вставьте строку vpn://» + кнопка «Вставить из буфера». Сообщения `ImportError`: `not_vpn` «Это не строка подключения Amnezia», `admin_profile` «Это админский профиль — его поддержка появится в разделе «Сервер»», `no_config`/`bad_config` «В профиле нет нужных данных для подключения». «Сервер» — заглушка: «Здесь появится управление сервером Amnezia: выпуск профилей для друзей, QR-коды, отзыв доступа.».

- [ ] **Step 1: Тесты:** ответ `useProfile` `{healthy: true, rolledBack: true}` → видно «вернулся на»; кнопка «Удалить» у активного профиля отключена; ошибка `admin_profile` → нужный текст.
- [ ] **Step 2–4:** FAIL → реализовать → PASS.
- [ ] **Step 5:** Commit `feat(ui): профили и заглушка сервера`.

### Task 15: Сопряжение, «Роутер», миграция (роутер + программа + мастер)

**Files:**
- Create: `router/usr/lib/domovenok/{migrate,rollback}.sh`, `router/tests/migrate.bats`, `app/src/main/migration/{detect,run}.ts`, `app/src/renderer/src/pages/{Router,Pairing,Migration}.tsx`, `app/test/migration-run.test.ts`

**Interfaces:**
- Consumes: `pair`, `RouterClient` (Task 9), `deployRouterFiles`, `RouterApi` (Task 10), `planMigration` (Task 8), `removeLegacyApp` (Task 11).
- Produces:
  - `detect.ts`: `detectLegacy(c: RouterClient): Promise<LegacyInstall | null>` (`null`, если нет `/usr/bin/wgsw`); читает `/etc/wg-profiles/*`, `.active`, `.enabled`, `/etc/vpnsplit/{mode,tunnel-domains.txt,tunnel-ips.txt,work-ips.txt}`, `extraFiles` = содержимое `/etc/vpnsplit`, не входящее в известный набор файлов старого репозитория.
  - `run.ts`: `backupLegacy(c): Promise<string>` (путь архива в `%APPDATA%\DomovenokNET\backups\<YYYYMMDD-HHMMSS>.tar.gz`); `commitMigration(c, plan: MigrationPlan, profilesContent: Record<string, string>): Promise<void>`; `rollbackMigration(c, archivePath: string): Promise<void>`.
  - IPC: `pairing.start()`, `pairing.submitPassword(p)`, `migration.detect()`, `migration.plan()`, `migration.commit()`, `migration.rollback()`, `migration.lastBackup()`.

Бэкап (на роутере, вывод в stdout): `tar czf - /usr/bin/wgsw /usr/bin/vpnmode /usr/bin/vps-check /usr/bin/blackbox /usr/lib/vpnctl.sh /etc/vpnsplit /etc/wg-profiles /etc/init.d/vpnsplit /etc/init.d/vpnawg /etc/hotplug.d/ntp/50-wg-after-timesync /etc/hotplug.d/iface/90-wan-direct-table /etc/crontabs/root /etc/config/dhcp /etc/config/network /etc/config/firewall` (отсутствующие пути пропускать). Архив сохраняется **до** любых изменений; без успешного бэкапа миграция не начинается.

`migrate.sh` (на роутере, после того как программа записала профили, `state`, `presets.enabled`, `mine-*`): остановить и выключить `vpnsplit`, `vpnawg`; `nft delete table inet vpnsplit`; удалить UCI-секции `dhcp` с `table='vpnsplit'`; убрать `blackbox` из crontab; удалить старые файлы из списка бэкапа (кроме `/etc/config/*` и `crontabs`) и `/root/blackbox`; **не трогать** `network.ocvpn`, `firewall.vpnzone`, `network.wg0`; затем `install.sh`, `/etc/init.d/domovenok enable && start`, при state≠off — `domovenok profile use <active>`. `rollback.sh` (архив в stdin): `/etc/init.d/domovenok stop/disable`, `nft delete table inet domovenok`, удалить файлы domovenok и cron-строку, распаковать архив в `/`, `/etc/init.d/vpnsplit enable && start`, `/etc/init.d/vpnawg enable`, `/etc/init.d/dnsmasq restart`, `wgsw on`, если в бэкапе `.enabled` = 1.

Мастер (порядок экранов): «Подключение к роутеру» (`Pairing`: адрес из `defaultGateway`, поле адреса можно изменить; запрос пароля root при необходимости) → `deployRouterFiles` → если `legacy` — `migration.detect` → `updatePresets` (ошибка не прерывает: план строится с тем, что скачалось) → экран плана: «Будет перенесено: N профилей, подборки: …, Мои сайты: N, Мои IP: N, режим: …» и «Будет удалено: …» (`removed`, `skippedProfiles`) → кнопка «Перенести» → бэкап → `commitMigration` → ожидание статуса до 60 с → итог «Готово» или «VPN пока не поднялся. Интернет напрямую: <есть/нет>. [Откатить] [Оставить и проверить]» → `removeLegacyApp`. На вкладке «Роутер» всегда: адрес и модель роутера, версия скриптов, кнопка «Проверить» (вывод `diag`: список проверок с ✓/✗ и `message` крупно), «Обновить скрипты на роутере», «Открыть веб-интерфейс роутера», переключатель «Запускать вместе с Windows», «Откатить миграцию» (если есть бэкап).

- [ ] **Step 1: Тесты:** `migrate.bats` — после `migrate.sh` на фикстурном корне нет `usr/bin/wgsw` и `etc/vpnsplit`, есть `etc/domovenok/state`; в calls.log нет `uci delete network.ocvpn` / `firewall.vpnzone`; `rollback.sh` с архивом из фикстуры возвращает `usr/bin/wgsw`. `migration-run.test.ts` (фейк-клиент): `commitMigration` при упавшем `backupLegacy` не выполняет ни одной команды изменения; порядок вызовов — бэкап → запись профилей → запись state/presets/mine → `migrate.sh`.
- [ ] **Step 2–4:** FAIL → реализовать → PASS (`npm test`, `npm run test:router`).
- [ ] **Step 5:** Commit `feat: сопряжение, вкладка «Роутер», миграция с откатом`.

### Task 16: Сборка, выпуск, уборка репозитория

**Files:**
- Create: `app/electron-builder.yml` (дополнить), `.github/workflows/{test,release}.yml`, `docs/smartscreen.png` (скриншот-подсказка — нарисовать схематично или оставить текстом, если картинки нет)
- Modify: `README.md` (полностью: что это, установка, синее окно SmartScreen «Подробнее → Выполнить в любом случае», как обновляется, где данные), `.gitignore`
- Delete: старые файлы (см. «Структура файлов»), `router/etc/vpnsplit/lists/*` (личные данные автора уходят вместе с ними)

- electron-builder: `appId ru.domovenoknet.app`, `productName ДомовёнокNET`, `win.target nsis`, `nsis.oneClick false`, `nsis.perMachine false`, `publish: {provider: github, owner, repo}` из `REPO`; electron-updater: проверка при запуске и раз в 6 часов, установка при выходе, уведомление «Доступна новая версия».
- `test.yml`: ubuntu — `npm ci`, `npm test`, `npm run test:router`, `npm run typecheck`. `release.yml`: по тегу `v*` на `windows-latest` — `npm ci && npm run build && npx electron-builder --win --publish always`.

- [ ] **Step 1:** поиск личных данных автора (IP рабочего ПК, название VPN-провайдера) по репозиторию → пусто вне `docs/` и тестовых фикстур (фикстуры обезличены).
- [ ] **Step 2:** `npm test && npm run test:router && npm run typecheck` → всё зелёное.
- [ ] **Step 3:** Commit `chore: сборка установщика, выпуск через GitHub, уборка старой версии`.

### Task 17: Приёмка на роутере автора (вручную, с автором)

Выполняется только когда автор рядом и подтвердил начало. Ничего на роутере не менять без его «да».

- [ ] **Step 1:** Собрать установщик на Windows (`npm run build && npx electron-builder --win --dir` или из CI), установить.
- [ ] **Step 2:** Мастер: сопряжение по старому ключу `C:\RouterVPN\router_key` — без вопроса о пароле.
- [ ] **Step 3:** Экран плана: 6 WireGuard + 1 AmneziaWG профиль, активный `myvps_awg`, режим «Только список»; подборки включают anthropic, openai, youtube, discord, telegram, jetbrains, google_ai, meta; RuTracker, фотохостинги и прочие личные сайты — в «Моих сайтах». Показать автору, получить «да».
- [ ] **Step 4:** «Перенести». Проверить: значок зелёный в течение 60 с; claude.ai и youtube.com открываются; внешний IP для обычного сайта — провайдера; `ocvpn` на месте (`uci show network.ocvpn`).
- [ ] **Step 5:** Проверить сторож: выключить сервер нельзя — вместо этого `domovenok profile use` на заведомо нерабочий профиль-копию с испорченным ключом → значок красный, уведомление, обычные сайты открываются (DNS-фолбэк), `domovenok diag` → вердикт `profile`. Вернуть рабочий профиль.
- [ ] **Step 6:** Перезагрузить роутер → после загрузки значок зелёный без вмешательства.
- [ ] **Step 7:** Записать итог в `docs/superpowers/specs/…` (раздел «Приёмка части 1»), commit.
