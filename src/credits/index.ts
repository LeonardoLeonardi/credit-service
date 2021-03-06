import {
  emitEvent,
  sendCommand,
  subscribe,
  Message,
  readLastMessage,
  combineSubscriber,
} from "@keix/message-store-client";
import { v4 } from "uuid";
import { runBalanceProjector } from "../credits/projector";

import { CommandCredits, CommandTypeCredit, EventTypeCredit } from "./types";

async function businnesLogic(cmd: CommandCredits) {
  const MIN_USE_CREDITS_AMOUNT = 100;
  console.log("=>", cmd);

  if (
    await isLastMessageAfterGlobalPosition(`creditAccount-${cmd.data.id}`, cmd)
  ) {
    return;
  }

  switch (cmd.type) {
    case CommandTypeCredit.EARN_CREDITS:
      if (cmd.data.amount > 0) {
        return emitEvent({
          category: "creditAccount",
          id: cmd.data.id,
          event: EventTypeCredit.CREDITS_EARNED,
          data: {
            id: cmd.data.id,
            transactionId: cmd.data.transactionId ?? v4(),
            amount: cmd.data.amount,
          },
        });
      } else {
        return;
      }
    case CommandTypeCredit.USE_CREDITS:
      let balance = await runBalanceProjector(cmd.data.id);
      if (balance >= MIN_USE_CREDITS_AMOUNT && balance - cmd.data.amount > 0) {
        return emitEvent({
          category: "creditAccount",
          id: cmd.data.id,
          event: EventTypeCredit.CREDITS_USED,
          data: {
            id: cmd.data.id,
            transactionId: cmd.data.transactionId ?? v4(),
            amount: cmd.data.amount,
          },
        });
      } else {
        return emitEvent({
          category: "creditAccount",
          id: cmd.data.id,
          event: EventTypeCredit.CREDITS_ERROR,
          data: {
            id: cmd.data.id,
            type:
              balance >= MIN_USE_CREDITS_AMOUNT
                ? "AmmontoMinimoNonRaggiunto"
                : "FondiNonSufficienti",
          },
        });
      }
  }
}

export async function runCredits() {
  return combineSubscriber(
    subscribe(
      {
        streamName: "creditAccount:command",
      },
      businnesLogic
    )
  );
}

async function isLastMessageAfterGlobalPosition(
  streamName: string,
  message: Message
) {
  const { global_position } = message;
  const lastMsg = await readLastMessage({
    streamName,
  });
  return lastMsg && lastMsg.global_position > global_position;
}
