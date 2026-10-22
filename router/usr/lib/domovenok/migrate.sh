#!/bin/sh
# ДомовёнокNET: снять старую установку (VPN Tray 1.0: wgsw + /etc/vpnsplit) и запустить новую.
# Программа заранее сделала резервную копию и записала профили, state, presets.enabled, mine-*.
# Ничего, чего старая установка не создавала (OpenConnect, зона vpn, wg0), не трогаем.
D=$(dirname "$0")
. "$D/common.sh"

for s in vpnsplit vpnawg; do
  [ -x "$ROOT/etc/init.d/$s" ] && { "$ROOT/etc/init.d/$s" stop; "$ROOT/etc/init.d/$s" disable; } >/dev/null 2>&1
done
nft delete table inet vpnsplit 2>/dev/null

# наборы доменов старой установки в dnsmasq
I=0
while T=$(uci -q get "dhcp.@ipset[$I].table"); do
  if [ "$T" = vpnsplit ]; then uci -q delete "dhcp.@ipset[$I]"; else I=$((I + 1)); fi
done
uci commit dhcp

CRON=$ROOT/etc/crontabs/root
[ -f "$CRON" ] && { grep -v '/usr/bin/blackbox' "$CRON" > "$RUN/cron.tmp"; mv "$RUN/cron.tmp" "$CRON"; }

for f in usr/bin/wgsw usr/bin/vpnmode usr/bin/vps-check usr/bin/blackbox usr/lib/vpnctl.sh \
         etc/vpnsplit etc/wg-profiles etc/init.d/vpnsplit etc/init.d/vpnawg \
         etc/hotplug.d/ntp/50-wg-after-timesync etc/hotplug.d/iface/90-wan-direct-table root/blackbox; do
  rm -rf "$ROOT/$f"
done
log "старая установка снята, запускаю ДомовёнокNET"

sh "$D/install.sh" >/dev/null
HEALTHY=false
if [ "$(state_get)" != off ] && [ -x "$ROOT/usr/bin/domovenok" ]; then
  "$ROOT/usr/bin/domovenok" restart | grep -q '"healthy":true' && HEALTHY=true
fi
printf '{"ok":true,"healthy":%s}\n' "$HEALTHY"
