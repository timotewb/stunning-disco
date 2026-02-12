//P0.15 is a built in led, on the nice nano clones from aliexpress it is red.

#include <Arduino.h>

#define LED PIN_015 //Set a definiton on pin P0.15 called "LED".

void setup() {
  pinMode(LED, OUTPUT); //Set the LED to output mode.
}

void loop() {
  digitalWrite(LED, HIGH); //Set the LED to high
  delay(100); //wait 0.5s
  digitalWrite(LED, LOW); //Set the LED to low
  delay(100); //wait 0.5s
}