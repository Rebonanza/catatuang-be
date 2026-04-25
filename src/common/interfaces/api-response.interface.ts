export interface ApiResponse<T = void> {
  success: boolean;
  data?: T;
  meta?: unknown;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown[];
  };
}
