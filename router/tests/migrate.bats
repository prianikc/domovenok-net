load helper

setup() {
  setup_root
  R=$DOMOVENOK_ROOT
  mkdir -p "$R/usr/bin" "$R/usr/lib" "$R/etc/vpnsplit" "$R/etc/wg-profiles" "$R/etc/init.d" "$R/etc/crontabs" \
    "$R/etc/hotplug.d/ntp" "$R/etc/hotplug.d/iface" "$R/root/blackbox"
  for f in usr/bin/wgsw usr/bin/vpnmode usr/bin/vps-check usr/bin/blackbox usr/lib/vpnctl.sh \
           etc/hotplug.d/ntp/50-wg-after-timesync etc/hotplug.d/iface/90-wan-direct-table; do
    echo old > "$R/$f"; chmod +x "$R/$f"
  done
  echo list > "$R/etc/vpnsplit/mode"
  echo 1 > "$R/etc/wg-profiles/.enabled"
  for s in vpnsplit vpnawg domovenok; do
    printf '#!/bin/sh\necho "init.d/%s $*" >> "$CALLS"\n' $s > "$R/etc/init.d/$s"; chmod +x "$R/etc/init.d/$s"
  done
  printf '* * * * * /usr/bin/blackbox\n0 3 * * * /usr/bin/other\n' > "$R/etc/crontabs/root"
  printf 'vpnsplit\nother\nvpnsplit\n' > "$STUBDATA/ipsets"
  echo off > "$(etc state)"
}

@test "migrate.sh убирает старую установку и ставит новую" {
  run sh "$DOMOVENOK_LIB/migrate.sh"
  [ "$status" -eq 0 ]
  echo "$output" | grep -q '"ok":true'
  [ ! -e "$R/usr/bin/wgsw" ]
  [ ! -e "$R/etc/vpnsplit" ]
  [ ! -e "$R/usr/lib/vpnctl.sh" ]
  [ ! -e "$R/root/blackbox" ]
  [ -f "$(etc state)" ]
  grep -q 'init.d/vpnsplit stop' "$CALLS"
  grep -q 'init.d/vpnsplit disable' "$CALLS"
  grep -q 'nft delete table inet vpnsplit' "$CALLS"
  grep -q 'init.d/domovenok enable' "$CALLS"
  [ "$(cat "$STUBDATA/ipsets")" = other ]
  ! grep -q blackbox "$R/etc/crontabs/root"
  grep -q other "$R/etc/crontabs/root"
}

@test "migrate.sh не трогает OpenConnect, зону vpn и wg0" {
  sh "$DOMOVENOK_LIB/migrate.sh"
  ! grep -qE 'ocvpn|vpnzone|delete network.wg0' "$CALLS"
}

@test "rollback.sh возвращает старую установку из архива" {
  (cd "$R" && tar czf "$BATS_TEST_TMPDIR/backup.tar.gz" usr/bin/wgsw etc/init.d/vpnsplit etc/vpnsplit etc/wg-profiles etc/crontabs/root)
  sh "$DOMOVENOK_LIB/migrate.sh"
  [ ! -e "$R/usr/bin/wgsw" ]
  run sh "$DOMOVENOK_LIB/rollback.sh" < "$BATS_TEST_TMPDIR/backup.tar.gz"
  [ "$status" -eq 0 ]
  [ -x "$R/usr/bin/wgsw" ]
  [ "$(cat "$R/etc/vpnsplit/mode")" = list ]
  grep -q 'init.d/domovenok disable' "$CALLS"
  grep -q 'nft delete table inet domovenok' "$CALLS"
  grep -q 'init.d/vpnsplit enable' "$CALLS"
  grep -q blackbox "$R/etc/crontabs/root"
}

@test "fix: rollback.sh не принимает архив без старой установки" {
  (cd "$R" && tar czf "$BATS_TEST_TMPDIR/bad.tar.gz" etc/crontabs/root)
  run sh "$DOMOVENOK_LIB/rollback.sh" < "$BATS_TEST_TMPDIR/bad.tar.gz"
  [ "$status" -eq 1 ]
  ! grep -q 'init.d/domovenok stop' "$CALLS"
}
