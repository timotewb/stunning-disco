#include <Arduino.h>
#include <Wire.h>

// ====== CONFIG ======
#define SDA_PIN PIN_104
#define SCL_PIN PIN_106
#define LED_PIN PIN_015   // nice!nano onboard LED

// ====== STARTUP BLINK ======
void startupDelay() {
    Serial.println();
    Serial.println("================================");
    Serial.println("Booting... waiting 5 seconds");
    Serial.println("Open Serial Monitor NOW");
    Serial.println("================================");

    for (int i = 0; i < 10; i++) {
        digitalWrite(LED_PIN, HIGH);
        Serial.println("Startup blink...");
        delay(250);

        digitalWrite(LED_PIN, LOW);
        delay(250);
    }

    Serial.println("Starting I2C scanner...");
    Serial.println();
}

// ====== I2C SCANNER ======
void scanI2C() {
    Serial.println("Scanning I2C bus...");

    int foundDevices = 0;

    for (uint8_t address = 1; address < 127; address++) {
        Wire.beginTransmission(address);
        uint8_t error = Wire.endTransmission();

        if (error == 0) {
            Serial.print("Found device at 0x");
            if (address < 16) Serial.print("0");
            Serial.println(address, HEX);

            // Blink LED quickly when device found
            digitalWrite(LED_PIN, HIGH);
            delay(100);
            digitalWrite(LED_PIN, LOW);

            foundDevices++;
        }
    }

    if (foundDevices == 0) {
        Serial.println("No I2C devices found.");
    } else {
        Serial.print("Scan complete. Devices found: ");
        Serial.println(foundDevices);
    }

    Serial.println("--------------------------------");
    Serial.println();
}

void setup() {
    pinMode(LED_PIN, OUTPUT);
    digitalWrite(LED_PIN, LOW);

    Serial.begin(115200);

    // Small delay to allow USB to enumerate
    delay(500);

    // Wait until Serial is ready (important for nRF52)
    while (!Serial && millis() < 5000) {
        // wait max 5s
    }

    startupDelay();

    // Initialize I2C
    Wire.setPins(SDA_PIN, SCL_PIN);
    Wire.begin();
}

void loop() {
    scanI2C();

    Serial.println("Waiting 5 seconds before next scan...");
    
    // Slow LED heartbeat during wait
    for (int i = 0; i < 5; i++) {
        digitalWrite(LED_PIN, HIGH);
        delay(100);
        digitalWrite(LED_PIN, LOW);
        delay(900);
    }
}
