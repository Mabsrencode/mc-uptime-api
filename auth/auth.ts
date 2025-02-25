import { api, APIError, Gateway, Header } from "encore.dev/api";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";
import { authHandler } from "encore.dev/auth";
import environments from "../lib/environments";
import nodemailer from "nodemailer";
import otpGenerator from "otp-generator";
import rateLimitMiddleware from "../rate-limit/rateLimit";
const prisma = new PrismaClient();

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: environments.EMAIL_USER,
    pass: environments.EMAIL_PASS,
  },
});

const otpCache: { [email: string]: { otp: string; expiresAt: number } } = {};

interface AuthParams {
  authorization: Header<"Authorization">;
}
interface AuthRequest {
  email: string;
  password: string;
}

interface AuthResponse {
  token: string;
}
interface AuthData {
  userID: string;
  authenticated: boolean;
}

export const auth = authHandler<AuthParams, AuthData>(
  async (params: AuthParams): Promise<AuthData> => {
    const token = params.authorization?.replace("Bearer ", "");
    if (!token) {
      throw APIError.unauthenticated("No token provided");
    }

    const decoded = jwt.verify(token, environments.JWT) as {
      userID?: string;
      password?: string;
      exp?: number;
    };
    if (!decoded || !decoded.userID) {
      throw APIError.unauthenticated("Invalid token payload");
    }

    if (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000)) {
      throw APIError.unauthenticated("Token has expired");
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.userID },
    });
    if (!user) {
      throw APIError.permissionDenied("User not found");
    }
    if (!decoded.password) {
      throw APIError.unauthenticated("Invalid token payload");
    }
    const verify = await bcrypt.compare(user.password, decoded.password);

    return { userID: decoded.userID?.toString(), authenticated: verify };
  }
);

export const gateway = new Gateway({ authHandler: auth });

export const register = api(
  { method: "POST", path: "/auth/register" },
  async (req: {
    email: string;
    password: string;
    ip?: string;
  }): Promise<{ message: string }> => {
    rateLimitMiddleware(req);
    if (!req.email || !req.password) {
      throw APIError.permissionDenied("Missing email or password");
    }
    const existingUser = await prisma.user.findUnique({
      where: { email: req.email },
    });
    if (existingUser) {
      throw APIError.alreadyExists("User already exists");
    }
    const otp = otpGenerator.generate(6, {
      digits: true,
      lowerCaseAlphabets: false,
      upperCaseAlphabets: false,
      specialChars: false,
    });
    otpCache[req.email] = {
      otp,
      expiresAt: Date.now() + 5 * 60 * 1000,
    };

    const mailOptions = {
      from: environments.EMAIL_USER,
      to: req.email,
      subject: "Your OTP for Registration on MC Uptime Monitoring",
      text: `Your OTP is: ${otp}`,
    };

    await transporter.sendMail(mailOptions);

    return {
      message:
        "OTP sent to your email. Please verify to complete registration.",
    };
  }
);

export const verifyOtpAndRegister = api(
  { method: "POST", path: "/auth/verify-otp" },
  async (req: {
    email: string;
    password: string;
    otp: string;
    ip?: string;
  }): Promise<AuthResponse> => {
    rateLimitMiddleware(req);
    if (!req.email || !req.password || !req.otp) {
      throw APIError.permissionDenied("Missing email, password, or OTP");
    }

    const cachedOtp = otpCache[req.email];
    if (!cachedOtp || cachedOtp.otp !== req.otp) {
      throw APIError.permissionDenied("Invalid OTP");
    }

    if (cachedOtp.expiresAt < Date.now()) {
      throw APIError.permissionDenied("OTP has expired");
    }

    const hashedPassword = await bcrypt.hash(req.password, 10);
    const user = await prisma.user.create({
      data: {
        email: req.email,
        password: hashedPassword,
      },
    });

    const token = jwt.sign(
      { userID: user.id.toString(), password: user.password },
      environments.JWT,
      {
        expiresIn: "1h",
      }
    );
    delete otpCache[req.email];

    return { token };
  }
);

export const login = api(
  { method: "POST", path: "/auth/login" },
  async (req: {
    email: string;
    password: string;
    ip?: string;
  }): Promise<AuthResponse> => {
    if (!req.email || !req.password) {
      throw APIError.permissionDenied("Missing email or password");
    }
    const user = await prisma.user.findUnique({ where: { email: req.email } });
    if (!user) {
      throw APIError.notFound("User not found");
    }
    if (!user || !(await bcrypt.compare(req.password, user.password))) {
      throw APIError.permissionDenied("Invalid credentials");
    }
    const passwordMatch = await bcrypt.compare(req.password, user.password);
    if (!passwordMatch) {
      throw APIError.permissionDenied("Password does not match");
    }
    const token = jwt.sign(
      { userID: user.id, password: user.password },
      environments.JWT,
      {
        expiresIn: "1h",
      }
    );
    return { token };
  }
);
