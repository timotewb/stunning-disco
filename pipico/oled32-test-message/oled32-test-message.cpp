#include "pico/stdlib.h"
#include "pico-ssd1306/ssd1306.h"
#include "pico-ssd1306/textRenderer/TextRenderer.h"
#include "hardware/i2c.h"

// Use the namespace for convenience
using namespace pico_ssd1306;

int main(){
    // Init i2c1 controller at 400kHz (safe for most SSD1306 boards)
    i2c_init(i2c1, 400000);
    // Set up pins 2 and 3
    gpio_set_function(2, GPIO_FUNC_I2C);
    gpio_set_function(3, GPIO_FUNC_I2C);
    gpio_pull_up(2);
    gpio_pull_up(3);

    // If you don't do anything before initializing a display pi pico is too fast and starts sending
    // commands before the screen controller had time to set itself up, so we add an artificial delay for
    // ssd1306 to set itself up
    sleep_ms(250);

    // Create a new display object at the typical 0x3C address for 128x32 panels
    SSD1306 display = SSD1306(i2c1, 0x3C, Size::W128xH32);

    // Here we rotate the display by 180 degrees, so that it's not upside down from my perspective
    // If your screen is upside down try setting it to 1 or 0
    display.setOrientation(0);

    // Draw text on display
    // After passing a pointer to display, we need to tell the function what font and text to use
    // Available fonts are listed in textRenderer's readme
    // Last we tell this function where to anchor the text
    // Anchor means top left of what we draw
    drawText(&display, font_12x16, "TEST text", 0 ,0);

    // Send buffer to the display
    display.sendBuffer();
}