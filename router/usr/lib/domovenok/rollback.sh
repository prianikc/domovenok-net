#!/bin/sh
# ДомовёнокNET: вернуть старую установку из резервной копии (tar.gz в stdin).
D=$(dirname "$0")
. "$D/common.sh"

cat > "$RUN/backup.tar.gz"
tar tzf "$RUN/backup.tar.gz" 2>/dev/null | grep -qx 'usr/bin/wgsw' || die "в резервной копии нет старой установки: откат невозможен"

[ -x "$ROOT/etc/init.d/domovenok" ] && { "$ROOT/etc/init.d/domovenok" stop; "$ROOT/etc/init.d/domovenok" disable; } >/dev/null 2>&1
nft delete table inet domovenok 2>/dev/null
CRON=$ROOT/etc/crontabs/root
[ -f "$CRON" ] && { grep -v 'domovenok' "$CRON" > "$RUN/cron.tmp"; mv "$RUN/cron.tmp" "$CRON"; }

tar xzf "$RUN/backup.tar.gz" -C "$ROOT/" || die "не удалось распаковать резервную копию"
rm -f "$RUN/backup.tar.gz"
rm -rf "$ROOT/usr/bin/domovenok" "$ROOT/etc/init.d/domovenok" "$ROOT/etc/hotplug.d/iface/90-domovenok-wan" \
  "$ROOT/etc/hotplug.d/ntp/50-domovenok"

[ -x "$ROOT/etc/init.d/network" ] && "$ROOT/etc/init.d/network" reload >/dev/null 2>&1
for s in vpnsplit vpnawg; do
  [ -x "$ROOT/etc/init.d/$s" ] && { "$ROOT/etc/init.d/$s" enable; "$ROOT/etc/init.d/$s" start; } >/dev/null 2>&1
done
[ -x "$ROOT/etc/init.d/dnsmasq" ] && "$ROOT/etc/init.d/dnsmasq" restart >/dev/null 2>&1
[ -x "$ROOT/etc/init.d/cron" ] && "$ROOT/etc/init.d/cron" restart >/dev/null 2>&1
if [ "$(cat "$ROOT/etc/wg-profiles/.enabled" 2>/dev/null || echo 1)" = 1 ] && [ -x "$ROOT/usr/bin/wgsw" ]; then
  "$ROOT/usr/bin/wgsw" on >/dev/null 2>&1
fi
log "возвращена старая установка из резервной копии"
rm -rf "$ROOT/usr/lib/domovenok" "$ETC"
printf '{"ok":true}\n'
