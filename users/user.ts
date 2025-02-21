import { api } from "encore.dev/api";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface User {
  id: number;
  email: string;
  createdAt: Date;
  updatedAt: Date;
}

interface ListUsersResponse {
  users: User[];
}

export const listUsers = api(
  { method: "GET", path: "/auth/users" },
  async (): Promise<ListUsersResponse> => {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return { users };
  }
);

interface DeleteUserRequest {
  id: number;
}

interface DeleteUserResponse {
  message: string;
}

export const deleteUser = api(
  { method: "DELETE", path: "/auth/users/:id" },
  async ({ id }: DeleteUserRequest): Promise<DeleteUserResponse> => {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new Error("User not found");
    }

    await prisma.user.delete({ where: { id } });
    return { message: `User with ID ${id} has been deleted` };
  }
);
