#!/bin/sh
# ДомовёнокNET: установка и обновление на роутере (можно запускать повторно).
# Печатает JSON: версия, недостающие пакеты, есть ли старая установка (wgsw), свободное место.
VERSION=2.0.0
D=$(dirname "$0")
. "$D/common.sh"

chmod +x "$ROOT/usr/bin/domovenok" "$LIB"/*.sh "$ROOT/etc/init.d/domovenok" \
  "$ROOT/etc/hotplug.d/iface/90-domovenok-wan" "$ROOT/etc/hotplug.d/ntp/50-domovenok" 2>/dev/null

mkdir -p "$ETC/profiles" "$CACHE"
if [ -f "$ETC/config" ]; then
  grep -v '^VERSION=' "$ETC/config" > "$RUN/config.tmp"; echo "VERSION=$VERSION" >> "$RUN/config.tmp"; mv "$RUN/config.tmp" "$ETC/config"
else
  printf 'REPO=prianikc/domovenok-net\nVERSION=%s\nCACHE=/etc/domovenok/cache\n' "$VERSION" > "$ETC/config"
fi
[ -f "$ETC/state" ] || echo off > "$ETC/state"
for f in mine-domains.txt mine-ips.txt presets.enabled; do [ -f "$ETC/$f" ] || : > "$ETC/$f"; done

# трафик с меткой 0x2 -> таблица 200 (напрямую через провайдера)
if ! uci -q show network | grep -q "\.mark='0x2'"; then
  uci set network.domovenok_direct=rule
  uci set network.domovenok_direct.mark='0x2'
  uci set network.domovenok_direct.lookup='200'
  uci set network.domovenok_direct.priority='200'
  uci commit network
fi

LEGACY=false; [ -x "$ROOT/usr/bin/wgsw" ] && LEGACY=true
[ $LEGACY = false ] && rm -f "$ROOT/etc/hotplug.d/iface/90-wan-direct-table"

# подборки обновляются раз в сутки, ночью, в случайную минуту
CRON=$ROOT/etc/crontabs/root; mkdir -p "$(dirname "$CRON")"; touch "$CRON"
grep -v 'domovenok presets update' "$CRON" > "$RUN/cron.tmp"
echo "$(awk 'BEGIN { srand(); print int(rand() * 60) }') 4 * * * /usr/bin/domovenok presets update >/dev/null 2>&1" >> "$RUN/cron.tmp"
mv "$RUN/cron.tmp" "$CRON"
[ -x "$ROOT/etc/init.d/cron" ] && "$ROOT/etc/init.d/cron" restart >/dev/null 2>&1

has_pkg(){
  if command -v apk >/dev/null 2>&1; then apk info -e "$1" >/dev/null 2>&1
  else opkg status "$1" 2>/dev/null | grep -q 'Status:.*installed'; fi
}
MISSING=$(for p in dnsmasq-full kmod-amneziawg amneziawg-tools; do has_pkg "$p" || echo "$p"; done | json_arr_lines)
FREE=$(df -k /overlay 2>/dev/null | awk 'NR == 2 { print $4 }')

if [ $LEGACY = false ] && [ -x "$ROOT/etc/init.d/domovenok" ]; then
  "$ROOT/etc/init.d/domovenok" enable
  "$ROOT/etc/init.d/domovenok" restart >/dev/null 2>&1
fi

printf '{"ok":true,"version":"%s","missing":%s,"legacy":%s,"free_kb":%s}\n' "$VERSION" "$MISSING" "$LEGACY" "${FREE:-0}"
