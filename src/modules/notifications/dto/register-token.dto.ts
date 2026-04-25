import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterTokenDto {
  @ApiProperty({
    example: 'bk3RNwTe3H0:CI2k_HHwgIpoDKCIZvvDMExUdFQ3P1...',
    description: 'Firebase Cloud Messaging Device Token',
  })
  @IsString()
  @IsNotEmpty()
  token: string;
}
