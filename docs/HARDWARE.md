# Hardware and Banana Pi

## Installed bench system

Verified on 18–19 October 2026: Banana Pi BPI-M4-Zero V2, 4 GB RAM, ARM64 Armbian 26.8.8 / Debian 13, kernel 6.18.54-current-sunxi64, Python 3.13.5. The official SD image passed checksum/write-readback checks. SSH and the external Wi-Fi antenna were exercised. Last observed DHCP address was `192.168.29.251`; it can change.

`/opt/vizor/.venv` contains OpenCV 4.12.0.88, Ultralytics 8.3.228, CPU Torch 2.14.1, Torchvision 0.29.1, NumPy 2.2.6, NCNN 1.0.20260526 and PySerial 3.5. `pip check` passed. Use `vision-ai/deploy/requirements.txt` after installing CPU Torch/Torchvision compatible with the OS/Python; do not apply an x86 evaluation lock blindly to ARM.

Source, sample, notices and Nano exports live under `/opt/vizor`. `vision-ai/deploy/provision.sh` is an installer for a previously extracted, hash-verified `/opt/vizor` bundle; it is not an SD flasher or a generic clone installer. The initial provisioning hook is already complete on the current board. No reflashing is needed for the photo demo.

## Wi-Fi changes without reflashing

The current image uses Netplan with systemd-networkd. Before leaving a working network, use `sudoedit /etc/netplan/30-wifis-dhcp.yaml` and add another access point under `network.wifis.wlan0.access-points`, keeping existing entries:

```yaml
        "YOUR_PHONE_HOTSPOT":
          password: "ENTER_LOCALLY"
```

Keep the file root-owned with mode 600. Validate with `sudo netplan generate`, then use `sudo netplan try --timeout 120`. Confirm only when connectivity works; otherwise allow rollback. Never paste passwords into command arguments, Git, chat or screenshots. A 2.4 GHz WPA2 phone hotspot matching an already saved network can also reconnect the board without editing or reflashing it.

On a future NetworkManager image, use `sudo nmtui` or `nmcli --ask device wifi connect "NETWORK_NAME"`; do not replace this board's network manager remotely just to add a profile. [Armbian networking](https://docs.armbian.com/user-guide/networking/).

Use a suitably rated 5 V supply and the correct power/USB data ports. The external Wi-Fi antenna is required for the demonstrated wireless setup. SSH host keys are pinned on the setup computer; do not disable host verification. Its private setup key remains outside Git.

## Photo worker

The current service is `vizor-photo.service`, running as `helmet`, using `/etc/vizor-photo.env` (root-owned, mode 600). See [Live demo](LIVE_DEMO.md) for credentials, service commands and installation. It needs internet, the pretrained Nano640 NCNN export and no camera/GPS/OLED. It owns no serial device.

```sh
sudo systemctl status vizor-photo.service
sudo journalctl -u vizor-photo.service -n 30 --no-pager
```

The full-camera `vizor.service` template is separate and must be adapted to actual camera/ports/account before enabling it. Do not enable it while those peripherals are absent. One inference process must own the MCU UART.

## Recorded-input measurements

The actual Pi was measured on one Indian RDD2022 still at confidence 0.30, four threads, one warm-up and three timed predictions. Camera, network and display latency were excluded.

| Runtime / input | Median prediction | Potholes on sample |
| --- | ---: | ---: |
| Nano PyTorch 640 | 1440.1 ms | 1 |
| Nano NCNN 320 | 137.9 ms | 0 |
| Nano NCNN 416 | 223.0 ms | 0 |
| Nano NCNN 640 | 518.2 ms | 1 |

Keep Nano640: smaller inputs missed this pothole. Later cloud photo jobs measured 1481 ms cold, then approximately 538–932 ms on individual positive images, and 514 ms on a blank negative. These are still-image measurements, not sustained FPS or a riding-safety guarantee.

Repeat the installed software check from the board:

```sh
cd /opt/vizor
.venv/bin/python vision-ai/deploy/verify.py --require-arm64
```

It checks hashes, inference/parity, MJPEG encode/decode and a replay outbox without publishing cloud observations. The video repeats a still and relaxes lane gates for this off-centre fixture; it is not moving-road validation. Local/board verification artifacts are retained privately outside Git.

## SIM7600X

The USB-connected HAT identified as SIMCOM_SIM7600G-H, firmware LE20B04SIM7600G22, USB ID `1e0e:9001`. With its GNSS antenna outdoors, AT/NMEA and three application-reader fixes passed. Coordinates were omitted from the saved report. No SIM was installed, so cellular data was not checked.

The tested AT port was `/dev/ttyUSB2`, NMEA `/dev/ttyUSB1`; enumeration is not guaranteed. Run `python vision-ai/gps_sim7600x.py --mode at --once` with confirmed ports. A brief USB `-71` error recovered through re-enumeration; persistent power/USB stability remains unverified. The modem port must differ from the MCU UART. Detailed connector/power notes: [SIM7600X wiring](../hardware/wiring/sim7600x.md).

## Next physical checks

ESP32-CAM MJPEG/reconnects; moving GNSS accuracy/fix age and camera synchronization; measured IMU timing; MCU UART/BLE; simultaneous real OLED navigation/warnings; push-to-talk; battery measurement; sustained temperature, power and latency. Camera-frame hazard distances and OLED readability cannot be certified remotely. [Bill of materials](../hardware/BOM.md) and [optics](../hardware/optics/README.md) remain design references, not proof every component is installed.
