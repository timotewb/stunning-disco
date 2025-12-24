# Button is pressed!

from gpiozero import Button

press_count: int = 0

def say_hello():
    global press_count
    press_count +=1
    print(f"Hello, button count is: {press_count}.")


def reset_count():
    global press_count
    press_count = 0
    print("> button count has been reset.")

button_plus = Button(3)
button_reset = Button(16)

button_plus.when_pressed = say_hello
button_reset.when_pressed = reset_count