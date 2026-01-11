#pragma once

#include "app/app_config.h"
#include "app/measurement_types.h"

namespace sensors {
namespace mpu6050 {

void Init();
bool Read(app::model::Mpu6050Data &data);

}  // namespace mpu6050
}  // namespace sensors
