import { Controller, Get } from '@nestjs/common';

import { type HealthCheckResult, HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  check(): Promise<HealthCheckResult> {
    return this.healthService.check();
  }
}
