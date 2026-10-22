#!/bin/sh
# ДомовёнокNET: профили и туннель.
#   NAME.awg  - AmneziaWG, интерфейс awg0 (поднимается напрямую через ip/awg)
#   NAME.conf - WireGuard, интерфейс wg0 (через UCI network.wg0)
PROF=$ETC/profiles
SLEEP=${DOMOVENOK_SLEEP:-2}

active(){ cat "$PROF/.active" 2>/dev/null; }
prof_type(){ if [ -f "$PROF/$1.awg" ]; then echo awg; elif [ -f "$PROF/$1.conf" ]; then echo wg; fi; }
prof_file(){ case "$(prof_type "$1")" in awg) echo "$PROF/$1.awg";; wg) echo "$PROF/$1.conf";; esac; }
tun_dev(){ case "$(prof_type "${1:-$(active)}")" in awg) echo awg0;; wg) echo wg0;; esac; }
prof_val(){ grep -E "^[[:space:]]*$2[[:space:]]*=" "$1" | head -1 | sed 's/^[^=]*=[[:space:]]*//' | tr -d ' \r'; }

hs_epoch(){ # $1 = интерфейс; время последнего рукопожатия (0 = не было)
  case "$1" in
    awg0) T=$(awg show awg0 latest-handshakes 2>/dev/null | awk '{print $2}' | head -1) ;;
    wg0) T=$(wg show wg0 latest-handshakes 2>/dev/null | awk '{print $2}' | head -1) ;;
  esac
  echo "${T:-0}"
}

hs_age(){
  T=$(hs_epoch "$(tun_dev)")
  if [ "$T" -gt 0 ] 2>/dev/null; then echo $(( $(now) - T )); else echo 999999; fi
}

is_healthy(){ [ "$(state_get)" != off ] && [ "$(hs_age)" -lt 180 ]; }

endpoint_ip(){
  F=$(prof_file "$(active)"); [ -n "$F" ] || return 0
  EP=$(prof_val "$F" Endpoint); EP=${EP%:*}
  if echo "$EP" | grep -qE '^[0-9.]+$'; then echo "$EP"
  else nslookup "$EP" 127.0.0.1 2>/dev/null | sed -n 's/^Address: \([0-9.]*\)$/\1/p' | head -1; fi
}

aw_start(){ # $1 = профиль .awg
  F="$PROF/$1.awg"
  ADDR=$(prof_val "$F" Address | cut -d, -f1)
  grep -vE '^[[:space:]]*(Address|DNS|MTU|Table|PreUp|PostUp|PreDown|PostDown|SaveConfig)[[:space:]]*=' "$F" | tr -d '\r' > "$RUN/awg0.setconf"
  sed -i '/^\[Interface\]/a FwMark = 0x2' "$RUN/awg0.setconf"   # пакеты туннеля -> напрямую через WAN
  ip link del awg0 2>/dev/null
  ip link add awg0 type amneziawg || { rm -f "$RUN/awg0.setconf"; return 1; }
  awg setconf awg0 "$RUN/awg0.setconf"; R=$?; rm -f "$RUN/awg0.setconf"
  [ $R -eq 0 ] || { ip link del awg0; return 1; }
  ip addr add "$ADDR" dev awg0
  ip link set awg0 mtu 1376 up
  ip route replace 0.0.0.0/1 dev awg0      # две половины вместо default: маршрут провайдера не трогаем
  ip route replace 128.0.0.0/1 dev awg0
}
aw_stop(){ ip route del 0.0.0.0/1 dev awg0 2>/dev/null; ip route del 128.0.0.0/1 dev awg0 2>/dev/null; ip link del awg0 2>/dev/null; }

