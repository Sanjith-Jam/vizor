#include <Arduino.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include <MPU6050.h>
#include <BH1750.h>
#include <math.h>
#include "config.h"

// Hardware Instances
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);
HardwareSerial BpiSerial(2); // Hardware UART for Banana Pi M4
MPU6050 mpu;
BH1750 lightMeter;
BLEServer* pServer = nullptr;
BLECharacteristic* pNavCharacteristic = nullptr;
BLECharacteristic* pHazardCharacteristic = nullptr;
BLECharacteristic* pCallCharacteristic = nullptr;
BLECharacteristic* pCallActionCharacteristic = nullptr;
BLECharacteristic* pPttCharacteristic = nullptr;

bool deviceConnected = false;

enum class NavigationDirection : uint8_t {
    LEFT = 1,
    RIGHT = 2,
    STRAIGHT = 3,
    U_TURN = 4,
    DESTINATION = 5,
};

enum class AvoidanceDirection : uint8_t {
    CENTER,
    LEFT,
    RIGHT,
};

// Mirrors mobile-app/src/callAlertProtocol.ts's CallEventType / CallAction.
enum class CallEventType : uint8_t {
    RINGING = 1,
    ENDED = 2,
};

enum class CallAction : uint8_t {
    ACCEPT = 1,
    DECLINE = 2,
};

// Hazard & SOS characteristic payload's EventType (see
// mobile-app/README.md's BLE Protocol Specification).
enum class HazardEventType : uint8_t {
    POTHOLE_BUMP = 1,
    CRASH_DETECTED = 2,
    SOS_CANCELLED = 3,
};

NavigationDirection currentTurnDirection = NavigationDirection::STRAIGHT;
uint16_t currentTurnDistance = 0;

// Vision Hazard State (from Banana Pi M4)
bool visionAlertActive = false;
unsigned long visionAlertStartTime = 0;
AvoidanceDirection currentAvoidanceDirection = AvoidanceDirection::CENTER;

// GPS State (Banana Pi M4 / SIM7600X, forwarded as "GPS:<lat>:<lon>:<fix>")
bool gpsFixValid = false;
float gpsLatitude = 0.0f;
float gpsLongitude = 0.0f;
unsigned long gpsLastFixTime = 0;

// Incoming Call State (phone -> ESP32 over BLE)
bool callAlertActive = false;
unsigned long callAlertStartTime = 0;
char callerName[MAX_CALLER_NAME_LEN + 1] = {0};

// Push-To-Talk press tracking (edge-triggered, non-blocking, debounced)
bool pttPressed = false;
unsigned long pttPressStartTime = 0;
unsigned long pttLastEdgeTime = 0;

// IMU (MPU6050) state: pothole-bump logging + crash/SOS detection.
bool imuAvailable = false;
unsigned long lastPotholeBumpTime = 0;
// A big decel spike arms a short window to check whether it settles into a
// sustained tilt (crash) or the rider stays upright (just a hard bump).
bool crashImpactPending = false;
unsigned long crashImpactTime = 0;
unsigned long crashTiltStartTime = 0;
float lastCrashGForce = 0.0f;
bool crashConfirmed = false;
unsigned long crashConfirmedTime = 0;
// Shown briefly after the SOS countdown expires uncancelled (the phone, not
// the helmet, actually dispatches the SMS/call).
bool sosSentPending = false;
unsigned long sosSentStartTime = 0;

// BH1750 ambient-light state for HUD auto-brightness.
bool lightSensorAvailable = false;
unsigned long lastLightReadTime = 0;

