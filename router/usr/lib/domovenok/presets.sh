#!/bin/sh
# ДомовёнокNET: подборки (каталог, скачивание, кэш) и наборы доменов для dnsmasq.
# catalog.txt: id|Название|источники доменов через ;|источники подсетей через ;
# Источник — URL или own/<файл> (из репозитория; при неудаче — копия из $ETC/seed/own/).
FETCH=${FETCH:-uclient-fetch -q -T 30 -O}
DOMAIN_RE='^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]([a-z0-9-]{0,61}[a-z0-9])?$'
# только верные IPv4-адреса и подсети: октеты до 255, маска до 32
ipv4_filter(){
  awk -F'[./]' '/^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+(\/[0-9]+)?$/ && $1 < 256 && $2 < 256 && $3 < 256 && $4 < 256 && (NF == 4 || $5 <= 32)'
}

repo_raw(){ R=$(cfg_get REPO); echo "https://raw.githubusercontent.com/${R:-prianikc/domovenok-net}/main/presets"; }

catalog(){
  [ -f "$ETC/catalog.txt" ] || cp "$ETC/seed/catalog.txt" "$ETC/catalog.txt" 2>/dev/null
  clean_list "$ETC/catalog.txt" | grep -E '^[a-z0-9_]+\|[^|]+\|[^|]*\|[^|]*$'
}
cat_line(){ catalog | grep "^$1|"; }

fetch_src(){ # $1 = источник, $2 = файл назначения
  case "$1" in
    own/*) $FETCH "$2" "$(repo_raw)/$1" 2>/dev/null || cp "$ETC/seed/$1" "$2" 2>/dev/null ;;
    http://*|https://*) $FETCH "$2" "$1" 2>/dev/null ;;
    *) return 1 ;;
  esac
}

# очищенный список нужного вида из файла; код 1, если список негоден
# (нет ни одной верной строки или неверных не меньше половины)
validate(){ # $1 = domains|subnets, $2 = файл
  clean_list "$2" | tr 'A-Z' 'a-z' > "$2.clean"
  [ "$1" = subnets ] && { grep -v ':' "$2.clean" > "$2.v4"; mv "$2.v4" "$2.clean"; }
  if [ "$1" = domains ]; then grep -E "$DOMAIN_RE" "$2.clean" > "$2.good"; else ipv4_filter < "$2.clean" > "$2.good"; fi
  TOTAL=$(wc -l < "$2.clean"); GOOD=$(wc -l < "$2.good")
  [ "$GOOD" -gt 0 ] && [ $(( (TOTAL - GOOD) * 2 )) -lt "$TOTAL" ] || return 1
  awk '!seen[$0]++' "$2.good"
}

update_kind(){ # $1 = id, $2 = domains|subnets, $3 = источники через ; ; итог в $RUN/$1.$2.new
  NEW=$RUN/$1.$2.new; : > "$NEW"
  for SRC in $(echo "$3" | tr ';' ' '); do
    fetch_src "$SRC" "$RUN/dl.tmp" || return 1
    validate "$2" "$RUN/dl.tmp" >> "$NEW" || return 1
  done
}

update_one(){ # $1 = id
  L=$(cat_line "$1"); [ -n "$L" ] || return 1
  PD=$(echo "$L" | cut -d'|' -f3); PS=$(echo "$L" | cut -d'|' -f4)
  [ -z "$PD" ] || update_kind "$1" domains "$PD" || return 1
  [ -z "$PS" ] || update_kind "$1" subnets "$PS" || return 1
  mkdir -p "$CACHE"
  [ -z "$PD" ] || mv "$RUN/$1.domains.new" "$CACHE/$1.domains"
  [ -z "$PS" ] || mv "$RUN/$1.subnets.new" "$CACHE/$1.subnets"
  now > "$CACHE/$1.updated"
}

catalog_update(){
  $FETCH "$RUN/catalog.new" "$(repo_raw)/catalog.txt" 2>/dev/null || cp "$ETC/seed/catalog.txt" "$RUN/catalog.new" 2>/dev/null || return 1
  [ "$(clean_list "$RUN/catalog.new" | grep -cE '^[a-z0-9_]+\|[^|]+\|[^|]*\|[^|]*$')" -gt 0 ] || return 1
  mv "$RUN/catalog.new" "$ETC/catalog.txt"
}

# presets_update [id…]: без аргументов — каталог и все включённые; печатает updated/failed id
presets_update(){
  if [ $# -eq 0 ]; then catalog_update; set -- $(clean_list "$ETC/presets.enabled"); fi
  for ID in "$@"; do
    if update_one "$ID"; then echo "updated $ID"; else echo "failed $ID"; fi
    rm -f "$RUN/$ID".*.new "$RUN"/dl.tmp*
  done
}

is_enabled_preset(){ clean_list "$ETC/presets.enabled" | grep -qx "$1"; }

presets_set(){ # $1 = id, $2 = on|off
  cat_line "$1" | grep -q . || return 1
  clean_list "$ETC/presets.enabled" | grep -vx "$1" > "$RUN/enabled.tmp"
  [ "$2" = on ] && echo "$1" >> "$RUN/enabled.tmp"
  mv "$RUN/enabled.tmp" "$ETC/presets.enabled"
}

presets_list_json(){
  printf '['; N=0
  catalog | while IFS='|' read -r ID TITLE D S; do
    [ $N -gt 0 ] && printf ','; N=$((N + 1))
    if is_enabled_preset "$ID"; then EN=true; else EN=false; fi
    UPD=$(cat "$CACHE/$ID.updated" 2>/dev/null); UPD=${UPD:-0}
    ND=$(clean_list "$CACHE/$ID.domains" | wc -l); NS=$(clean_list "$CACHE/$ID.subnets" | wc -l)
    SAMPLE=$( { clean_list "$CACHE/$ID.domains"; clean_list "$CACHE/$ID.subnets"; } | head -3 | json_arr_lines)
    printf '{"id":%s,"title":%s,"enabled":%s,"updated":%s,"domains":%s,"subnets":%s,"sample":%s}' \
      "$(json_str "$ID")" "$(json_str "$TITLE")" "$EN" "$UPD" "$ND" "$NS" "$SAMPLE"
  done
  printf ']'
}

# домены «через туннель» для dnsmasq: по 50 на строку nftset
dnsmasq_gen(){
  [ "$(state_get)" = off ] && return 0
  {
    for ID in $(clean_list "$ETC/presets.enabled"); do clean_list "$CACHE/$ID.domains"; done
    clean_list "$ETC/mine-domains.txt"
  } | awk '!seen[$0]++' | awk -v set="4#inet#domovenok#dyn_tun4" '
    { line = line "/" $0; n++ }
    n == 50 { print "nftset=" line "/" set; line = ""; n = 0 }
    END { if (n) print "nftset=" line "/" set }'
}

dnsmasq_confdir(){ sed -n 's/^conf-dir=//p' "$ROOT"/var/etc/dnsmasq.conf.* 2>/dev/null | cut -d, -f1 | head -1; }

dnsmasq_apply(){
  DIR=$(dnsmasq_confdir); [ -n "$DIR" ] || DIR=/tmp/dnsmasq.d
  mkdir -p "$ROOT$DIR"
  dnsmasq_gen > "$ROOT$DIR/domovenok.conf"
  [ -s "$ROOT$DIR/domovenok.conf" ] || rm -f "$ROOT$DIR/domovenok.conf"
  [ -x "$ROOT/etc/init.d/dnsmasq" ] && "$ROOT/etc/init.d/dnsmasq" restart >/dev/null 2>&1
  return 0
}
