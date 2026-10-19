#!/bin/bash
# Called by Armbian's /root/provisioning.sh after unattended account creation.
set -euo pipefail
umask 022
[[ $EUID -eq 0 ]] || { echo 'Run as root.' >&2; exit 1; }
[[ $(uname -m) == aarch64 ]] || { echo 'This installer requires the ARM64 Banana Pi.' >&2; exit 1; }
rider=${1:-helmet}
[[ $rider =~ ^[a-z_][a-z0-9_-]*$ ]] || { echo 'Invalid account name.' >&2; exit 1; }
id "$rider" >/dev/null
root=/opt/vizor
[[ -f $root/SHA256.json && -f $root/vision-ai/deploy/requirements.txt ]] || {
    echo 'Extract the verified Vizor bundle into /opt/vizor first.' >&2; exit 1;
}
touch /var/log/vizor-setup.log
chmod 600 /var/log/vizor-setup.log
exec > >(tee -a /var/log/vizor-setup.log) 2>&1
echo "Vizor setup started: $(date -Is)"
install -d /var/lib/vizor
rm -f /var/lib/vizor/setup-complete
install -d -m 700 -o "$rider" -g "$(id -gn "$rider")" "/home/$rider/.ssh"
if [[ -f /root/.ssh/authorized_keys ]]; then
    touch "/home/$rider/.ssh/authorized_keys"
    while IFS= read -r key; do
        [[ -z $key ]] || grep -qxF -- "$key" "/home/$rider/.ssh/authorized_keys" || \
            printf '%s\n' "$key" >> "/home/$rider/.ssh/authorized_keys"
    done < /root/.ssh/authorized_keys
    chown "$rider:$(id -gn "$rider")" "/home/$rider/.ssh/authorized_keys"
    chmod 600 "/home/$rider/.ssh/authorized_keys"
fi
export DEBIAN_FRONTEND=noninteractive
apt-get -o Acquire::Retries=3 update
apt-get -o Acquire::Retries=3 install -y --no-install-recommends \
    python3-venv ffmpeg libgomp1 libgl1 libglib2.0-0t64 avahi-daemon
python3 -m venv "$root/.venv"
"$root/.venv/bin/python" -m pip install --only-binary=:all: \
    torch==2.14.1 torchvision==0.29.1 --index-url https://download.pytorch.org/whl/cpu
"$root/.venv/bin/python" -m pip install --only-binary=:all: \
    -r "$root/vision-ai/deploy/requirements.txt"
"$root/.venv/bin/python" -m pip check
install -d -o "$rider" -g "$(id -gn "$rider")" "$root/verification"
install -d -o "$rider" -g "$(id -gn "$rider")" "/home/$rider/.config" "/home/$rider/.config/Ultralytics"
systemctl enable --now ssh avahi-daemon
cd "$root"
runuser -u "$rider" -- "$root/.venv/bin/python" "$root/vision-ai/deploy/verify.py" --require-arm64
"$root/.venv/bin/python" -m pip freeze > "$root/verification/requirements-arm64-lock.txt"
date -Is > /var/lib/vizor/setup-complete
echo 'Vizor setup and recorded-input checks passed. Live camera/GPS/OLED tests are still pending.'
