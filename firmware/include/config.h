#pragma once

#include <Arduino.h>

// I2C Bus Pins (OLED, MPU6050, BH1750)
#define I2C_SDA_PIN 21
#define I2C_SCL_PIN 22

// UART GPS Pins (NEO-6M)
#define GPS_RX_PIN 16
#define GPS_TX_PIN 17
#define GPS_BAUDRATE 9600

// Display Parameters
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET -1
#define OLED_I2C_ADDR 0x3C

// Audio & Controls
#define PUSH_TO_TALK_PIN 4
#define AUDIO_MUTE_PIN 5

// Hazard & Fall Detection Thresholds
#define POTHOLE_Z_THRESHOLD 2.5f    // in G's
#define CRASH_DECEL_THRESHOLD 4.0f  // in G's
#define TILT_ROLL_THRESHOLD 60.0f   // in degrees

// Banana Pi BPI-M4 Vision UART Pins
#define BPI_UART_RX_PIN 18
#define BPI_UART_TX_PIN 19
#define BPI_UART_BAUDRATE 115200
#define VISION_ALERT_DURATION_MS 3000

// Banana Pi M4 also forwards SIM7600X GPS fixes on the same UART as
// "GPS:<lat>:<lon>:<fix>" (see vision-ai/gps_sim7600x.py --serial-out).
// A fix older than this is treated as lost.
#define GPS_FIX_TIMEOUT_MS 5000

// Incoming-call alerts (see mobile-app/src/callAlertProtocol.ts). Caller name
// length must match MAX_CALLER_NAME_LENGTH there (sized to fit the default
// 20-byte BLE ATT write payload without MTU negotiation).
#define MAX_CALLER_NAME_LEN 18
// Safety net if the phone's ENDED write is lost (e.g. a BLE disconnect).
#define CALL_ALERT_TIMEOUT_MS 30000

// Push-To-Talk press timing: ignore anything shorter than the debounce as
// switch bounce; while a call is ringing, short = accept, long = decline.
#define PTT_DEBOUNCE_MS 30
#define PTT_LONG_PRESS_MS 600

// MPU6050 IMU: pothole-bump logging + crash/SOS detection (see
// docs/ARCHITECTURE.md's "Hazard & Crash Detection Logic", which POTHOLE_Z_
// THRESHOLD/CRASH_DECEL_THRESHOLD/TILT_ROLL_THRESHOLD above already define
// thresholds for). +-8g accelerometer range keeps CRASH_DECEL_THRESHOLD (4g)
// well clear of the sensor's ceiling instead of clipping at the default +-2g.
#define ACCEL_SENSITIVITY_LSB_PER_G 4096.0f
// Minimum time between two logged pothole-bump events (debounces one physical
// bump spanning several consecutive IMU samples into a single BLE notify).
#define POTHOLE_BUMP_COOLDOWN_MS 1000
// After a big decel spike, how long to watch for a sustained tilt before
// giving up and treating it as a hard bump rather than a crash.
#define CRASH_CONFIRM_WINDOW_MS 2000
// How long the tilt must stay past TILT_ROLL_THRESHOLD, continuously, to
// confirm a crash (this is the "static orientation" the architecture doc
// describes it being checked against).
#define CRASH_STATIC_HOLD_MS 1000
// Rider has this long to press PTT and cancel before the phone is expected
// to treat the crash as real and dispatch SOS.
#define SOS_COUNTDOWN_MS 10000
#define SOS_SENT_DISPLAY_MS 3000

// BH1750 ambient light -> HUD auto-brightness. Lux changes slowly, so it's
// read on an interval rather than every loop iteration.
#define LIGHT_READ_INTERVAL_MS 1000
#define LOW_LIGHT_LUX_THRESHOLD 10.0f
