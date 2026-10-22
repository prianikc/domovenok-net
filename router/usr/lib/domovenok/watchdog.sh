#!/bin/sh
# ДомовёнокNET: сторож. Проверяет только рукопожатие туннеля.
# Нет рукопожатия в режиме list -> DNS-запросы роутера временно идут через провайдера (набор dnsfb4),
# иначе весь дом остался бы без DNS. Остальной трафик напрямую не пускаем.

wd_tick(){
  S=$(state_get)
  if is_healthy; then H=1; else H=0; fi
  if [ "$S" = list ] && [ $H = 0 ]; then
    E=$(dns_servers | awk '{ printf "%s%s", (NR > 1 ? ", " : ""), $0 }')
    [ -n "$E" ] && nft add element $T dnsfb4 "{ $E }" 2>/dev/null
  else
    nft flush set $T dnsfb4 2>/dev/null
  fi
  P=$(cat "$RUN/health" 2>/dev/null)
  [ "$P" != "$H" ] && [ "$S" != off ] && log "туннель: $([ $H = 1 ] && echo работает || echo 'нет рукопожатия')"
  echo $H > "$RUN/health"
}

wd_loop(){ while :; do wd_tick; sleep 10; done; }

if [ "${0##*/}" = watchdog.sh ] && [ "$1" = loop ]; then
  D=$(dirname "$0")
  . "$D/common.sh"; . "$D/tunnel.sh"
  wd_loop
fi
