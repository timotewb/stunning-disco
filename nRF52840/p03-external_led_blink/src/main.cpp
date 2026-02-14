//P0.15 is a built in led, on the nice nano clones from aliexpress it is red.

#include <Arduino.h>

#define LEDI PIN_015 //Set a definiton on pin P0.15 called "LED".
#define LEDX PIN_008 //Set a definiton on pin P0.08 called "LED".

void setup() {
  pinMode(LEDI, OUTPUT); //Set the LED to output mode.
  pinMode(LEDX, OUTPUT); //Set the LED to output mode.
}

void loop() {
  digitalWrite(LEDI, HIGH); //Set the LED to high
  delay(100); //wait 0.5s
  digitalWrite(LEDI, LOW); //Set the LED to low
  delay(100); //wait 0.5s
  digitalWrite(LEDX, HIGH); //Set the LED to high
  delay(100); //wait 0.5s
  digitalWrite(LEDX, LOW); //Set the LED to low
  delay(100); //wait 0.5s
}