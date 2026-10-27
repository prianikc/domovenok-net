load helper

NOW=1700000000

setup() {
  setup_root
  export DOMOVENOK_NOW=$NOW DOMOVENOK_SLEEP=0
  printf '[Interface]\nPrivateKey = a\nAddress = 10.8.1.5/32\nJc = 4\n[Peer]\nPublicKey = b\nEndpoint = 1.2.3.4:443\n' > "$(etc profiles)/myvps_awg.awg"
  echo myvps_awg > "$(etc profiles)/.active"
  echo list > "$(etc state)"
  echo 'VERSION=2.0.0' > "$(etc config)"
}

cli() { sh "$REPO_ROUTER/usr/bin/domovenok" "$@"; }

@test "mine add domain: попытка внедрить команду отклонена" {
  run cli mine add domain 'a.com;reboot'
  [ "$status" -eq 1 ]
  echo "$output" | grep -q '"ok":false'
  [ ! -s "$(etc mine-domains.txt)" ]
}

@test "mine add domain: регистр приводится, дубли не появляются" {
  cli mine add domain YouTube.com
  cli mine add domain youtube.com
  [ "$(cat "$(etc mine-domains.txt)")" = youtube.com ]
  run cli mine list
  echo "$output" | grep -q '"domains":\["youtube.com"\]'
}

@test "mine add ip: подсеть принимается, мусор нет" {
  run cli mine add ip 1.2.3.0/24
  [ "$status" -eq 0 ]
  run cli mine add ip 1.2.3.0/33
  [ "$status" -eq 1 ]
  run cli mine add ip 300.1.1.1
  [ "$status" -eq 1 ]
  [ "$(cat "$(etc mine-ips.txt)")" = 1.2.3.0/24 ]
}

@test "mine rm удаляет запись" {
  cli mine add domain a.com
  cli mine add domain b.com
  cli mine rm domain a.com
  [ "$(cat "$(etc mine-domains.txt)")" = b.com ]
}

@test "mine add-list: сайты и подсети вперемешку раскладываются по спискам" {
  echo old.com > "$(etc mine-domains.txt)"
  run sh -c "printf 'Nexusmods.com\r\nold.com\n104.16.0.0/12\n\n1.2.3.4\nnexus-cdn.com\nnexus-cdn.com\n' | sh '$REPO_ROUTER/usr/bin/domovenok' mine add-list"
  [ "$status" -eq 0 ]
  echo "$output" | grep -q '"domains":2,"ips":2,"existed":1,"bad":\[\]'
  [ "$(cat "$(etc mine-domains.txt)")" = "$(printf 'old.com\nnexusmods.com\nnexus-cdn.com')" ]
  [ "$(cat "$(etc mine-ips.txt)")" = "$(printf '104.16.0.0/12\n1.2.3.4')" ]
  [ "$(grep -c '^nft -f ' "$CALLS")" -eq 1 ]
}

@test "mine add-list: непонятные строки не записываются и возвращаются" {
  run sh -c "printf 'a.com\na.com;reboot\n300.1.1.1\n' | sh '$REPO_ROUTER/usr/bin/domovenok' mine add-list"
  [ "$status" -eq 0 ]
  echo "$output" | grep -q '"domains":1,"ips":0,"existed":0,"bad":\["a.com;reboot","300.1.1.1"\]'
  [ "$(cat "$(etc mine-domains.txt)")" = a.com ]
  [ ! -s "$(etc mine-ips.txt)" ]
}

@test "mine add-list: больше 1000 строк — отказ, списки не тронуты" {
  run sh -c "seq 1 1001 | sed 's/$/.example.com/' | sh '$REPO_ROUTER/usr/bin/domovenok' mine add-list"
  [ "$status" -eq 1 ]
  echo "$output" | grep -q '"ok":false'
  [ ! -s "$(etc mine-domains.txt)" ]
}

@test "state list применяет правила" {
  echo off > "$(etc state)"
  run cli state list
  echo "$output" | grep -q '"state":"list"'
  [ "$(cat "$(etc state)")" = list ]
  grep -q '^nft -f ' "$CALLS"
}

@test "state: неизвестное значение — ошибка" {
  run cli state maybe
  [ "$status" -eq 1 ]
}

@test "status: профиль, тип, здоровье" {
  printf 'peer\t%s\n' $((NOW - 20)) > "$STUBDATA/hs.awg0"
  run cli status
  [ "$status" -eq 0 ]
  echo "$output" | grep -q '"state":"list"'
  echo "$output" | grep -q '"profile":"myvps_awg"'
  echo "$output" | grep -q '"type":"awg"'
  echo "$output" | grep -q '"healthy":true'
  echo "$output" | grep -q '"hs_age":20'
  echo "$output" | grep -q '"dns_fallback":false'
  echo "$output" | grep -q '"endpoint":"1.2.3.4"'
}

@test "diag: провайдер есть, сервер не отвечает -> server" {
  echo 1.2.3.4 > "$STUBDATA/ping.fail"
  run cli diag
  echo "$output" | grep -q '"verdict":"server"'
}

@test "diag: нет интернета у провайдера -> provider" {
  printf '77.88.8.8\n1.2.3.4\n' > "$STUBDATA/ping.fail"
  run cli diag
  echo "$output" | grep -q '"verdict":"provider"'
}

