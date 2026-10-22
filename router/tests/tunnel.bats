load helper

NOW=1700000000

setup() {
  setup_root
  export DOMOVENOK_NOW=$NOW DOMOVENOK_SLEEP=0
  P="$(etc profiles)"
  printf '[Interface]\nPrivateKey = a\nAddress = 10.8.1.5/32\nJc = 4\n[Peer]\nPublicKey = b\nEndpoint = 1.2.3.4:443\n' > "$P/old.awg"
  printf '[Interface]\nPrivateKey = c\nAddress = 10.66.66.2/32\n[Peer]\nPublicKey = d\nEndpoint = 5.6.7.8:51820\n' > "$P/new.conf"
  echo old > "$P/.active"
  echo list > "$(etc state)"
}

@test "hs_age: рукопожатие 30 с назад" {
  printf 'peer\t%s\n' $((NOW - 30)) > "$STUBDATA/hs.awg0"
  run lib hs_age
  [ "$output" = 30 ]
}

@test "hs_age: рукопожатия не было" {
  run lib hs_age
  [ "$output" = 999999 ]
}

@test "сторож, list, рукопожатие 200 с назад: DNS через провайдера" {
  printf 'peer\t%s\n' $((NOW - 200)) > "$STUBDATA/hs.awg0"
  lib wd_tick
  grep -q 'nft add element inet domovenok dnsfb4 { 1.1.1.1, 8.8.8.8 }' "$CALLS"
  [ "$(cat "$DOMOVENOK_ROOT/tmp/domovenok/health")" = 0 ]
}

@test "сторож, list, рукопожатие вернулось: фолбэк снят" {
  echo 0 > "$DOMOVENOK_ROOT/tmp/domovenok/health"
  printf 'peer\t%s\n' $((NOW - 10)) > "$STUBDATA/hs.awg0"
  lib wd_tick
  grep -q 'nft flush set inet domovenok dnsfb4' "$CALLS"
  ! grep -q 'add element inet domovenok dnsfb4' "$CALLS"
  [ "$(cat "$DOMOVENOK_ROOT/tmp/domovenok/health")" = 1 ]
}

@test "сторож, full, рукопожатие 200 с назад: напрямую ничего не пускаем" {
  echo full > "$(etc state)"
  printf 'peer\t%s\n' $((NOW - 200)) > "$STUBDATA/hs.awg0"
  lib wd_tick
  ! grep -q 'add element inet domovenok dnsfb4' "$CALLS"
  grep -q 'nft flush set inet domovenok dnsfb4' "$CALLS"
  [ "$(cat "$DOMOVENOK_ROOT/tmp/domovenok/health")" = 0 ]
}

@test "profile_use: новый не поднялся — откат на рабочий старый" {
  printf 'peer\t%s\n' $NOW > "$STUBDATA/hs.awg0"
  run lib profile_use new
  [ "$status" -eq 0 ]
  echo "$output" | grep -q '"rolled_back":true'
  echo "$output" | grep -q '"healthy":true'
  [ "$(cat "$(etc profiles)/.active")" = old ]
}

@test "profile_use: не поднялся ни новый, ни старый — туннель остаётся включённым" {
  run lib profile_use new
  [ "$status" -eq 0 ]
  echo "$output" | grep -q '"healthy":false'
  echo "$output" | grep -q '"rolled_back":false'
  [ "$(cat "$(etc profiles)/.active")" = new ]
  [ "$(cat "$(etc state)")" = list ]
}

@test "profile_use: недопустимое имя" {
  run lib profile_use ../x
  [ "$status" -eq 1 ]
  echo "$output" | grep -q '"ok":false'
}

@test "profile_use при выключенном туннеле только выбирает профиль" {
  echo off > "$(etc state)"
  run lib profile_use new
  [ "$status" -eq 0 ]
  [ "$(cat "$(etc profiles)/.active")" = new ]
  ! grep -q 'ifup' "$CALLS"
}

@test "fix: AmneziaWG не трогает маршрут по умолчанию провайдера" {
  lib aw_start old
  grep -q 'ip route replace 0.0.0.0/1 dev awg0' "$CALLS"
  grep -q 'ip route replace 128.0.0.0/1 dev awg0' "$CALLS"
  ! grep -q 'route replace default' "$CALLS"
  lib aw_stop
  ! grep -q 'route del default' "$CALLS"
}
