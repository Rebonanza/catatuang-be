export class UserResponseDto {
  id: string;
  email: string;
  name: string;
  googleId: string | null;
  avatarUrl: string | null;
  hasPassword: boolean;
  createdAt: Date;
  updatedAt: Date;
}
