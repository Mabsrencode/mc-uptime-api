import { api, APIError, Gateway, Header } from "encore.dev/api";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";
import { authHandler } from "encore.dev/auth";
import { getAuthData } from "~encore/auth";
import environments from "../lib/environments";

const prisma = new PrismaClient();

interface AuthParams {
  authorization: Header<"Authorization">;
}
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

export const myAuthHandler = authHandler(
  async (params: AuthParams): Promise<{ userID: string }> => {
    const token = params.authorization?.replace("Bearer ", "");

    if (!token) {
      throw APIError.unauthenticated("No token provided");
    }

    try {
      const decoded = jwt.verify(token, environments.JWT) as { userId: string };
      return { userID: decoded.userId };
    } catch (error) {
      throw APIError.unauthenticated("Invalid token");
    }
  }
);

export const gateway = new Gateway({ authHandler: myAuthHandler });

export const dashboardEndpoint = api(
  { auth: true, method: "GET", path: "/dashboard" },
  async (): Promise<{ message: string; userID: string }> => {
    const authData = getAuthData();
    if (!authData) {
      throw APIError.unauthenticated("Authentication data is missing");
    }
    return {
      message: `Welcome to the dashboard, user ${authData.userID}!`,
      userID: authData.userID,
    };
  }
);

export const register = api(
  { method: "POST", path: "/auth/register" },
  async ({ email, password }: RegisterRequest): Promise<AuthResponse> => {
    if (!email || !password) {
      throw APIError.permissionDenied("Missing email or password");
    }
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

    const token = jwt.sign({ userId: user.id }, environments.JWT, {
      expiresIn: "1h",
    });
    return { token };
  }
);

export const login = api(
  { method: "POST", path: "/auth/login" },
  async ({ email, password }: LoginRequest): Promise<AuthResponse> => {
    if (!email || !password) {
      throw APIError.permissionDenied("Missing email or password");
    }
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw APIError.permissionDenied("Invalid email or password");
    }
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      throw APIError.permissionDenied("Invalid email or password");
    }
    const token = jwt.sign({ userId: user.id }, environments.JWT, {
      expiresIn: "1h",
    });
    return { token };
  }
);
