import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail({}, { message: '이메일 형식이 올바르지 않습니다.' })
  @MaxLength(255)
  email!: string;

  @IsString()
  @MinLength(1)
  password!: string;
}
