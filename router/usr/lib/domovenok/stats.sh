#!/bin/sh
# ДомовёнокNET: поток для табло скорости.
#   S <время> <wan rx/tx байт> <wan rx/tx пакетов> <туннель rx/tx байт> <туннель rx/tx пакетов> — раз в секунду
#   P <мс | -1> — пинг сервера через WAN, раз в 5 секунд
#   H <0|1>     — здоровье туннеля (по сторожу), раз в минуту

wan_dev(){ D=$(uci -q get network.wan.device); echo "${D:-wan}"; }

stats_sample(){
  awk -v w="$(wan_dev)" -v t="$(tun_dev)" -v now="$(now)" '
    { sub(/^ +/, ""); split($0, a, /:[ ]*/); name = a[1]; split(a[2], f, / +/) }
    name == w { wr = f[1]; wrp = f[2]; wt = f[9]; wtp = f[10] }
    t != "" && name == t { tr = f[1]; trp = f[2]; tt = f[9]; ttp = f[10] }
    END { printf "S %s %.0f %.0f %.0f %.0f %.0f %.0f %.0f %.0f\n", now, wr, wt, wrp, wtp, tr, tt, trp, ttp }' "$ROOT/proc/net/dev"
}

stats_ping(){
  EP=$(endpoint_ip)
  [ -n "$EP" ] || { echo "P -1"; return; }
  MS=$(ping -c1 -W1 -I "$(wan_dev)" "$EP" 2>/dev/null | sed -n 's/.*= [0-9.]*\/\([0-9.]*\)\/.*/\1/p' | cut -d. -f1)
  echo "P ${MS:--1}"
}

stats_loop(){
  I=0
  while :; do
    stats_sample
    [ $((I % 5)) -eq 0 ] && stats_ping
    [ $((I % 60)) -eq 0 ] && echo "H $(cat "$RUN/health" 2>/dev/null || echo 0)"
    I=$((I + 1)); sleep 1
  done
}
