load helper

setup() {
  setup_root
  mkdir -p "$STUBDATA/web" "$(etc seed)/own"
  cat > "$(etc catalog.txt)" <<'CAT'
youtube|YouTube|https://example.org/youtube.lst|
telegram|Telegram|https://example.org/telegram.lst|https://example.org/cidr.txt
anthropic|Claude (Anthropic)|own/anthropic.lst|
CAT
}

@test "обновление пишет очищенный список и отметку времени" {
  printf 'youtube.com\n# комментарий\nGoogleVideo.com\r\nytimg.com\n' > "$STUBDATA/web/youtube.lst"
  DOMOVENOK_NOW=1700000000 run lib presets_update youtube
  [ "$status" -eq 0 ]
  echo "$output" | grep -qx 'updated youtube'
  [ "$(cat "$(etc cache)/youtube.domains")" = "youtube.com
googlevideo.com
ytimg.com" ]
  [ "$(cat "$(etc cache)/youtube.updated")" = 1700000000 ]
}

@test "HTML вместо списка: подборка не обновлена, старый список цел" {
  echo old.com > "$(etc cache)/youtube.domains"
  printf '<html>\n<body>404 Not Found</body>\n</html>\n' > "$STUBDATA/web/youtube.lst"
  run lib presets_update youtube
  echo "$output" | grep -qx 'failed youtube'
  [ "$(cat "$(etc cache)/youtube.domains")" = old.com ]
}

@test "пустой ответ: подборка не обновлена" {
  echo old.com > "$(etc cache)/youtube.domains"
  : > "$STUBDATA/web/youtube.lst"
  run lib presets_update youtube
  echo "$output" | grep -qx 'failed youtube'
  [ "$(cat "$(etc cache)/youtube.domains")" = old.com ]
}

@test "источник недоступен: подборка не обновлена" {
  echo old.com > "$(etc cache)/youtube.domains"
  run lib presets_update youtube
  echo "$output" | grep -qx 'failed youtube'
  [ "$(cat "$(etc cache)/youtube.domains")" = old.com ]
}

@test "подсети: IPv6-строки пропускаются, IPv4 сохраняются" {
  printf 'telegram.org\n' > "$STUBDATA/web/telegram.lst"
  printf '91.108.4.0/22\n149.154.160.0/20\n2001:b28:f23d::/48\n' > "$STUBDATA/web/cidr.txt"
  run lib presets_update telegram
  echo "$output" | grep -qx 'updated telegram'
  [ "$(cat "$(etc cache)/telegram.subnets")" = "91.108.4.0/22
149.154.160.0/20" ]
}

@test "свой список: при недоступности сети берётся из seed" {
  printf 'anthropic.com\nclaude.ai\n' > "$(etc seed)/own/anthropic.lst"
  run lib presets_update anthropic
  echo "$output" | grep -qx 'updated anthropic'
  grep -qx claude.ai "$(etc cache)/anthropic.domains"
}

@test "presets_list_json: счётчики, примеры, включённость" {
  echo youtube > "$(etc presets.enabled)"
  for i in $(seq 1 15); do echo "d$i.com"; done > "$(etc cache)/youtube.domains"
  echo 1700000000 > "$(etc cache)/youtube.updated"
  run lib presets_list_json
  echo "$output" | grep -q '{"id":"youtube","title":"YouTube","enabled":true,"updated":1700000000,"domains":15,"subnets":0,"sample":\["d1.com","d2.com","d3.com"\]}'
  echo "$output" | grep -q '"id":"telegram","title":"Telegram","enabled":false,"updated":0,"domains":0'
}

@test "dnsmasq_gen: nftset по 50 доменов, без дублей" {
  echo list > "$(etc state)"
  echo youtube > "$(etc presets.enabled)"
  for i in $(seq 1 60); do echo "d$i.com"; done > "$(etc cache)/youtube.domains"
  printf 'd1.com\nmy.org\n' > "$(etc mine-domains.txt)"
  run lib dnsmasq_gen
  [ "$(echo "$output" | wc -l)" -eq 2 ]
  echo "$output" | head -1 | grep -qE '^nftset=/d1\.com/.*/d50\.com/4#inet#domovenok#dyn_tun4$'
  [ "$(echo "$output" | tr '/' '\n' | grep -cx d1.com)" -eq 1 ]
  echo "$output" | grep -q '/my.org/'
}

@test "dnsmasq_gen: при off пусто" {
  echo off > "$(etc state)"
  echo youtube > "$(etc presets.enabled)"
  echo a.com > "$(etc cache)/youtube.domains"
  run lib dnsmasq_gen
  [ -z "$output" ]
}

@test "presets_set: неизвестная подборка — ошибка" {
  run lib presets_set nope on
  [ "$status" -ne 0 ]
  lib presets_set youtube on
  grep -qx youtube "$(etc presets.enabled)"
  lib presets_set youtube on
  [ "$(grep -cx youtube "$(etc presets.enabled)")" -eq 1 ]
  lib presets_set youtube off
  ! grep -qx youtube "$(etc presets.enabled)"
}

@test "каталог репозитория разбирается: 11 подборок" {
  cp "$REPO_ROUTER/../presets/catalog.txt" "$(etc catalog.txt)"
  run lib 'catalog | wc -l'
  [ "$output" -eq 11 ]
}

@test "fix: неверные IP в подсетях отбрасываются" {
  printf 'telegram.org\n' > "$STUBDATA/web/telegram.lst"
  printf '91.108.4.0/22\n999.1.1.1/99\n10.0.0.0/8\n' > "$STUBDATA/web/cidr.txt"
  lib presets_update telegram
  [ "$(cat "$(etc cache)/telegram.subnets")" = "91.108.4.0/22
10.0.0.0/8" ]
}