// BLE Service UUIDs
#define SERVICE_UUID          "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
#define NAV_CHAR_UUID         "beb5483e-36e1-4688-b7f5-ea07361b26a8"
#define HAZARD_CHAR_UUID      "1c95d5e3-d8f7-413a-bf3d-7a2e5d7be87e"
// Phone -> ESP32 write: [EventType: 1B][NameLength: 1B][Name: up to MAX_CALLER_NAME_LEN ASCII bytes]
#define CALL_CHAR_UUID        "77c1bfdd-ed70-4894-b5c5-7e973c7793ec"
// ESP32 -> phone notify: [Action: 1B], sent when the rider accepts/declines via PTT
#define CALL_ACTION_CHAR_UUID "1f221721-edb9-4bd8-b18b-df997197e3d0"
#define PTT_CHAR_UUID "f2f8a3d0-0b35-4c68-a951-5cdf7473f001"

class ServerCallbacks : public BLEServerCallbacks {
    void onConnect(BLEServer* pServer) override {
        deviceConnected = true;
    }
    void onDisconnect(BLEServer* pServer) override {
        deviceConnected = false;
        pServer->startAdvertising();
    }
};

class NavDataCallback : public BLECharacteristicCallbacks {
    void onWrite(BLECharacteristic* pCharacteristic) override {
        // Compact packet: [direction: 1 byte][distance metres: 2 bytes, big-endian].
        // No display wording or icon data needs to be sent by the phone.
        auto rxValue = pCharacteristic->getValue();
        if (rxValue.length() != 3) {
            Serial.println("Ignored invalid navigation packet (expected 3 bytes).");
            return;
        }

        uint8_t directionId = static_cast<uint8_t>(rxValue[0]);
        if (directionId < static_cast<uint8_t>(NavigationDirection::LEFT) ||
            directionId > static_cast<uint8_t>(NavigationDirection::DESTINATION)) {
            Serial.println("Ignored navigation packet with unknown direction.");
            return;
        }

        currentTurnDirection = static_cast<NavigationDirection>(directionId);
        currentTurnDistance =
            (static_cast<uint16_t>(static_cast<uint8_t>(rxValue[1])) << 8) |
            static_cast<uint8_t>(rxValue[2]);
    }
};

class CallDataCallback : public BLECharacteristicCallbacks {
    void onWrite(BLECharacteristic* pCharacteristic) override {
        // [EventType: 1B][NameLength: 1B][Name: up to MAX_CALLER_NAME_LEN ASCII bytes]
        auto rxValue = pCharacteristic->getValue();
        if (rxValue.length() < 2) {
            Serial.println("Ignored invalid call packet (expected at least 2 bytes).");
            return;
        }

        uint8_t eventType = static_cast<uint8_t>(rxValue[0]);
        uint8_t nameLen = static_cast<uint8_t>(rxValue[1]);
        size_t available = rxValue.length() - 2;
        // Plain clamping (not std::min/Arduino's min() macro, which only takes 2 args).
        size_t copyLen = nameLen;
        if (copyLen > available) copyLen = available;
        if (copyLen > static_cast<size_t>(MAX_CALLER_NAME_LEN)) copyLen = MAX_CALLER_NAME_LEN;

        if (eventType == static_cast<uint8_t>(CallEventType::RINGING)) {
            for (size_t i = 0; i < copyLen; i++) {
                callerName[i] = static_cast<char>(rxValue[2 + i]);
            }
            callerName[copyLen] = '\0';
            callAlertActive = true;
            callAlertStartTime = millis();
            Serial.println("Incoming call: " + String(callerName));
        } else {
            // ENDED (or anything else): the phone is telling us to clear the alert.
            callAlertActive = false;
        }
    }
};

void sendCallAction(CallAction action) {
    uint8_t payload[1] = {static_cast<uint8_t>(action)};
    pCallActionCharacteristic->setValue(payload, 1);
    pCallActionCharacteristic->notify();
}

