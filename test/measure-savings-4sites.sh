#!/bin/bash
# Per-site baseline: bytes received by the simulator's WebKit networking process, 4 modes x 2 reps.
U=D417C08E-EB24-429A-A560-118488597732
D=${D:-$(mktemp -d)}  # work dir for logs and CSV output
CACHE="$(xcrun simctl get_app_container $U com.apple.mobilesafari data)/Library/Caches/com.apple.mobilesafari/WebKit/NetworkCache"
LOG=$D/server.log
OUT=$D/results4.csv
WAIT=45
PAGES=(
  "naver|article-1|https://n.news.naver.com/mnews/article/023/0004003148"
  "naver|article-2|https://n.news.naver.com/mnews/article/009/0005746854"
  "naver|home|https://news.naver.com/"
  "daum|article-video|https://v.daum.net/v/20261011184046655"
  "daum|article-photo|https://v.daum.net/v/20261006063017958"
  "namu|seoul|https://namu.wiki/w/%EC%84%9C%EC%9A%B8%ED%8A%B9%EB%B3%84%EC%8B%9C"
  "namu|korea|https://namu.wiki/w/%EB%8C%80%ED%95%9C%EB%AF%BC%EA%B5%AD"
  "youtube|home|https://m.youtube.com/"
  "youtube|watch|https://m.youtube.com/watch?v=aqz-KE-bpKQ"
)
set_mode() {
  xcrun simctl terminate $U com.apple.mobilesafari 2>/dev/null
  : > $LOG
  xcrun simctl openurl $U "http://localhost:8080/mode?p=$1"
  for _ in $(seq 20); do grep -aq "ack?p=$1&ok=true" $LOG && return 0; sleep 1; done
  echo "mode $1 not acknowledged" >&2; exit 1
}
measure() { # site page url mode rep
  set_mode $4
  xcrun simctl terminate $U com.apple.mobilesafari 2>/dev/null
  sleep 1
  rm -rf "$CACHE"/*
  nettop -P -x -n -s 1 -L $((WAIT + 2)) > $D/nt_run4.csv 2>/dev/null &
  local np=$!
  sleep 1
  xcrun simctl openurl $U "$3"
  wait $np
  local bytes
  bytes=$(grep "com.apple.WebKi\." $D/nt_run4.csv | awk -F, '
    NR==1 { t0=$1 }
    { pid=$2; v=$5+0; if (!(pid in first)) { first[pid]=($1==t0)? v : 0 } last[pid]=v }
    END { s=0; for (p in last) s+=last[p]-first[p]; print s }')
  echo "$1,$2,$4,$5,$bytes" | tee -a $OUT
}
echo "site,page,mode,rep,bytes_in" > $OUT
for rep in 1 2; do
  for mode in off save strong text; do
    for p in "${PAGES[@]}"; do IFS='|' read -r s pg url <<< "$p"; measure "$s" "$pg" "$url" $mode $rep; done
  done
done
set_mode save
echo done
