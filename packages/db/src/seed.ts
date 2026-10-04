import * as argon2 from "argon2";
import { db } from "./client";
import { accounts } from "./schema";

async function hashPassword(password: string) {
  return await argon2.hash(password, { type: argon2.argon2id });
}

async function seed() {
  const password = "password123";
  const passwordHash = await hashPassword(password);

  const accountsData = [
    { email: "admin@arrivesuite.com", passwordHash, realm: "admin" as const, name: "Admin" },
    { email: "supplier@arrivesuite.com", passwordHash, realm: "supplier" as const, name: "Supplier" },
    { email: "agent@arrivesuite.com", passwordHash, realm: "agent" as const, name: "Agent" },
    { email: "customer@arrivesuite.com", passwordHash, realm: "customer" as const, name: "Customer" },
  ];

  for (const account of accountsData) {
    await db
      .insert(accounts)
      .values(account)
      .onConflictDoNothing({ target: accounts.email });
  }

  console.log("Seeded accounts");
  process.exit(0);
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
