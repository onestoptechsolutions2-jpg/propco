import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Serves a stored photo. Photos on a unit whose vacancy page is public are
 * open to everyone; all others need a signed-in user from the same company.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const photo = await prisma.photo.findUnique({
    where: { id },
    include: { unit: { select: { listed: true } } },
  });
  if (!photo) return new Response("Not found", { status: 404 });

  const isPublic = !!photo.unit?.listed;
  if (!isPublic) {
    const session = await auth();
    if (!session?.user?.orgId || session.user.orgId !== photo.orgId) {
      return new Response("Not found", { status: 404 });
    }
  }

  return new Response(new Uint8Array(photo.data), {
    headers: {
      "Content-Type": photo.mime,
      "Cache-Control": isPublic ? "public, max-age=3600" : "private, max-age=3600",
    },
  });
}
