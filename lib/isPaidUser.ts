import { auth, clerkClient } from "@clerk/nextjs/server";

export async function isPaidUser() {
  const { userId } = auth();
  if (!userId) return false;

  const user = await clerkClient.users.getUser(userId);
  return Boolean((user.publicMetadata as any)?.isPaid);
}