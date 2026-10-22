# Общая подготовка для bats-тестов скриптов роутера
REPO_ROUTER="$(cd "$(dirname "$BATS_TEST_FILENAME")/.." && pwd)"

setup_root() {
  export DOMOVENOK_ROOT="$BATS_TEST_TMPDIR/root"
  export DOMOVENOK_LIB="$REPO_ROUTER/usr/lib/domovenok"
  export CALLS="$BATS_TEST_TMPDIR/calls.log"
  export STUBDATA="$BATS_TEST_TMPDIR"
  export PATH="$REPO_ROUTER/tests/stubs:$PATH"
  mkdir -p "$DOMOVENOK_ROOT/etc/domovenok/cache" "$DOMOVENOK_ROOT/etc/domovenok/profiles" "$DOMOVENOK_ROOT/tmp/domovenok"
  : > "$CALLS"
}

# lib <функции…>: выполнить в sh с подключёнными библиотеками
lib() {
  sh -c ". \"\$DOMOVENOK_LIB/common.sh\"; for f in rules presets tunnel watchdog stats diag; do [ -f \"\$DOMOVENOK_LIB/\$f.sh\" ] && . \"\$DOMOVENOK_LIB/\$f.sh\"; done; $*"
}

etc() { echo "$DOMOVENOK_ROOT/etc/domovenok/$1"; }
