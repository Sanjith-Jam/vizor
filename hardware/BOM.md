# Hardware Bill of Materials (BOM)

> Original component proposal. For the actually installed Banana Pi/SIM7600X bench setup and untested peripherals, use [Hardware status](../docs/HARDWARE.md).

Detailed component breakdown, pricing in Indian Rupees (₹), and procurement recommendations for the Core MVP prototype.

| Subsystem | Component Description | Sourcing / Model | Qty | Unit Cost (₹) | Total Cost (₹) |
| :--- | :--- | :--- | :---: | :---: | :---: |
| **Compute** | ESP32-S3 DevKit-C N8R2 / N16R8 (Dual-core, BLE 5.0) | Robu.in / ElectronComponents | 1 | 1,750 | 1,750 |
| **AR Display** | 0.96" I2C SSD1306 OLED (128x64, White/Blue) | Standard Maker Store | 1 | 250 | 250 |
| **Display Optics**| 45° Semi-reflective optical beamsplitter plate (70/30 or 50/50) | Acrylic/Glass optical supplier | 1 | 350 | 350 |
| **Ambient Light** | BH1750 Digital Ambient Light Intensity Sensor (I2C) | Robu.in | 1 | 100 | 100 |
| **Motion Telemetry**| MPU6050 6-DoF Gyroscope + Accelerometer | Standard Maker Store | 1 | 140 | 140 |
| **Positioning** | NEO-6M GPS Module with ceramic patch antenna | Robu.in | 1 | 250 | 250 |
| **Audio Transducers**| Bone Conduction Speaker Pair (1W 8Ω) | Robu / DIY Audio Store | 1 pair | 650 | 650 |
| **Audio Amp** | MAX98357A / PAM8403 Class-D Audio Amplifier | Robu.in | 1 | 150 | 150 |
| **Microphone** | INMP441 Omnidirectional I2S Digital Microphone | Robu.in | 1 | 250 | 250 |
| **Power Source** | 18650 Li-ion 3.7V 2500mAh cell (protected) | Robu.in | 1 | 350 | 350 |
| **Battery Charger**| TP4056 USB-C Li-ion charging & protection module | Standard Maker Store | 1 | 50 | 50 |
| **Power Reg** | AMS1117-3.3V / Ultra-low dropout buck regulator | Standard Maker Store | 1 | 130 | 130 |
| **Controls** | Waterproof momentary push-button switch (IP67) | Generic Electronics | 1 | 50 | 50 |
| **Enclosure** | Spare dummy / non-structural helmet shell | Secondary market | 1 | 1,500 | 1,500 |
| **Mechanical** | 3D Printed PETG/PLA mounting brackets, M2/M3 hardware | In-house 3D printing | 1 set | 700 | 700 |
| **Total Core MVP**| | | | | **₹ 6,870 – 9,500** |

---

## 🔮 Optional Stretch Additions

- **Visual Hazard Camera:** ESP32-CAM / OV2640 Module (~₹450 - ₹750)
- **Cellular Standalone Backup:** SIM800L or A7670C 4G LTE Breakout (~₹1,200 - ₹2,000)
- **Long-Range Intercom:** SX1278 LoRa 433MHz / 868MHz transceiver pair (~₹800 - ₹1,400)