// [EventType: 1B][G-Force: 2B big-endian, g*100][Lat: 4B big-endian, deg*1e6]
// [Lon: 4B big-endian, deg*1e6]. Fixed-point lat/lon (matching the 6-decimal
// precision vision-ai/gps_sim7600x.py already uses) avoids float-endianness
// ambiguity for whoever implements the phone-side decoder.
void sendHazardEvent(HazardEventType eventType, float gForce) {
    float clampedG = gForce;
    if (clampedG < 0.0f) clampedG = 0.0f;
    if (clampedG > 655.35f) clampedG = 655.35f;
    uint16_t gForceFixed = static_cast<uint16_t>(clampedG * 100.0f + 0.5f);

    // Widen to double for this multiply: gpsLatitude/gpsLongitude * 1e6 easily
    // exceeds float's ~7 significant digits, which would round to the nearest
    // multiple of a few micro-degrees on its own.
    int32_t latFixed = gpsFixValid ? static_cast<int32_t>(static_cast<double>(gpsLatitude) * 1000000.0) : 0;
    int32_t lonFixed = gpsFixValid ? static_cast<int32_t>(static_cast<double>(gpsLongitude) * 1000000.0) : 0;

    uint8_t payload[11];
    payload[0] = static_cast<uint8_t>(eventType);
    payload[1] = static_cast<uint8_t>((gForceFixed >> 8) & 0xFF);
    payload[2] = static_cast<uint8_t>(gForceFixed & 0xFF);
    payload[3] = static_cast<uint8_t>((static_cast<uint32_t>(latFixed) >> 24) & 0xFF);
    payload[4] = static_cast<uint8_t>((static_cast<uint32_t>(latFixed) >> 16) & 0xFF);
    payload[5] = static_cast<uint8_t>((static_cast<uint32_t>(latFixed) >> 8) & 0xFF);
    payload[6] = static_cast<uint8_t>(static_cast<uint32_t>(latFixed) & 0xFF);
    payload[7] = static_cast<uint8_t>((static_cast<uint32_t>(lonFixed) >> 24) & 0xFF);
    payload[8] = static_cast<uint8_t>((static_cast<uint32_t>(lonFixed) >> 16) & 0xFF);
    payload[9] = static_cast<uint8_t>((static_cast<uint32_t>(lonFixed) >> 8) & 0xFF);
    payload[10] = static_cast<uint8_t>(static_cast<uint32_t>(lonFixed) & 0xFF);

    BpiSerial.printf("IMU:%u:%.2f\n", static_cast<unsigned>(eventType), clampedG);
    pHazardCharacteristic->setValue(payload, sizeof(payload));
    pHazardCharacteristic->notify();
}

const char* navigationLabel(NavigationDirection direction) {
    switch (direction) {
        case NavigationDirection::LEFT: return "LEFT";
        case NavigationDirection::RIGHT: return "RIGHT";
        case NavigationDirection::STRAIGHT: return "STRAIGHT";
        case NavigationDirection::U_TURN: return "U-TURN";
        case NavigationDirection::DESTINATION: return "DESTINATION";
    }
    return "STRAIGHT";
}

const char* avoidanceLabel(AvoidanceDirection direction) {
    switch (direction) {
        case AvoidanceDirection::LEFT: return "LEFT";
        case AvoidanceDirection::RIGHT: return "RIGHT";
        case AvoidanceDirection::CENTER: return "CENTER";
    }
    return "CENTER";
}

void drawThickLine(int x1, int y1, int x2, int y2) {
    display.drawLine(x1, y1, x2, y2, SSD1306_WHITE);
    display.drawLine(x1 + 1, y1, x2 + 1, y2, SSD1306_WHITE);
    display.drawLine(x1, y1 + 1, x2, y2 + 1, SSD1306_WHITE);
}

