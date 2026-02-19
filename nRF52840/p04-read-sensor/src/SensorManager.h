#pragma once

#include <Arduino.h>
#include <Wire.h>
#include <Adafruit_AHTX0.h>
#include <Adafruit_BMP280.h>

// ===== HSCDTD008A DEFINITIONS =====
#define HSCDTD_ADDR 0x0C
#define HSCDTD_CTRL 0x0B
#define HSCDTD_DATA 0x00

class SensorManager {
public:
    SensorManager(uint8_t sda, uint8_t scl, uint8_t led)
        : _sda(sda), _scl(scl), _led(led) {}

    void begin() {
        pinMode(_led, OUTPUT);
        digitalWrite(_led, LOW);

        Serial.println();
        Serial.println("Initializing Sensors...");

        Wire.setPins(_sda, _scl);
        Wire.setClock(100000);

        // ----- AHT20 -----
        if (!_aht.begin()) {
            Serial.println("ERROR: AHT20 not found");
            errorBlink();
        }

        // ----- BMP280 -----
        if (!_bmp.begin(0x77)) {
            Serial.println("ERROR: BMP280 not found");
            errorBlink();
        }

        // ----- HSCDTD008A -----
        delay(3000);
        initMagnetometer();
        debugMagID();

        Serial.println("All sensors initialized successfully");
        Serial.println();
    }
    void readAndPrint() {
        digitalWrite(_led, HIGH);
        debugMagID();

        // ===== AHT20 =====
        sensors_event_t humidity, temp;
        _aht.getEvent(&humidity, &temp);

        // ===== BMP280 =====
        float pressure = _bmp.readPressure() / 100.0;
        float altitude = _bmp.readAltitude(1013.25);

        // ===== HSCDTD008A =====
        int16_t mx = 0, my = 0, mz = 0;
        bool mag_ok = readMagnetometer(mx, my, mz);
        float heading = computeHeading(mx, my);

        // ===== PRINT =====
        Serial.println("----- Sensor Data -----");

        Serial.print("Temperature: ");
        Serial.print(temp.temperature);
        Serial.println(" °C");

        Serial.print("Humidity: ");
        Serial.print(humidity.relative_humidity);
        Serial.println(" %");

        Serial.print("Pressure: ");
        Serial.print(pressure);
        Serial.println(" hPa");

        Serial.print("Altitude: ");
        Serial.print(altitude);
        Serial.println(" m");

        if (mag_ok) {
            Serial.print("Mag X: "); Serial.print(mx);
            Serial.print("  Y: "); Serial.print(my);
            Serial.print("  Z: "); Serial.println(mz);

            Serial.print("Heading: ");
            Serial.print(heading);
            Serial.println(" °");
        } else {
            Serial.println("Magnetometer read failed");
        }

        Serial.println();

        digitalWrite(_led, LOW);
    }

private:
    uint8_t _sda;
    uint8_t _scl;
    uint8_t _led;

    Adafruit_AHTX0 _aht;
    Adafruit_BMP280 _bmp;

    // ===== HSCDTD INIT =====
void initMagnetometer() {
    Serial.println("Initializing HSCDTD008A...");

    // Step 1: Power Control - set PC bit (active)
    Wire.beginTransmission(HSCDTD_ADDR);
    Wire.write(0x1B);   // Control Register 1
    Wire.write(0x80);   // Set PC bit to 1 (active)
    Wire.endTransmission();
    delay(10);

    // Step 2: Set Normal (Continuous) Mode
    Wire.beginTransmission(HSCDTD_ADDR);
    Wire.write(0x1C);   // Mode register
    Wire.write(0x00);   // Normal (continuous) mode
    Wire.endTransmission();
    delay(10);

    // Optional: Read back registers for debug
    // Read Control Register 1 (0x1B)
    Wire.beginTransmission(HSCDTD_ADDR);
    Wire.write(0x1B);
    Wire.endTransmission(false);
    Wire.requestFrom(HSCDTD_ADDR, (uint8_t)1);
    if (Wire.available()) {
        uint8_t ctrl1 = Wire.read();
        Serial.print("HSCDTD008A CTRL1 reg: 0x");
        Serial.println(ctrl1, HEX);
    } else {
        Serial.println("Failed to read CTRL1 reg");
    }

    // Read Mode Register (0x1C)
    Wire.beginTransmission(HSCDTD_ADDR);
    Wire.write(0x1C);
    Wire.endTransmission(false);
    Wire.requestFrom(HSCDTD_ADDR, (uint8_t)1);
    if (Wire.available()) {
        uint8_t mode = Wire.read();
        Serial.print("HSCDTD008A MODE reg: 0x");
        Serial.println(mode, HEX);
    } else {
        Serial.println("Failed to read MODE reg");
    }

    Serial.println("HSCDTD008A continuous mode enabled");
}



    void debugMagID() {
        Wire.beginTransmission(HSCDTD_ADDR);
        Wire.write(0x0F);  // ID register
        if (Wire.endTransmission(false) != 0) {
            Serial.println("Mag ID read failed (TX error)");
            return;
        }

        Wire.requestFrom(HSCDTD_ADDR, (uint8_t)1);
        if (Wire.available()) {
            uint8_t id = Wire.read();
            Serial.print("Mag WHO_AM_I: 0x");
            Serial.println(id, HEX);
        } else {
            Serial.println("Mag ID read failed (no data)");
        }
    }

    // ===== HSCDTD READ =====
bool readMagnetometer(int16_t &mx, int16_t &my, int16_t &mz) {
    uint8_t reg = 0x00;
    uint8_t raw[6];

    // Set register pointer with repeated start (no stop)
    Wire.beginTransmission(HSCDTD_ADDR);
    Wire.write(reg);
    if (Wire.endTransmission(false) != 0) {
        Serial.println("Magnetometer register pointer set failed");
        return false;
    }

    // Read 6 bytes
    Wire.requestFrom(HSCDTD_ADDR, (uint8_t)6);
    if (Wire.available() != 6) {
        Serial.println("Magnetometer read failed");
        return false;
    }
    for (int i = 0; i < 6; i++) {
        raw[i] = Wire.read();
    }

    Serial.print("Mag raw bytes: ");
    for (int i = 0; i < 6; i++) {
        Serial.print("0x");
        Serial.print(raw[i], HEX);
        Serial.print(" ");
    }
    Serial.println();

    mx = (raw[0] << 8) | raw[1];
    my = (raw[2] << 8) | raw[3];
    mz = (raw[4] << 8) | raw[5];

    return true;
}







    // ===== HEADING CALCULATION =====
    float computeHeading(int16_t mx, int16_t my) {
        float heading = atan2((float)my, (float)mx);
        heading *= 180.0 / PI;

        if (heading < 0) {
            heading += 360.0;
        }

        return heading;
    }

    void errorBlink() {
        while (1) {
            digitalWrite(_led, HIGH);
            delay(200);
            digitalWrite(_led, LOW);
            delay(200);
        }
    }
};


