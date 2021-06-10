import { testUtils } from "@keix/message-store-client";
import { v4 } from "uuid";
import {
  getUserAmount,
  getUserTransactions,
  run,
} from "../src/aggregator/aggregator";
import { EventTypeCredit } from "../src/credits/types";

it("should return a positive balance", async () => {
  let idAccount1 = v4();
  let idTransaction1 = v4();
  let idTransaction2 = v4();
  testUtils.setupMessageStore([
    {
      type: EventTypeCredit.CREDITS_EARNED,
      stream_name: "creditAccount-" + idAccount1,
      data: {
        id: idAccount1,
        amount: 30,
        transactionId: idTransaction1,
      },
    },
    {
      type: EventTypeCredit.CREDITS_EARNED,
      stream_name: "creditAccount-" + idAccount1,
      data: {
        id: idAccount1,
        amount: 30,
        transactionId: idTransaction2,
      },
    },
  ]);

  await testUtils.expectIdempotency(run, async () => {
    expect(await getUserAmount(idAccount1)).toEqual("60");
    expect(await getUserTransactions(idAccount1)).toEqual([
      { id: idTransaction1, amount: 30 },
      { id: idTransaction2, amount: 30 },
    ]);
  });
});

it("Should return transaction list", async () => {
  let idAccount1 = v4();
  let idTransaction1 = v4();
  let idTransaction2 = v4();
  let idTransaction3 = v4();
  testUtils.setupMessageStore([
    {
      type: EventTypeCredit.CREDITS_EARNED,
      stream_name: "creditAccount-" + idAccount1,
      data: {
        id: idAccount1,
        amount: 100,
        transactionId: idTransaction1,
      },
    },
    {
      type: EventTypeCredit.CREDITS_EARNED,
      stream_name: "creditAccount-" + idAccount1,
      data: {
        id: idAccount1,
        amount: 50,
        transactionId: idTransaction2,
      },
    },
    {
      type: EventTypeCredit.CREDITS_USED,
      stream_name: "creditAccount-" + idAccount1,
      data: {
        id: idAccount1,
        amount: 25,
        transactionId: idTransaction3,
      },
    },
  ]);
  await testUtils.expectIdempotency(run, async () => {
    expect(await getUserTransactions(idAccount1)).toEqual([
      { id: idTransaction1, amount: 100 },
      { id: idTransaction2, amount: 50 },
      { id: idTransaction3, amount: -25 },
    ]);
  });
});
it("should return a 0 balance", async () => {
  let idAccount1 = v4();
  let idTransaction1 = v4();
  let idTransaction2 = v4();
  testUtils.setupMessageStore([
    {
      type: EventTypeCredit.CREDITS_EARNED,
      stream_name: "creditAccount-" + idAccount1,
      data: {
        id: idAccount1,
        amount: 300,
        transactionId: idTransaction1,
      },
    },
    {
      type: EventTypeCredit.CREDITS_USED,
      stream_name: "creditAccount-" + idAccount1,
      data: {
        id: idAccount1,
        amount: 300,
        transactionId: idTransaction2,
      },
    },
  ]);

  await testUtils.expectIdempotency(run, async () => {
    expect(await getUserAmount(idAccount1)).toEqual("0");
    expect(await getUserTransactions(idAccount1)).toEqual([
      { id: idTransaction1, amount: 300 },
      { id: idTransaction2, amount: -300 },
    ]);
  });
});