void drawDirectionArrow(NavigationDirection direction, int x, int y, int size) {
    int centerX = x + size / 2;
    int centerY = y + size / 2;

    switch (direction) {
        case NavigationDirection::LEFT:
            drawThickLine(centerX, y + size, centerX, centerY);
            drawThickLine(centerX, centerY, x + size / 3, centerY);
            display.fillTriangle(x, centerY, x + size / 3, y,
                                 x + size / 3, y + size, SSD1306_WHITE);
            break;
        case NavigationDirection::RIGHT:
            drawThickLine(centerX, y + size, centerX, centerY);
            drawThickLine(centerX, centerY, x + size * 2 / 3, centerY);
            display.fillTriangle(x + size, centerY, x + size * 2 / 3, y,
                                 x + size * 2 / 3, y + size, SSD1306_WHITE);
            break;
        case NavigationDirection::STRAIGHT:
            drawThickLine(centerX, y + size, centerX, y + size / 3);
            display.fillTriangle(centerX, y, x, y + size / 3, x + size, y + size / 3, SSD1306_WHITE);
            break;
        case NavigationDirection::U_TURN:
            drawThickLine(x + size * 3 / 4, y + size, x + size * 3 / 4, y + size / 3);
            drawThickLine(x + size * 3 / 4, y + size / 3, x + size / 3, y + size / 3);
            drawThickLine(x + size / 3, y + size / 3, x + size / 3, y + size * 2 / 3);
            display.fillTriangle(x + size / 3, y + size, x, y + size * 2 / 3,
                                 x + size * 2 / 3, y + size * 2 / 3, SSD1306_WHITE);
            break;
        case NavigationDirection::DESTINATION:
            drawThickLine(x + size / 4, y, x + size / 4, y + size);
            display.drawRect(x + size / 4, y, size * 3 / 4, size / 2, SSD1306_WHITE);
            display.fillRect(x + size / 4, y, size * 3 / 8, size / 4, SSD1306_WHITE);
            display.fillRect(x + size * 5 / 8, y + size / 4, size * 3 / 8, size / 4, SSD1306_WHITE);
            break;
    }
}

bool parseGpsLine(const String& line, float& lat, float& lon, bool& fix) {
    // Format: "GPS:<lat>:<lon>:<fix>", e.g. "GPS:37.774900:-122.419400:1"
    if (!line.startsWith("GPS:")) {
        return false;
    }
    String rest = line.substring(4);
    int latEnd = rest.indexOf(':');
    int lonEnd = rest.indexOf(':', latEnd + 1);
    if (latEnd < 0 || lonEnd < 0) {
        return false;
    }
    lat = rest.substring(0, latEnd).toFloat();
    lon = rest.substring(latEnd + 1, lonEnd).toFloat();
    fix = rest.substring(lonEnd + 1).toInt() != 0;
    return true;
}

void drawCenteredText(const String& text, int y, uint8_t size) {
    int16_t x1, y1;
    uint16_t width, height;
    display.setTextSize(size);
    display.getTextBounds(text, 0, y, &x1, &y1, &width, &height);
    display.setCursor((SCREEN_WIDTH - width) / 2, y);
    display.print(text);
}

void initDisplay() {
    if (!display.begin(SSD1306_SWITCHCAPVCC, OLED_I2C_ADDR)) {
        Serial.println(F("SSD1306 allocation failed"));
        for (;;);
    }
    display.clearDisplay();
    display.setTextColor(SSD1306_WHITE);
    display.setTextSize(1);
    display.setCursor(10, 20);
    display.println(F("AR HUD Initializing..."));
    display.display();
}

