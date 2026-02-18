#include <Arduino.h>
#include <Wire.h>
#include <Adafruit_AHTX0.h>
#include <Adafruit_BMP280.h>
#include "LowPower.h"
#include "SensorManager.h"

// ====== PIN DEFINITIONS ======
#define SDA_PIN PIN_104
#define SCL_PIN PIN_106
#define LED_PIN PIN_015

// ====== GLOBAL OBJECT ======
SensorManager sensors(SDA_PIN, SCL_PIN, LED_PIN);

void setup() {
    Serial.begin(115200);
    while (!Serial && millis() < 5000) {}

    sensors.begin();
}

void loop() {
    sensors.readAndPrint();

    // Sleep 1000 ms using low power
    LowPower::sleepMs(1000);
}
