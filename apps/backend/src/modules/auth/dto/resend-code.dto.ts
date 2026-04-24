import { IsEmail, MaxLength } from 'class-validator';

export class ResendCodeDto {
  @IsEmail({}, { message: '이메일 형식이 올바르지 않습니다.' })
  @MaxLength(255)
  email!: string;
}