@test "diag: сервер доступен, рукопожатия нет -> profile" {
  run cli diag
  echo "$output" | grep -q '"verdict":"profile"'
}

@test "diag: всё в порядке -> ok" {
  printf 'peer\t%s\n' $((NOW - 20)) > "$STUBDATA/hs.awg0"
  run cli diag
  echo "$output" | grep -q '"verdict":"ok"'
  echo "$output" | grep -q '"id":"tunnel_ping","ok":true'
  grep -q 'ping -c2 -W2 -I awg0 10.8.1.1' "$CALLS"
}

@test "profile add: конфиг из stdin, неверное имя отклоняется" {
  printf '[Interface]\nPrivateKey = z\n' | cli profile add fr wg
  [ -f "$(etc profiles)/fr.conf" ]
  run sh -c "printf '[Interface]\n' | sh '$REPO_ROUTER/usr/bin/domovenok' profile add '../x' wg"
  [ "$status" -eq 1 ]
  run cli profile list
  echo "$output" | grep -q '"active":"myvps_awg"'
  echo "$output" | grep -q '{"name":"fr","type":"wg"}'
}

@test "profile rm: активный удалить нельзя" {
  run cli profile rm myvps_awg
  [ "$status" -eq 1 ]
  [ -f "$(etc profiles)/myvps_awg.awg" ]
}

@test "stats: строка счётчиков из /proc/net/dev" {
  mkdir -p "$DOMOVENOK_ROOT/proc/net"
  cat > "$DOMOVENOK_ROOT/proc/net/dev" <<'DEV'
Inter-|   Receive                                                |  Transmit
 face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets errs drop fifo colls carrier compressed
   wan: 1000 10 0 0 0 0 0 0 2000 20 0 0 0 0 0 0
  awg0: 300 3 0 0 0 0 0 0 400 4 0 0 0 0 0 0
DEV
  run sh -c ". '$DOMOVENOK_LIB/common.sh'; . '$DOMOVENOK_LIB/tunnel.sh'; . '$DOMOVENOK_LIB/stats.sh'; stats_sample"
  [ "$output" = "S $NOW 1000 2000 10 20 300 400 3 4" ]
}

@test "install.sh: идемпотентно, при старой установке не включает сервис" {
  mkdir -p "$DOMOVENOK_ROOT/usr/bin" "$DOMOVENOK_ROOT/etc/crontabs" "$DOMOVENOK_ROOT/etc/init.d"
  printf '#!/bin/sh\necho "init.d/domovenok $*" >> "$CALLS"\n' > "$DOMOVENOK_ROOT/etc/init.d/domovenok"
  touch "$DOMOVENOK_ROOT/usr/bin/wgsw"; chmod +x "$DOMOVENOK_ROOT/usr/bin/wgsw" "$DOMOVENOK_ROOT/etc/init.d/domovenok"
  echo 'kmod-amneziawg' > "$STUBDATA/apk.missing"
  sh "$DOMOVENOK_LIB/install.sh" > /dev/null
  run sh "$DOMOVENOK_LIB/install.sh"
  echo "$output" | grep -q '"legacy":true'
  echo "$output" | grep -q '"missing":\["kmod-amneziawg"\]'
  [ "$(grep -c 'domovenok presets update' "$DOMOVENOK_ROOT/etc/crontabs/root")" -eq 1 ]
  [ "$(grep -c "uci add network rule" "$CALLS")" -le 1 ]
  ! grep -q 'init.d/domovenok enable' "$CALLS"
  [ "$(cat "$(etc state)")" = list ]
}

@test "install.sh: без старой установки включает и запускает сервис" {
  mkdir -p "$DOMOVENOK_ROOT/etc/init.d"
  printf '#!/bin/sh\necho "init.d/domovenok $*" >> "$CALLS"\n' > "$DOMOVENOK_ROOT/etc/init.d/domovenok"
  chmod +x "$DOMOVENOK_ROOT/etc/init.d/domovenok"
  rm -f "$(etc state)"
  run sh "$DOMOVENOK_LIB/install.sh"
  echo "$output" | grep -q '"legacy":false'
  grep -q 'init.d/domovenok enable' "$CALLS"
  [ "$(cat "$(etc state)")" = off ]
}

@test "fix: stats печатает счётчики больше 2^31 без обрезки" {
  mkdir -p "$DOMOVENOK_ROOT/proc/net"
  printf 'h\nh\n   wan: 5000000000 10 0 0 0 0 0 0 2000 20 0 0 0 0 0 0\n' > "$DOMOVENOK_ROOT/proc/net/dev"
  run sh -c ". '$DOMOVENOK_LIB/common.sh'; . '$DOMOVENOK_LIB/tunnel.sh'; . '$DOMOVENOK_LIB/stats.sh'; stats_sample"
  [ "$output" = "S $NOW 5000000000 2000 10 20 0 0 0 0" ]
}

@test "fix: изменяющие команды берут блокировку" {
  cli state full
  grep -q '^lock /var/lock/domovenok$' "$CALLS"
  grep -q '^lock -u /var/lock/domovenok$' "$CALLS"
}
