export interface AuthUser {
  id: number;
  email: string;
  display_name: string;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}

export interface RegisterRequest {
  email: string;
  password: string;
  display_name: string;
}

/** รูปแบบ error จาก API: { error: "CODE", details: "ข้อความไทย" } */
export interface ApiError {
  error: string;
  details: string;
}
