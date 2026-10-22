load helper

setup() { setup_root; }

rules_of() { # $1 = цепочка: строки add rule этой цепочки без префикса
  grep "^add rule inet domovenok $1 " "$BATS_TEST_TMPDIR/out.nft" | sed "s/^add rule inet domovenok $1 //"
}

@test "off: таблица и цепочки есть, правил нет" {
  echo off > "$(etc state)"
  lib rules_gen > "$BATS_TEST_TMPDIR/out.nft"
  grep -q '^add table inet domovenok$' "$BATS_TEST_TMPDIR/out.nft"
  grep -q '^flush chain inet domovenok lan$' "$BATS_TEST_TMPDIR/out.nft"
  ! grep -q '^add rule' "$BATS_TEST_TMPDIR/out.nft"
}

@test "list: порядок правил в lan и out" {
  echo list > "$(etc state)"
  lib rules_gen > "$BATS_TEST_TMPDIR/out.nft"
  LOCAL='ip daddr { 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.0.0.0/8, 169.254.0.0/16, 100.64.0.0/10, 224.0.0.0/4, 240.0.0.0/4 } return'
  expected_tail="$LOCAL
ip daddr @dnsfb4 meta mark set 0x2 return
udp dport 123 meta mark set 0x2 return
ip daddr @tun4 return
ip daddr @dyn_tun4 return
meta mark set 0x2"
  [ "$(rules_of lan)" = "iifname != \"br-lan\" return
$expected_tail" ]
  [ "$(rules_of out)" = "$expected_tail" ]
}

@test "full: только локальные адреса и NTP, без фолбэка и без финальной метки" {
  echo full > "$(etc state)"
  lib rules_gen > "$BATS_TEST_TMPDIR/out.nft"
  ! grep -q '@dnsfb4' "$BATS_TEST_TMPDIR/out.nft"
  ! rules_of lan | grep -qx 'meta mark set 0x2'
  ! rules_of out | grep -qx 'meta mark set 0x2'
  rules_of out | grep -qx 'udp dport 123 meta mark set 0x2 return'
  [ "$(rules_of out | wc -l)" -eq 2 ]
}

@test "tun4: DNS роутера, мои IP и подсети только включённых подборок" {
  echo list > "$(etc state)"
  echo '5.6.7.0/24' > "$(etc mine-ips.txt)"
  echo telegram > "$(etc presets.enabled)"
  echo '91.108.4.0/22' > "$(etc cache)/telegram.subnets"
  echo '162.159.128.0/19' > "$(etc cache)/discord.subnets"
  run lib tun4_elements
  [ "$status" -eq 0 ]
  [ "$(echo "$output" | sort | tr '\n' ' ')" = "1.1.1.1/32 5.6.7.0/24 8.8.8.8/32 91.108.4.0/22 " ]
}

@test "списки: комментарии, пустые строки и \\r игнорируются" {
  printf '# комментарий\r\n\r\n5.6.7.0/24\r\n   \n' > "$(etc mine-ips.txt)"
  run lib tun4_elements
  echo "$output" | grep -qx '5.6.7.0/24'
  ! echo "$output" | grep -q '#'
  [ "$(echo "$output" | wc -l)" -eq 3 ]
}

@test "rules_gen: элементы tun4 попадают в скрипт" {
  echo list > "$(etc state)"
  lib rules_gen > "$BATS_TEST_TMPDIR/out.nft"
  grep -q '^add element inet domovenok tun4 { 1.1.1.1/32, 8.8.8.8/32 }$' "$BATS_TEST_TMPDIR/out.nft"
}