void renderHUD(NavigationDirection direction, uint16_t distanceMeters) {
    display.clearDisplay();

    // Small top-right dot confirms a live GPS fix is reaching the ESP32 over UART.
    if (gpsFixValid) {
        display.fillCircle(SCREEN_WIDTH - 4, 4, 2, SSD1306_WHITE);
    }

    // A confirmed crash outranks every other screen: the rider may be down.
    if (crashConfirmed) {
        unsigned long elapsed = millis() - crashConfirmedTime;
        long remainingMs = static_cast<long>(SOS_COUNTDOWN_MS) - static_cast<long>(elapsed);
        int remainingSec = remainingMs > 0 ? static_cast<int>(remainingMs / 1000) + 1 : 0;
        drawCenteredText(String("CRASH DETECTED"), 2, 1);
        drawCenteredText(String("SOS IN ") + String(remainingSec) + "s", 22, 2);
        drawCenteredText(String("PRESS PTT TO CANCEL"), 54, 1);
        display.display();
        return;
    }

    if (sosSentPending) {
        drawCenteredText(String("SOS ACTION NEEDED"), 20, 1);
        drawCenteredText(String("CHECK YOUR PHONE"), 36, 1);
        display.display();
        return;
    }

    // Keep map navigation visible while a vision warning occupies the top line.
    if (visionAlertActive) {
        display.setTextSize(1);
        display.setCursor(0,0);
        display.print(F("! POTHOLE AHEAD"));
        drawDirectionArrow(direction, 8, 21, 27);
        display.setCursor(46,24);
        display.print(navigationLabel(direction));
        display.setCursor(46,41);
        display.print(String(distanceMeters) + " m");
        display.display();
        return;
    }

    // An incoming call is lower priority than a pothole warning, but still
    // takes over the map view until the rider accepts/declines or it ends.
    if (callAlertActive) {
        drawCenteredText(String("INCOMING CALL"), 2, 1);
        drawCenteredText(String(callerName[0] != '\0' ? callerName : "Unknown"), 22, 1);
        drawCenteredText(String("TAP=ACCEPT"), 42, 1);
        drawCenteredText(String("HOLD=DECLINE"), 53, 1);
        display.display();
        return;
    }

    drawDirectionArrow(direction, 50, 1, 28);
    drawCenteredText(String(navigationLabel(direction)), 33, 1);

    if (direction == NavigationDirection::DESTINATION) {
        drawCenteredText(String("ARRIVED"), 49, 1);
    } else {
        drawCenteredText(String(distanceMeters) + " m", 46, 2);
    }

    display.display();
}

void setup() {
    Serial.begin(115200);
    Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN);

    // Banana Pi BPI-M4 Hardware UART
    BpiSerial.begin(BPI_UART_BAUDRATE, SERIAL_8N1, BPI_UART_RX_PIN, BPI_UART_TX_PIN);

    pinMode(PUSH_TO_TALK_PIN, INPUT_PULLUP);
    pinMode(AUDIO_MUTE_PIN, OUTPUT);
    digitalWrite(AUDIO_MUTE_PIN, LOW);

    initDisplay();

    // MPU6050 IMU (pothole-bump + crash/SOS). Optional: a missing/unwired
    // sensor disables IMU features rather than blocking boot, unlike the
    // OLED which the HUD can't function without.
    mpu.initialize();
    imuAvailable = mpu.testConnection();
    if (imuAvailable) {
        mpu.setFullScaleAccelRange(MPU6050_ACCEL_FS_8);
        Serial.println("MPU6050 IMU ready.");
    } else {
        Serial.println("[WARN] MPU6050 not found; pothole-bump/crash detection disabled.");
    }

    // BH1750 ambient light sensor (HUD auto-brightness). Also optional.
    lightSensorAvailable = lightMeter.begin();
    if (!lightSensorAvailable) {
        Serial.println("[WARN] BH1750 not found; HUD auto-brightness disabled.");
    }

    // Initialize BLE
    BLEDevice::init("AR-Helmet-Nav");
    pServer = BLEDevice::createServer();
    pServer->setCallbacks(new ServerCallbacks());

    BLEService* pService = pServer->createService(SERVICE_UUID);

    pNavCharacteristic = pService->createCharacteristic(
        NAV_CHAR_UUID,
        BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_WRITE
    );
    pNavCharacteristic->setCallbacks(new NavDataCallback());

    pHazardCharacteristic = pService->createCharacteristic(
        HAZARD_CHAR_UUID,
        BLECharacteristic::PROPERTY_NOTIFY
    );
    pHazardCharacteristic->addDescriptor(new BLE2902());

    pCallCharacteristic = pService->createCharacteristic(
        CALL_CHAR_UUID,
        BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_WRITE
    );
    pCallCharacteristic->setCallbacks(new CallDataCallback());

    pCallActionCharacteristic = pService->createCharacteristic(
        CALL_ACTION_CHAR_UUID,
        BLECharacteristic::PROPERTY_NOTIFY
    );
    pCallActionCharacteristic->addDescriptor(new BLE2902());

    pPttCharacteristic = pService->createCharacteristic(PTT_CHAR_UUID, BLECharacteristic::PROPERTY_NOTIFY);
    pPttCharacteristic->addDescriptor(new BLE2902());
    pService->start();
    BLEAdvertising* pAdvertising = BLEDevice::getAdvertising();
    pAdvertising->addServiceUUID(SERVICE_UUID);
    pAdvertising->setScanResponse(true);
    BLEDevice::startAdvertising();

    Serial.println("AR Helmet BLE Server ready.");
}

