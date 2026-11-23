import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { z } from "zod";
import { connectDatabase } from "../db/index.js";
import { account, user } from "../db/schema.js";

function credentials() {
  const email = z.email().max(254).safeParse(process.env.CASHIER_EMAIL?.trim().toLowerCase());
  const name = z.string().trim().min(1).max(100).safeParse(process.env.CASHIER_NAME);
  const password = z.string().min(12).max(128).refine((value) => value.trim().length >= 12)
    .safeParse(process.env.CASHIER_PASSWORD);
  if (!email.success || !name.success || !password.success) {
    throw new Error("Define CASHIER_EMAIL, CASHIER_NAME y CASHIER_PASSWORD (12 a 128 caracteres; no se imprime).");
  }
  return { email: email.data, name: name.data, password: password.data };
}

const { email, name, password } = credentials();
const { db, pool } = connectDatabase();
try {
  const hash = await hashPassword(password);
  const id = await db.transaction(async (tx) => {
    const [created] = await tx.insert(user).values({
      id: randomUUID(), name, email, role: "cajero",
    }).onConflictDoNothing({ target: user.email }).returning({ id: user.id });
    if (!created) return null;
    await tx.insert(account).values({
      id: randomUUID(), userId: created.id, accountId: created.id, providerId: "credential", password: hash,
    });
    return created.id;
  });
  if (!id) {
    console.error("Este correo ya existe; no se modificó el nombre, el rol ni la contraseña.");
    process.exitCode = 2;
  } else {
    console.log(`Cajero creado: ${email}`);
  }
} catch {
  console.error("No se pudo crear el cajero. Verifica la conexión y las migraciones.");
  process.exitCode = 1;
} finally {
  await pool.end();
}
