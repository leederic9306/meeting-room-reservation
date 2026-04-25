import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { fromZonedTime } from 'date-fns-tz';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { AuthUser } from '../../common/types/auth-user.type';

import { CreateExceptionDto } from './dto/create-exception.dto';
import { CreateRecurrenceDto } from './dto/create-recurrence.dto';
import { DeleteRecurrenceQuery } from './dto/delete-recurrence.query';
import type {
  CreateExceptionResultDto,
  CreateRecurrenceResultDto,
  RecurrenceDto,
} from './dto/recurrence.dto';
import { UpdateRecurrenceDto } from './dto/update-recurrence.dto';
import { RecurrenceService } from './recurrence.service';

const KST = 'Asia/Seoul';

@Controller('recurrences')
@UseGuards(JwtAuthGuard)
export class RecurrenceController {
  constructor(private readonly recurrenceService: RecurrenceService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateRecurrenceDto,
  ): Promise<CreateRecurrenceResultDto> {
    // dtstart는 controller 경계에서 KST → UTC 변환. 입력에 'Z'/오프셋이 포함되어 있으면
    // fromZonedTime은 그 오프셋을 그대로 사용하므로, KST wall-time 입력과 UTC ISO 입력을
    // 모두 안전하게 처리한다 (D-3, docs/06-rrule-poc-result.md).
    const dtstart = fromZonedTime(dto.startAt, KST);
    if (Number.isNaN(dtstart.getTime())) {
      throw new BadRequestException({
        code: 'INVALID_TIME_FORMAT',
        message: 'startAt이 올바르지 않습니다.',
      });
    }
    return this.recurrenceService.create(
      {
        roomId: dto.roomId,
        title: dto.title,
        description: dto.description,
        dtstart,
        durationMinutes: dto.durationMinutes,
        rrule: dto.rrule,
      },
      { id: user.id, role: user.role },
    );
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<RecurrenceDto> {
    return this.recurrenceService.findById(id, { id: user.id, role: user.role });
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRecurrenceDto,
  ): Promise<RecurrenceDto> {
    return this.recurrenceService.update(id, dto, { id: user.id, role: user.role });
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: DeleteRecurrenceQuery,
  ): Promise<void> {
    const from = query.from !== undefined ? fromZonedTime(query.from, KST) : undefined;
    return this.recurrenceService.remove(id, from, { id: user.id, role: user.role });
  }

  @Post(':id/exceptions')
  @HttpCode(HttpStatus.CREATED)
  addException(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateExceptionDto,
  ): Promise<CreateExceptionResultDto> {
    return this.recurrenceService.addException(id, dto, { id: user.id, role: user.role });
  }
}
