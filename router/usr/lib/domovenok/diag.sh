#!/bin/sh
# ДомовёнокNET: проверка «что не так» по кнопке «Проверить».

check(){ # $1 = id, $2 = 0|1, $3 = подробности
  [ -n "$CHECKS" ] && CHECKS="$CHECKS,"
  if [ "$2" = 1 ]; then OKV=true; else OKV=false; fi
  CHECKS="$CHECKS{\"id\":\"$1\",\"ok\":$OKV,\"detail\":$(json_str "$3")}"
  eval "C_$1=$2"
}

pings(){ ping -c2 -W2 -I "$1" "$2" >/dev/null 2>&1; }

diag_json(){
  CHECKS=''
  if [ "$(state_get)" = off ]; then
    printf '{"ok":true,"checks":[],"verdict":"router","message":"Туннель выключен"}\n'; return
  fi
  DEV=$(tun_dev); WAN=$(wan_dev); EP=$(endpoint_ip)
  AGE=$(hs_age)
  if [ "$AGE" -lt 180 ]; then check handshake 1 "$AGE с назад"; else check handshake 0 "нет рукопожатия"; fi
  ADDR=$(prof_val "$(prof_file "$(active)")" Address | cut -d, -f1 | cut -d/ -f1)
  INNER=${ADDR%.*}.1
  if pings "$DEV" "$INNER"; then check tunnel_ping 1 "$INNER отвечает"; else check tunnel_ping 0 "$INNER не отвечает"; fi
  DNS1=$(dns_servers | head -1)
  if nslookup openwrt.org "$DNS1" >/dev/null 2>&1; then check dns 1 "$DNS1 отвечает"; else check dns 0 "$DNS1 не отвечает"; fi
  if pings "$WAN" 77.88.8.8; then check wan 1 "есть"; else check wan 0 "нет"; fi
  if [ -n "$EP" ] && pings "$WAN" "$EP"; then check server_direct 1 "$EP отвечает"; else check server_direct 0 "${EP:-адрес сервера} не отвечает"; fi

  if [ "$C_wan" = 0 ]; then V=provider; M="Нет интернета у провайдера: проверьте кабель или оплату"
  elif [ "$C_server_direct" = 0 ]; then V=server; M="Сервер VPN не отвечает: проверьте, работает ли сервер (возможно, его адрес блокируется)"
  elif [ "$C_handshake" = 0 ]; then V=profile; M="Сервер доступен, но не принимает профиль: профиль мог быть отозван"
  elif [ "$C_tunnel_ping" = 0 ]; then V=server; M="Туннель поднят, но сервер не пропускает трафик"
  elif [ "$C_dns" = 0 ]; then V=server; M="Сервер не выпускает в интернет"
  else V=ok; M="Всё в порядке"; fi
  printf '{"ok":true,"checks":[%s],"verdict":"%s","message":%s}\n' "$CHECKS" "$V" "$(json_str "$M")"
}
