#!/bin/sh
# ДомовёнокNET: правила nftables для трёх состояний (off | list | full).
# Метка 0x2 = напрямую через провайдера (ip rule -> таблица 200). Без метки = обычный маршрут (туннель).
LOCAL='{ 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.0.0.0/8, 169.254.0.0/16, 100.64.0.0/10, 224.0.0.0/4, 240.0.0.0/4 }'

# элементы набора tun4: DNS роутера, мои IP, подсети включённых подборок
tun4_elements(){
  {
    dns_servers | sed 's#$#/32#'
    clean_list "$ETC/mine-ips.txt"
    for id in $(clean_list "$ETC/presets.enabled"); do clean_list "$CACHE/$id.subnets"; done
  } | grep -E '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+(/[0-9]+)?$' | awk '!seen[$0]++'
}

rules_chain(){ # $1 = цепочка, $2 = состояние
  R="add rule $T $1"
  [ "$1" = lan ] && echo "$R iifname != \"br-lan\" return"
  echo "$R ip daddr $LOCAL return"
  [ "$2" = list ] && echo "$R ip daddr @dnsfb4 meta mark set 0x2 return"
  echo "$R udp dport 123 meta mark set 0x2 return"
  if [ "$2" = list ]; then
    echo "$R ip daddr @tun4 return"
    echo "$R ip daddr @dyn_tun4 return"
    echo "$R meta mark set 0x2"
  fi
}

rules_gen(){
  S=$(state_get)
  echo "add table $T"
  echo "add set $T tun4 { type ipv4_addr; flags interval; auto-merge; }"
  echo "add set $T dyn_tun4 { type ipv4_addr; flags timeout; timeout 24h; }"
  echo "add set $T dnsfb4 { type ipv4_addr; flags interval; }"
  echo "add chain $T lan { type filter hook prerouting priority mangle; policy accept; }"
  echo "add chain $T out { type route hook output priority mangle; policy accept; }"
  echo "flush chain $T lan"
  echo "flush chain $T out"
  echo "flush set $T tun4"
  E=$(tun4_elements | awk '{ printf "%s%s", (NR > 1 ? ", " : ""), $0 }')
  [ -n "$E" ] && echo "add element $T tun4 { $E }"
  [ "$S" = off ] && return 0
  rules_chain lan "$S"
  rules_chain out "$S"
}

rules_apply(){
  rules_gen > "$RUN/domovenok.nft" || return 1
  nft -c -f "$RUN/domovenok.nft" || { log "ошибка синтаксиса nftables, правила не применены"; return 1; }
  nft -f "$RUN/domovenok.nft"
}
