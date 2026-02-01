import { auth, clerkClient } from "@clerk/nextjs/server";

export async function isPaidUser(): Promise<boolean> {
  // Em algumas versões do Clerk, auth() é async
  const { userId } = await auth();
  if (!userId) return false;

  // Em algumas versões do Clerk, clerkClient é uma função async
  const client = await clerkClient();
  const user = await client.users.getUser(userId);

  const meta = user.publicMetadata as Record<string, unknown>;
  return Boolean(meta?.isPaid);
}