void loop() {
    unsigned long now = millis();

    // Read incoming vision alerts + GPS fixes from Banana Pi M4 over UART
    while (BpiSerial.available()) {
        String line = BpiSerial.readStringUntil('\n');
        line.trim();
        if (line.startsWith("POTHOLE_ALERT")) {
            Serial.println("Vision Alert from Banana Pi M4: " + line);
            if (line.startsWith("POTHOLE_ALERT:LEFT:")) {
                currentAvoidanceDirection = AvoidanceDirection::LEFT;
            } else if (line.startsWith("POTHOLE_ALERT:RIGHT:")) {
                currentAvoidanceDirection = AvoidanceDirection::RIGHT;
            } else {
                currentAvoidanceDirection = AvoidanceDirection::CENTER;
            }
            visionAlertActive = true;
            visionAlertStartTime = now;
        } else if (line.startsWith("GPS:")) {
            float lat, lon;
            bool fix;
            if (parseGpsLine(line, lat, lon, fix) && fix) {
                gpsLatitude = lat;
                gpsLongitude = lon;
                gpsFixValid = true;
                gpsLastFixTime = now;
            }
        }
    }

    // Auto-clear vision alert after timeout
    if (visionAlertActive && (now - visionAlertStartTime > VISION_ALERT_DURATION_MS)) {
        visionAlertActive = false;
    }

    // Drop a stale GPS fix so the HUD indicator reflects a lost signal
    if (gpsFixValid && (now - gpsLastFixTime > GPS_FIX_TIMEOUT_MS)) {
        gpsFixValid = false;
    }

    // Safety net if the phone's ENDED write never arrives (e.g. BLE dropped).
    if (callAlertActive && (now - callAlertStartTime > CALL_ALERT_TIMEOUT_MS)) {
        callAlertActive = false;
    }

    // --- IMU: pothole-bump logging + crash/SOS detection ---
    if (imuAvailable) {
        int16_t axRaw, ayRaw, azRaw;
        mpu.getAcceleration(&axRaw, &ayRaw, &azRaw);
        float ayG = ayRaw / ACCEL_SENSITIVITY_LSB_PER_G;
        float azG = azRaw / ACCEL_SENSITIVITY_LSB_PER_G;
        float verticalDeviationG = fabs(azG - 1.0f);

        // A big decel spike arms a watch window; if the bike settles into a
        // sustained tilt within it, that's a crash, not just a hard bump.
        if (!crashConfirmed && !crashImpactPending && verticalDeviationG > CRASH_DECEL_THRESHOLD) {
            crashImpactPending = true;
            crashImpactTime = now;
            crashTiltStartTime = 0;
            lastCrashGForce = verticalDeviationG;
        }

        if (crashImpactPending) {
            if (now - crashImpactTime > CRASH_CONFIRM_WINDOW_MS) {
                crashImpactPending = false; // rider recovered; just a hard bump
            } else {
                float rollDeg = atan2(ayG, azG) * 180.0f / PI;
                if (fabs(rollDeg) > TILT_ROLL_THRESHOLD) {
                    if (crashTiltStartTime == 0) {
                        crashTiltStartTime = now;
                    } else if (now - crashTiltStartTime > CRASH_STATIC_HOLD_MS) {
                        crashImpactPending = false;
                        crashConfirmed = true;
                        crashConfirmedTime = now;
                        sendHazardEvent(HazardEventType::CRASH_DETECTED, lastCrashGForce);
                    }
                } else {
                    crashTiltStartTime = 0; // upright again; keep watching the window
                }
            }
        }

        // Background hazard-map signal; a crash-magnitude spike is reported
        // as CRASH_DETECTED above instead, not double-logged as a bump too.
        if (!crashImpactPending && !crashConfirmed &&
            verticalDeviationG > POTHOLE_Z_THRESHOLD &&
            (now - lastPotholeBumpTime > POTHOLE_BUMP_COOLDOWN_MS)) {
            lastPotholeBumpTime = now;
            sendHazardEvent(HazardEventType::POTHOLE_BUMP, verticalDeviationG);
        }
    }

    // SOS countdown: the phone drives the actual dispatch: this just reflects
    // state on the HUD and gives the rider one more visual confirmation.
    if (crashConfirmed && (now - crashConfirmedTime > SOS_COUNTDOWN_MS)) {
        crashConfirmed = false;
        sosSentPending = true;
        sosSentStartTime = now;
    }
    if (sosSentPending && (now - sosSentStartTime > SOS_SENT_DISPLAY_MS)) {
        sosSentPending = false;
    }

    // --- BH1750: throttled ambient-light read driving HUD auto-brightness ---
    if (lightSensorAvailable && (now - lastLightReadTime > LIGHT_READ_INTERVAL_MS)) {
        lastLightReadTime = now;
        float lux = lightMeter.readLightLevel();
        // SSD1306 dim() offers a binary contrast preset, not continuous PWM.
        display.dim(lux >= 0.0f && lux < LOW_LIGHT_LUX_THRESHOLD);
    }

    // Pothole, call, and crash alerts all want the same mute pin; compute the
    // combined state once so clearing one alert can't un-mute over another.
    digitalWrite(AUDIO_MUTE_PIN, (visionAlertActive || callAlertActive || crashConfirmed) ? HIGH : LOW);

    // Render HUD navigation overlay
    renderHUD(currentTurnDirection, currentTurnDistance);

    // Push-To-Talk: debounced, edge-triggered, non-blocking (a blocking
    // delay() here would risk dropping bytes arriving on BpiSerial).
    // Priority while released: cancel an active SOS countdown (any press
    // length - getting this right matters more than timing it), then a
    // ringing call's accept/decline (short/long), then (on the press edge,
    // outside both of those) the voice-assistant trigger.
    bool pttCurrentlyLow = (digitalRead(PUSH_TO_TALK_PIN) == LOW);
    if (pttCurrentlyLow != pttPressed && (now - pttLastEdgeTime) >= PTT_DEBOUNCE_MS) {
        pttLastEdgeTime = now;
        pttPressed = pttCurrentlyLow;

        if (pttPressed) {
            pttPressStartTime = now;
            if (!callAlertActive && !crashConfirmed) {
                if (deviceConnected) {
                    uint8_t toggle = 1;
                    pPttCharacteristic->setValue(&toggle, 1);
                    pPttCharacteristic->notify();
                }
            }
        } else if (crashConfirmed) {
            crashConfirmed = false;
            sendHazardEvent(HazardEventType::SOS_CANCELLED, lastCrashGForce);
        } else if (callAlertActive) {
            bool isLongPress = (now - pttPressStartTime) >= PTT_LONG_PRESS_MS;
            sendCallAction(isLongPress ? CallAction::DECLINE : CallAction::ACCEPT);
            callAlertActive = false;
        }
    }

    delay(50);
}
