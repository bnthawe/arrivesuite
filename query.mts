import {db} from "./packages/db/src/client"; import {accounts} from "./packages/db/src/schema"; const all = await db.select().from(accounts); console.log(all.length); await db.$client.end();
