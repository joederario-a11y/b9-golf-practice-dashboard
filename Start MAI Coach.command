#!/bin/zsh

set -euo pipefail

cd -- "$(dirname -- "$0")"

site_url="http://localhost:3000/"
log_file="$PWD/mai-coach-server.log"
bridge_pid=""
server_pid=""

handle_exit() {
  exit_code=$?
  cleanup

  if (( exit_code != 0 )); then
    echo
    echo "MAI Coach did not start. The startup details are saved here:"
    echo "$log_file"
    read -r "?Press Return to close."
  fi
}

start_ipv4_bridge() {
  if curl -fsS "http://127.0.0.1:3000/" >/dev/null 2>&1; then
    return
  fi

  node -e 'const net=require("net"); const server=net.createServer(client=>{const upstream=net.connect({host:"::1",port:3000}); client.pipe(upstream); upstream.pipe(client); const close=()=>{client.destroy(); upstream.destroy();}; client.on("error",close); upstream.on("error",close);}); server.listen(3000,"127.0.0.1");' &
  bridge_pid="$!"
}

cleanup() {
  if [[ -n "$bridge_pid" ]]; then
    kill "$bridge_pid" >/dev/null 2>&1 || true
  fi

  if [[ -n "$server_pid" ]]; then
    kill "$server_pid" >/dev/null 2>&1 || true
  fi
}

trap handle_exit EXIT
trap 'exit 130' INT TERM

if ! command -v npm >/dev/null 2>&1; then
  echo "Node.js and npm were not found. Install Node.js, then open this launcher again."
  read -r "?Press Return to close."
  exit 1
fi

if [[ ! -d node_modules ]]; then
  echo "Preparing MAI Coach for its first launch..."
  npm install
fi

echo "Starting MAI Coach..."
echo "Keep this window open while using the site. Press Control-C here to stop it."
echo "Startup log: $log_file"

npm run dev -- --host 0.0.0.0 --port 3000 > >(tee "$log_file") 2>&1 &
server_pid="$!"

for attempt in {1..90}; do
  if curl -fsS "$site_url" >/dev/null 2>&1; then
    start_ipv4_bridge
    open "$site_url"
    wait "$server_pid"
    exit $?
  fi
  sleep 1
done

echo "The app did not answer at $site_url in time."
exit 1
