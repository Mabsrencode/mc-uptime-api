import { api, APIError } from "encore.dev/api";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface User {
  id: string;
  email: string;
  createdAt: Date;
  updatedAt: Date;
}

interface ListUsersResponse {
  users: User[];
}

export const listUsers = api(
  { method: "GET", path: "/users", auth: true },
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

interface UserRequest {
  id: string;
}

interface DeleteUserResponse {
  message: string;
}

export const getUser = api<UserRequest>(
  {
    method: "GET",
    path: "/user/:id",
    auth: true,
  },
  async (params: UserRequest): Promise<User> => {
    const user = await prisma.user.findUnique({ where: { id: params.id } });
    if (!user) {
      throw APIError.notFound(`User with ID ${params.id} not found`);
    }
    return user;
  }
);

export const deleteUser = api<UserRequest>(
  {
    method: "DELETE",
    path: "/users/:id",
    auth: true,
  },
  async (params: UserRequest): Promise<DeleteUserResponse> => {
    const user = await prisma.user.findUnique({ where: { id: params.id } });
    if (!user) {
      return { message: `User with ID ${params.id} not found` };
    }
    await prisma.user.delete({ where: { id: params.id } });
    return { message: `User with ID ${params.id} has been deleted` };
  }
);
