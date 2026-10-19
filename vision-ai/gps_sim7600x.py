#!/usr/bin/env python3
"""
Waveshare SIM7600X GNSS reader for the Banana Pi BPI-M4.

The SIM7600X supplies both 4G LTE connectivity and GNSS. This script powers the
GNSS engine and streams position fixes as line-delimited JSON on stdout, so the
rest of the helmet stack (telemetry logging, SOS dispatch, HUD ground speed) can
consume them without pulling in a heavy GPS dependency.

Two read paths are supported:

* ``at``   - poll ``AT+CGPSINFO`` on the modem's AT command port. Works over a
             single USB CDC port and needs no dedicated NMEA device.
* ``nmea`` - read raw NMEA sentences from the SIM7600X's dedicated NMEA port and
             parse ``$--GGA`` / ``$--RMC``.

The parse helpers (``parse_cgpsinfo``, ``parse_nmea_gga``, ``parse_nmea_rmc``,
``nmea_to_decimal``) are pure and dependency-free so they can be unit tested
without hardware (see ``test_gps_sim7600x.py``).
"""

import argparse
import json
import sys
import time

try:
    import serial
except ImportError:
    serial = None


# --------------------------------------------------------------------------- #
# Pure parsing helpers (no hardware, stdlib only)
# --------------------------------------------------------------------------- #

