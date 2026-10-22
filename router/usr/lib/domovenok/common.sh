#!/bin/sh
# ДомовёнокNET: общие пути и функции (busybox ash).
# DOMOVENOK_ROOT подменяет корень файловой системы в тестах.
ROOT=${DOMOVENOK_ROOT:-}
ETC=$ROOT/etc/domovenok
RUN=$ROOT/tmp/domovenok
LIB=${DOMOVENOK_LIB:-$ROOT/usr/lib/domovenok}
T='inet domovenok'

cfg_get(){ sed -n "s/^$1=//p" "$ETC/config" 2>/dev/null | head -1; }
CACHE=$ROOT$(cfg_get CACHE); [ "$CACHE" = "$ROOT" ] && CACHE=$ETC/cache

now(){ echo "${DOMOVENOK_NOW:-$(date +%s)}"; }
log(){ logger -t domovenok "$*" 2>/dev/null; }

state_get(){
  case "$(cat "$ETC/state" 2>/dev/null)" in list) echo list;; full) echo full;; *) echo off;; esac
}

# строки файла без комментариев, пустых строк, \r и крайних пробелов
clean_list(){
  [ -f "$1" ] || return 0
  tr -d '\r' < "$1" | sed 's/^[[:space:]]*//; s/[[:space:]]*$//' | grep -vE '^(#|$)'
}

is_domain(){
  printf '%s' "$1" | grep -qE '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]([a-z0-9-]{0,61}[a-z0-9])?$'
}

is_ipv4_or_cidr(){
  printf '%s\n' "$1" | awk -F'[./]' '
    NF < 4 || NF > 5 { exit 1 }
    { for (i = 1; i <= NF; i++) if ($i !~ /^[0-9]+$/) exit 1
      for (i = 1; i <= 4; i++) if ($i > 255) exit 1
      if (NF == 5 && ($5 > 32 || $0 !~ /\/[0-9]+$/)) exit 1
      if (NF == 4 && $0 ~ /\//) exit 1 }'
}

is_profile_name(){ printf '%s' "$1" | grep -qE '^[A-Za-z0-9_-]{1,32}$'; }

json_str(){ printf '"%s"' "$(printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g')"; }

# stdin (строка на элемент) -> JSON-массив строк
json_arr_lines(){
  awk 'BEGIN { printf "[" } { gsub(/\\/, "\\\\"); gsub(/"/, "\\\""); printf "%s\"%s\"", (NR > 1 ? "," : ""), $0 } END { printf "]" }'
}

# блокировка: изменяющие команды выполняются по одной (lock — утилита OpenWrt)
LOCKF=/var/lock/domovenok
with_lock(){ lock "$LOCKF"; trap 'lock -u "$LOCKF"' EXIT; }

die(){ printf '{"ok":false,"error":%s}\n' "$(json_str "$1")"; exit 1; }

# DNS-серверы роутера (только IPv4, без #порта)
dns_servers(){
  uci -q get 'dhcp.@dnsmasq[0].server' | tr ' ' '\n' | sed 's/#.*//' | grep -E '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$'
}

mkdir -p "$RUN" 2>/dev/null
