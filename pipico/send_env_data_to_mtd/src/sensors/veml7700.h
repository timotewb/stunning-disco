#pragma once

#include "app/app_config.h"
#include "app/measurement_types.h"

namespace sensors {
namespace veml7700 {

void Init();
bool Read(app::model::Veml7700Data &data);

}  // namespace veml7700
}  // namespace sensors