wg_start(){ # $1 = профиль .conf
  F="$PROF/$1.conf"
  PRIV=$(prof_val "$F" PrivateKey); ADDR=$(prof_val "$F" Address | cut -d, -f1); PUB=$(prof_val "$F" PublicKey)
  PSK=$(prof_val "$F" PresharedKey); EP=$(prof_val "$F" Endpoint); KA=$(prof_val "$F" PersistentKeepalive)
  [ -n "$PRIV" ] && [ -n "$PUB" ] && [ -n "$EP" ] && [ -n "$ADDR" ] || return 1
  uci set network.wg0=interface
  uci set network.wg0.proto=wireguard
  uci set network.wg0.private_key="$PRIV"
  uci -q delete network.wg0.addresses; uci add_list network.wg0.addresses="$ADDR"
  uci -q get 'network.@wireguard_wg0[0]' >/dev/null || uci add network wireguard_wg0 >/dev/null
  uci set 'network.@wireguard_wg0[0].public_key'="$PUB"
  if [ -n "$PSK" ]; then uci set 'network.@wireguard_wg0[0].preshared_key'="$PSK"; else uci -q delete 'network.@wireguard_wg0[0].preshared_key'; fi
  uci set 'network.@wireguard_wg0[0].endpoint_host'="${EP%:*}"
  uci set 'network.@wireguard_wg0[0].endpoint_port'="${EP##*:}"
  uci set 'network.@wireguard_wg0[0].allowed_ips'='0.0.0.0/0'
  uci set 'network.@wireguard_wg0[0].route_allowed_ips'='1'
  uci set 'network.@wireguard_wg0[0].persistent_keepalive'="${KA:-25}"
  uci set network.wg0.auto='1'
  uci commit network
  ifdown wg0 2>/dev/null; sleep "$SLEEP"; ifup wg0
}
wg_stop(){ uci -q get network.wg0 >/dev/null || return 0; uci set network.wg0.auto='0'; uci commit network; ifdown wg0 2>/dev/null; }

tunnel_down(){ aw_stop; wg_stop; }

tunnel_up(){ # $1 = профиль
  tunnel_down
  case "$(prof_type "$1")" in
    awg) aw_start "$1" ;;
    wg) wg_start "$1" ;;
    *) return 1 ;;
  esac
}

wait_handshake(){ # $1 = интерфейс, $2 = время подъёма; до 30 с ждём свежего рукопожатия
  I=0
  while [ $I -lt 15 ]; do
    [ "$(hs_epoch "$1")" -ge "$2" ] 2>/dev/null && [ "$(hs_epoch "$1")" -gt 0 ] && return 0
    sleep "$SLEEP"; I=$((I + 1))
  done
  return 1
}

try_profile(){ # $1 = профиль; поднять и дождаться рукопожатия
  AT=$(now); tunnel_up "$1" && wait_handshake "$(tun_dev "$1")" "$AT"
}

profile_use(){ # $1 = профиль; печатает JSON
  is_profile_name "$1" || die "недопустимое имя профиля"
  [ -n "$(prof_type "$1")" ] || die "нет профиля $1"
  if [ "$(state_get)" = off ]; then
    echo "$1" > "$PROF/.active"
    printf '{"ok":true,"profile":%s,"healthy":false,"rolled_back":false}\n' "$(json_str "$1")"; return 0
  fi
  PREV=$(active); PREV_OK=0; is_healthy && PREV_OK=1
  log "подключаю профиль $1 (предыдущий: ${PREV:-нет}, работал: $PREV_OK)"
  if try_profile "$1"; then
    echo "$1" > "$PROF/.active"; R="$1"; OK=true; RB=false
  elif [ "$PREV_OK" = 1 ] && [ -n "$PREV" ] && [ "$PREV" != "$1" ] && try_profile "$PREV"; then
    log "профиль $1 не поднялся, вернулся на $PREV"; R="$PREV"; OK=true; RB=true
  else
    log "профиль $1 не поднялся, туннель остаётся включённым"
    echo "$1" > "$PROF/.active"; R="$1"; OK=false; RB=false
  fi
  printf '{"ok":true,"profile":%s,"healthy":%s,"rolled_back":%s}\n' "$(json_str "$R")" "$OK" "$RB"
}
