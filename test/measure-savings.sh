#!/bin/bash
# Bytes received by the simulator's WebKit networking process per page load, extension save vs off.
# Needs a temporary debug build: content.ts must handle localhost/mode?p=<preset> (send setSettings)
# and auto-scroll other pages to the bottom. Also needs the POST-capable test server on :8080.
# Cold cache each run; the debug content script scrolls to the bottom so lazy content loads too.
U=D417C08E-EB24-429A-A560-118488597732
D=${D:-$(mktemp -d)}  # work dir for logs and CSV output
CACHE="$(xcrun simctl get_app_container $U com.apple.mobilesafari data)/Library/Caches/com.apple.mobilesafari/WebKit/NetworkCache"
LOG=$D/server.log
OUT=$D/results.csv
WAIT=45

PAGES=(
  "naver-article-1|https://n.news.naver.com/mnews/article/023/0004003148"
  "naver-article-2|https://n.news.naver.com/mnews/article/009/0005746854"
  "naver-home|https://news.naver.com/"
  "daum-article-video|https://v.daum.net/v/20261011184046655"
  "daum-article-photo|https://v.daum.net/v/20261006063017958"
)

set_mode() {
  xcrun simctl terminate $U com.apple.mobilesafari 2>/dev/null
  : > $LOG
  xcrun simctl openurl $U "http://localhost:8080/mode?p=$1"
  for _ in $(seq 20); do grep -q "ack?p=$1&ok=true" $LOG && return 0; sleep 1; done
  echo "mode $1 not acknowledged" >&2; exit 1
}

measure() { # name url mode rep
  xcrun simctl terminate $U com.apple.mobilesafari 2>/dev/null
  sleep 1
  rm -rf "$CACHE"/*
  nettop -P -x -n -s 1 -L $((WAIT + 2)) > $D/nt_run.csv 2>/dev/null &
  local np=$!
  sleep 1
  xcrun simctl openurl $U "$2"
  wait $np
  # Per WebKit pid: growth over the run (a pid that appears mid-run started from 0).
  local bytes
  bytes=$(grep "com.apple.WebKi\." $D/nt_run.csv | awk -F, '
    NR==1 { t0=$1 }
    { pid=$2; v=$5+0; if (!(pid in first)) { first[pid]=($1==t0)? v : 0 } last[pid]=v }
    END { s=0; for (p in last) s+=last[p]-first[p]; print s }')
  echo "$1,$3,$4,$bytes" | tee -a $OUT
}

echo "page,mode,rep,bytes_in" > $OUT
for mode in save off; do
  set_mode $mode
  for rep in 1 2; do
    for p in "${PAGES[@]}"; do measure "${p%%|*}" "${p#*|}" $mode $rep; done
  done
done
set_mode save
echo done
