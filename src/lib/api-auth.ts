import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";

export class AuthError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "AuthError";
  }
}

export async function getAuthUser(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      throw new AuthError("Authentication required");
    }
    const userId = (session.user as { id?: string }).id;
    if (!userId) {
      throw new AuthError("Invalid session");
    }
    return { userId, email: session.user.email, name: session.user.name };
  } catch (error) {
    if (error instanceof AuthError) {
      throw error;
    }
    throw new AuthError("Authentication failed");
  }
}

export function handleAuthError(error: unknown) {
  if (error instanceof AuthError) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 401 }
    );
  }
  throw error; // Re-throw non-auth errors
}
