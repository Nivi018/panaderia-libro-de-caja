import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { connectDatabase } from "../db/index.js";
import { account, user } from "../db/schema.js";

const email = "admin@panaderia.local";
const password = process.env.SEED_ADMIN_PASSWORD;
if (!z.string().min(12).max(128).safeParse(password).success || !password) {
  throw new Error("Configura SEED_ADMIN_PASSWORD (12 a 128 caracteres) antes de ejecutar el seed.");
}

const { db, pool } = connectDatabase();

try {
  const passwordHash = await hashPassword(password);
  const result = await db.transaction(async (tx) => {
    const [created] = await tx.insert(user)
      .values({ id: randomUUID(), name: "Administrador", email, role: "admin", emailVerified: true })
      .onConflictDoNothing({ target: user.email })
      .returning({ id: user.id });

    if (!created) {
      const [existing] = await tx.select({ id: user.id, role: user.role }).from(user).where(eq(user.email, email));
      if (!existing || existing.role !== "admin") throw new Error("El correo inicial ya pertenece a un usuario no administrador.");
      const [credential] = await tx.select({ password: account.password }).from(account)
        .where(and(eq(account.userId, existing.id), eq(account.providerId, "credential")));
      if (!credential?.password) throw new Error("El administrador ya existe, pero no tiene credencial de acceso.");
      return "El administrador ya existe; no se modificó.";
    }

    await tx.insert(account).values({
      id: randomUUID(), userId: created.id, accountId: created.id, providerId: "credential", password: passwordHash,
    });
    return `Administrador creado: ${email}`;
  });
  console.log(result);
} finally {
  await pool.end();
}
