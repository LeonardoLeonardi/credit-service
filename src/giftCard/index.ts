import {
  emitEvent,
  subscribe,
  Message,
  readLastMessage,
  combineSubscriber,
  sendCommand,
} from "@keix/message-store-client";

import {
  runCardExistProjector,
  runVerifyAmountProjector,
  runVerifyDeliveryProjector,
  runVerifyErrorProjector,
  runVerifyPendingProjector,
  runVerifyProcessingProjector,
} from "./projector";

import {
  EventCredits,
  CommandTypeCredit,
  EventTypeCredit,
} from "../credits/types";

import { CommandCard, CommandTypeCard, EventTypeCard } from "./types";

async function businnesLogic(cmd: CommandCard) {
  if (await isLastMessageAfterGlobalPosition(`giftCard-${cmd.data.id}`, cmd)) {
    return;
  }

  switch (cmd.type) {
    case CommandTypeCard.ADD_GIFT_CARD:
      return emitEvent({
        category: "giftCard",
        id: cmd.data.id,
        event: EventTypeCard.GIFT_CARD_ADDED,
        data: {
          id: cmd.data.id,
          amounts: cmd.data.amounts,
          name: cmd.data.name,
          description: cmd.data.description,
          image_url: cmd.data.image_url,
        },
      });
    case CommandTypeCard.UPDATE_GIFT_CARD:
      if (await runCardExistProjector(cmd.data.id)) {
        return emitEvent({
          category: "giftCard",
          id: cmd.data.id,
          event: EventTypeCard.GIFT_CARD_UPDATED,
          data: {
            id: cmd.data.id,
            name: cmd.data.name,
            description: cmd.data.description,
          },
        });
      } else {
        return emitEvent({
          category: "giftCard",
          id: cmd.data.id,
          event: EventTypeCard.GIFT_CARD_ERROR,
          data: {
            type: "CardNotExist",
          },
        });
      }

    case CommandTypeCard.REMOVE_GIFT_CARD:
      if (await runCardExistProjector(cmd.data.id)) {
        return emitEvent({
          category: "giftCard",
          id: cmd.data.id,
          event: EventTypeCard.GIFT_CARD_REMOVED,
          data: {
            id: cmd.data.id,
          },
        });
      } else {
        return emitEvent({
          category: "giftCard",
          id: cmd.data.id,
          event: EventTypeCard.GIFT_CARD_ERROR,
          data: {
            type: "CardNotExist",
          },
        });
      }
    case CommandTypeCard.REDEEM_GIFT_CARD:
      if (await runVerifyPendingProjector(cmd.data.transactionId)) {
        return;
      }
      await emitEvent({
        category: "giftCardTransaction",
        id: cmd.data.transactionId,
        event: EventTypeCard.GIFT_CARD_REDEEM_PENDING,
        data: cmd.data,
      });
      if (
        (await runCardExistProjector(cmd.data.idCard)) &&
        (await runVerifyAmountProjector(cmd.data.idCard, cmd.data.amount))
      ) {
        return await sendCommand({
          command: CommandTypeCredit.USE_CREDITS,
          category: "creditAccount",
          data: {
            transactionId: cmd.data.transactionId,
            amountCredit: cmd.data.amount,
            id: cmd.data.id,
          },
        });
      } else {
        return emitEvent({
          category: "giftCardTransaction",
          id: cmd.data.id,
          event: EventTypeCard.GIFT_CARD_REDEEM_FAILED,
          data: {
            id: cmd.data.id,
            type: "RedeemError",
          },
        });
      }
    case CommandTypeCard.DELIVERY_GIFT_CARD:
      if (
        (await runVerifyProcessingProjector(cmd.data.transactionId)) &&
        !(await runVerifyDeliveryProjector(cmd.data.transactionId))
      ) {
        return await emitEvent({
          category: "giftCardTransaction",
          id: cmd.data.transactionId,
          event: EventTypeCard.GIFT_CARD_REDEEM_SUCCEDED,
          data: {
            id: cmd.data.transactionId,
          },
        });
      } else {
        if (
          !(await runVerifyDeliveryProjector(cmd.data.transactionId)) &&
          !(await runVerifyErrorProjector(cmd.data.transactionId))
        ) {
          return emitEvent({
            category: "giftCardTransaction",
            id: cmd.data.transactionId,
            event: EventTypeCard.GIFT_CARD_REDEEM_FAILED,
            data: {
              id: cmd.data.transactionId,
              type: "DeliveryError",
            },
          });
        }
      }
  }
}

async function businnesLogicCredits(event: EventCredits) {
  switch (event.type) {
    case EventTypeCredit.CREDITS_USED:
      if (!(await runVerifyPendingProjector(event.data.transactionId))) {
        return;
      }
      return await emitEvent({
        category: "giftCardTransaction",
        id: event.data.transactionId,
        event: EventTypeCard.GIFT_CARD_REDEEM_PROCESSING,
        data: event.data,
      });
    case EventTypeCredit.CREDITS_EARNED:
    //return console.log(event, "GUADAGNO");
  }
}

export async function runGiftCard() {
  return combineSubscriber(
    subscribe(
      {
        streamName: "giftCard:command",
      },
      businnesLogic
    ),
    subscribe(
      {
        streamName: "giftCardTransaction:command",
      },
      businnesLogic
    ),
    subscribe(
      {
        streamName: "creditAccount",
      },
      businnesLogicCredits
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
