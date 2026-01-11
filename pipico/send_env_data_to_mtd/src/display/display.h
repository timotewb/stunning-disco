#pragma once

#include "app/measurement_types.h"

namespace display {

void Init();
void Render(const app::model::SensorSnapshot &snapshot);

}  // namespace display
