import { api, APIError } from "encore.dev/api";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET as string;
interface RegisterRequest {
  email: string;
  password: string;
}

interface LoginRequest {
  email: string;
  password: string;
}

interface AuthResponse {
  token: string;
}

export const register = api(
  { method: "POST", path: "/auth/register" },
  async ({ email, password }: RegisterRequest): Promise<AuthResponse> => {
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      throw APIError.alreadyExists("User already exists");
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
      },
    });

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, {
      expiresIn: "1h",
    });
    return { token };
  }
);

export const login = api(
  { method: "POST", path: "/auth/login" },
  async ({ email, password }: LoginRequest): Promise<AuthResponse> => {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw APIError.permissionDenied("Invalid email or password");
    }
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      throw APIError.permissionDenied("Invalid email or password");
    }
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, {
      expiresIn: "1h",
    });

    return {
      token,
    };
  }
);