def nmea_to_decimal(value: str, hemisphere: str):
    """Convert an NMEA ``ddmm.mmmm`` / ``dddmm.mmmm`` value to signed decimal degrees.

    ``value``      e.g. ``"4807.038"`` (latitude) or ``"01131.000"`` (longitude)
    ``hemisphere`` one of ``N``, ``S``, ``E``, ``W``

    Returns ``None`` when the value is blank or malformed.
    """
    if value is None:
        return None
    value = value.strip()
    hemisphere = (hemisphere or "").strip().upper()
    if not value or hemisphere not in ("N", "S", "E", "W"):
        return None

    try:
        raw = float(value)
    except ValueError:
        return None

    degrees = int(raw // 100)
    minutes = raw - degrees * 100
    decimal = degrees + minutes / 60.0
    if hemisphere in ("S", "W"):
        decimal = -decimal
    return round(decimal, 6)


def _nmea_checksum_ok(sentence: str) -> bool:
    """Validate an NMEA ``*HH`` checksum. Sentences without one are accepted."""
    sentence = sentence.strip()
    if "*" not in sentence:
        return True
    body, _, checksum = sentence[1:].partition("*")
    try:
        expected = int(checksum[:2], 16)
    except ValueError:
        return False
    actual = 0
    for char in body:
        actual ^= ord(char)
    return actual == expected


def parse_nmea_gga(line: str):
    """Parse a ``$--GGA`` sentence into a fix dict, or ``None`` if not a valid GGA."""
    line = (line or "").strip()
    if len(line) < 6 or line[3:6] != "GGA" or not line.startswith("$"):
        return None
    if not _nmea_checksum_ok(line):
        return None

    fields = line.split("*")[0].split(",")
    if len(fields) < 10:
        return None

    lat = nmea_to_decimal(fields[2], fields[3])
    lon = nmea_to_decimal(fields[4], fields[5])
    quality = fields[6].strip()
    has_fix = quality.isdigit() and int(quality) > 0 and lat is not None and lon is not None

    def _to_float(text):
        try:
            return float(text)
        except (TypeError, ValueError):
            return None

    return {
        "source": "GGA",
        "fix": has_fix,
        "lat": lat,
        "lon": lon,
        "sats": int(fields[7]) if fields[7].strip().isdigit() else None,
        "hdop": _to_float(fields[8]),
        "alt_m": _to_float(fields[9]),
        "utc": fields[1].strip() or None,
    }


def parse_nmea_rmc(line: str):
    """Parse a ``$--RMC`` sentence into a fix dict, or ``None`` if not a valid RMC."""
    line = (line or "").strip()
    if len(line) < 6 or line[3:6] != "RMC" or not line.startswith("$"):
        return None
    if not _nmea_checksum_ok(line):
        return None

    fields = line.split("*")[0].split(",")
    if len(fields) < 9:
        return None

    status = fields[2].strip().upper()
    lat = nmea_to_decimal(fields[3], fields[4])
    lon = nmea_to_decimal(fields[5], fields[6])
    has_fix = status == "A" and lat is not None and lon is not None

    def _to_float(text):
        try:
            return float(text)
        except (TypeError, ValueError):
            return None

    return {
        "source": "RMC",
        "fix": has_fix,
        "lat": lat,
        "lon": lon,
        "speed_kn": _to_float(fields[7]),
        "course_deg": _to_float(fields[8]),
        "utc": fields[1].strip() or None,
        "date": fields[9].strip() or None if len(fields) > 9 else None,
    }


def parse_cgpsinfo(line: str):
    """Parse a SIM7600X ``+CGPSINFO`` response.

    Fix present::

        +CGPSINFO: 3113.343286,N,12121.234567,E,250420,081806.0,44.1,0.0,0.0

    No fix yet::

        +CGPSINFO: ,,,,,,,,

    Returns a dict with ``fix`` set accordingly, or ``None`` if the line is not a
    ``+CGPSINFO`` payload at all.
    """
    line = (line or "").strip()
    if "+CGPSINFO:" not in line:
        return None

    payload = line.split("+CGPSINFO:", 1)[1].strip()
    fields = payload.split(",")
    if len(fields) < 4:
        return None
    fields += [""] * (9 - len(fields))

    lat = nmea_to_decimal(fields[0], fields[1])
    lon = nmea_to_decimal(fields[2], fields[3])

    def _to_float(text):
        try:
            return float(text)
        except (TypeError, ValueError):
            return None

    return {
        "source": "CGPSINFO",
        "fix": lat is not None and lon is not None,
        "lat": lat,
        "lon": lon,
        "date": fields[4].strip() or None,
        "utc": fields[5].strip() or None,
        "alt_m": _to_float(fields[6]),
        "speed_kn": _to_float(fields[7]),
        "course_deg": _to_float(fields[8]),
    }


# --------------------------------------------------------------------------- #
# Serial helpers (hardware)
# --------------------------------------------------------------------------- #

def _open_port(port, baud, timeout=1.0):
    if serial is None:
        print("[ERROR] pyserial not installed. Run: pip3 install -r requirements.txt")
        return None
    try:
        handle = serial.Serial(port, baud, timeout=timeout)
        print(f"[INFO] Opened {port} @ {baud} baud.")
        return handle
    except Exception as exc:  # serial.SerialException and friends
        print(f"[ERROR] Could not open {port}: {exc}")
        return None


def _send_at(handle, command, settle=0.3):
    """Send one AT command and return the decoded response text."""
    handle.reset_input_buffer()
    handle.write((command + "\r\n").encode("ascii"))
    time.sleep(settle)
    chunk = handle.read(handle.in_waiting or 128)
    return chunk.decode("ascii", errors="replace")


def enable_gnss(handle) -> bool:
    """Power the GNSS engine. Tolerates 'already on'. Tries CGPS then CGNSSPWR."""
    for command in ("AT+CGPS=1", "AT+CGNSSPWR=1"):
        response = _send_at(handle, command, settle=0.5)
        if "OK" in response or "already" in response.lower():
            print(f"[INFO] GNSS enabled via {command}.")
            return True
    print("[WARN] GNSS power command not acknowledged; the module may already be tracking.")
    return False


def _emit(reading, args, serial_out):
    """Print JSON and optionally forward a compact line to the ESP32."""
    if args.json:
        print(json.dumps(reading, separators=(",", ":")), flush=True)
    if serial_out is not None and reading.get("fix"):
        line = f"GPS:{reading['lat']:.6f}:{reading['lon']:.6f}:1\n"
        serial_out.write(line.encode("ascii"))


def run_at_mode(args, serial_out):
    modem = _open_port(args.at_port, args.baud)
    if modem is None:
        return 1
    enable_gnss(modem)

    try:
        while True:
            response = _send_at(modem, "AT+CGPSINFO", settle=0.4)
            reading = None
            for raw in response.splitlines():
                reading = parse_cgpsinfo(raw) or reading
            if reading is None:
                reading = {"source": "CGPSINFO", "fix": False, "lat": None, "lon": None}
            _emit(reading, args, serial_out)
            if args.once:
                return 0
            time.sleep(args.interval)
    except KeyboardInterrupt:
        print("\n[INFO] Stopping GNSS reader.")
        return 0
    finally:
        modem.close()


def run_nmea_mode(args, serial_out):
    # Powering GNSS still goes through the AT port when it is reachable.
    modem = _open_port(args.at_port, args.baud)
    if modem is not None:
        enable_gnss(modem)
        modem.close()

    nmea = _open_port(args.nmea_port, args.baud)
    if nmea is None:
        return 1

    try:
        while True:
            raw = nmea.readline().decode("ascii", errors="replace")
            if not raw:
                continue
            reading = parse_nmea_gga(raw) or parse_nmea_rmc(raw)
            if reading is None:
                continue
            _emit(reading, args, serial_out)
            if args.once and reading.get("fix"):
                return 0
    except KeyboardInterrupt:
        print("\n[INFO] Stopping GNSS reader.")
        return 0
    finally:
        nmea.close()


def parse_args(argv=None):
    parser = argparse.ArgumentParser(description="SIM7600X GNSS reader for the Banana Pi M4")
    parser.add_argument("--mode", choices=("at", "nmea"), default="at",
                        help="Read via AT+CGPSINFO polling (default) or the dedicated NMEA port")
    parser.add_argument("--at-port", default="/dev/ttyUSB2",
                        help="SIM7600X AT command port (default: /dev/ttyUSB2)")
    parser.add_argument("--nmea-port", default="/dev/ttyUSB1",
                        help="SIM7600X NMEA port, used in --mode nmea (default: /dev/ttyUSB1)")
    parser.add_argument("--baud", type=int, default=115200, help="Serial baud rate")
    parser.add_argument("--interval", type=float, default=1.0,
                        help="Seconds between polls in --mode at (default: 1.0)")
    parser.add_argument("--once", action="store_true",
                        help="Emit a single reading (a single fix in --mode nmea) then exit")
    parser.add_argument("--no-json", dest="json", action="store_false",
                        help="Suppress the JSON stdout stream (useful with --serial-out only)")
    parser.add_argument("--serial-out", default=None,
                        help="Optional serial port to forward compact GPS:<lat>:<lon>:<fix> lines to the ESP32")
    parser.add_argument("--serial-out-baud", type=int, default=115200,
                        help="Baud rate for --serial-out (default: 115200)")
    return parser.parse_args(argv)


def main(argv=None):
    args = parse_args(argv)

    serial_out = None
    if args.serial_out:
        serial_out = _open_port(args.serial_out, args.serial_out_baud)
        if serial_out is None:
            print("[WARN] Continuing without ESP32 serial forwarding.")

    try:
        if args.mode == "at":
            return run_at_mode(args, serial_out)
        return run_nmea_mode(args, serial_out)
    finally:
        if serial_out is not None:
            serial_out.close()


if __name__ == "__main__":
    sys.exit(main())
