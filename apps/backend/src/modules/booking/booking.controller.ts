import {
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

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { AuthUser } from '../../common/types/auth-user.type';

import { BookingService } from './booking.service';
import type { BookingDto } from './dto/booking.dto';
import { CreateBookingDto } from './dto/create-booking.dto';
import { ListBookingsQuery } from './dto/list-bookings.query';
import { UpdateBookingDto } from './dto/update-booking.dto';

@Controller('bookings')
@UseGuards(JwtAuthGuard)
export class BookingController {
  constructor(private readonly bookingService: BookingService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: ListBookingsQuery): Promise<BookingDto[]> {
    return this.bookingService.list(query, { id: user.id, role: user.role });
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<BookingDto> {
    return this.bookingService.findById(id, { id: user.id, role: user.role });
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateBookingDto): Promise<BookingDto> {
    return this.bookingService.create(dto, { id: user.id, role: user.role });
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBookingDto,
  ): Promise<BookingDto> {
    return this.bookingService.update(id, dto, { id: user.id, role: user.role });
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.bookingService.softDelete(id, { id: user.id, role: user.role });
  }
}
