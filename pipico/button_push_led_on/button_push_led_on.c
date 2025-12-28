#include <stdio.h>
#include "pico/stdlib.h"

#define LED_PIN 15
#define BUTTON_PIN 16
#define DEBOUNCE_MS 20

int main()
{
    stdio_init_all();

    // setup LED
    gpio_init(LED_PIN);
    gpio_set_dir(LED_PIN, GPIO_OUT);

    // setup button
    gpio_init(BUTTON_PIN);
    gpio_set_dir(BUTTON_PIN, GPIO_IN);
    gpio_pull_up(BUTTON_PIN);

    bool last_pressed = false;

    while (true)
    {
        // read button state
        bool pressed = !gpio_get(BUTTON_PIN);

        // check if button state changed
        if (pressed != last_pressed)
        {
            // wait for debounce time
            sleep_ms(DEBOUNCE_MS);

            // read button state again to confirm
            pressed = !gpio_get(BUTTON_PIN);

            if (pressed != last_pressed)
            {
                last_pressed = pressed;

                if (pressed)
                {
                    printf("Button Pressed!\n");
                }
            }
        }

        // turn on LED if button is pressed
        gpio_put(LED_PIN, pressed);

        sleep_ms(10);
    }
}