import { combineSubscriber, subscribe } from "@keix/message-store-client";
import { runBalanceProjector } from "../credits/projector";
import { EventCredits, EventTypeCredit } from "../credits/types";
import Redis from "ioredis";

let redis = new Redis();

interface UserTransaction {
  id: string;
  amount: number;
}

export async function getUserAmount(id: string) {
  return await redis.hget("creditsAmount", id);
}
export async function getUserTransactions(
  id: string
): Promise<UserTransaction[]> {
  let transactionsList = await redis.lrange(`creditTransaction-` + id, 0, -1);
  return transactionsList.map((transaction) => {
    return JSON.parse(transaction);
  });
}
export async function hasProcessedTransaction(
  id: string,
  transactionId: string
): Promise<boolean> {
  let transactions = await getUserTransactions(id);
  return (
    transactions.find((d: { id: string }) => d.id == transactionId) != null
  );
}
async function aggregator(event: EventCredits) {
  if (
    (event.type == EventTypeCredit.CREDITS_EARNED ||
      event.type == EventTypeCredit.CREDITS_USED) &&
    (await hasProcessedTransaction(event.data.id, event.data.transactionId))
  ) {
    return;
  }
  switch (event.type) {
    case EventTypeCredit.CREDITS_EARNED: {
      await redis.hincrby("creditsAmount", event.data.id, event.data.amount);
      let transaction: UserTransaction = {
        id: event.data.transactionId,
        amount: event.data.amount,
      };
      await redis.rpush(
        `creditTransaction-` + event.data.id,
        JSON.stringify(transaction)
      );
      break;
    }
    case EventTypeCredit.CREDITS_USED: {
      await redis.hincrby("creditsAmount", event.data.id, -event.data.amount);
      let transaction: UserTransaction = {
        id: event.data.transactionId,
        amount: -event.data.amount,
      };
      await redis.rpush(
        `creditTransaction-` + event.data.id,
        JSON.stringify(transaction)
      );
      break;
    }
  }
}

export async function run() {
  return combineSubscriber(
    subscribe(
      {
        streamName: "creditAccount",
      },
      aggregator
    )
  );
}
