import { testUtils } from "@keix/message-store-client";
import { v4 } from "uuid";
import { run } from "../src";
import { runBalanceProjector } from "../src/projector";
import { CommandType, EventType } from "../src/types";

it("All'istante zero, tutti gli account hanno un balance di zero crediti", async () => {
  let idAccount1 = v4();
  testUtils.setupMessageStore([]);

  expect(await runBalanceProjector(idAccount1)).toEqual(0);
});

it("Accredito balance ad un dato account", async () => {
  let idAccount1 = v4();
  testUtils.setupMessageStore([
    {
      type: CommandType.EARN_CREDITS,
      stream_name: "creditAccount:command-" + idAccount1,
      data: {
        id: idAccount1,
        amountCredit: 30,
      },
    },
  ]);

  await testUtils.expectIdempotency(run, () => {
    let event = testUtils.getStreamMessages("creditAccount");
    expect(event).toHaveLength(1);
    expect(event[0].type).toEqual(EventType.CREDITS_EARNED);
    expect(event[0].data.id).toEqual(idAccount1);
    expect(event[0].data.amountCredit).toEqual(30);
  });
});

it("Accredito balance negativo ad un dato account", async () => {
  let idAccount1 = v4();
  testUtils.setupMessageStore([
    {
      type: CommandType.EARN_CREDITS,
      stream_name: "creditAccount:command-" + idAccount1,
      data: {
        id: idAccount1,
        amountCredit: -30,
      },
    },
  ]);

  await testUtils.expectIdempotency(run, () => {
    let event = testUtils.getStreamMessages("creditAccount");
    expect(event).toHaveLength(0);
  });
});

it("Addebito sotto al minimo balance ad un dato account", async () => {
  let idAccount1 = v4();
  testUtils.setupMessageStore([
    {
      type: CommandType.USE_CREDITS,
      stream_name: "creditAccount:command-" + idAccount1,
      data: {
        id: idAccount1,
        amountCredit: 30,
      },
    },
  ]);

  expect(await runBalanceProjector(idAccount1)).toEqual(0);

  await testUtils.expectIdempotency(run, () => {
    let event = testUtils.getStreamMessages("creditAccount");
    expect(event).toHaveLength(1);
    expect(event[0].type).toEqual(EventType.CREDITS_ERROR);
    expect(event[0].data.id).toEqual(idAccount1);
    expect(event[0].data.type).toEqual("FondiNonSufficienti");
  });
});

it("Addebito balance oltre il minimo e oltre il balance ad un dato account", async () => {
  let idAccount1 = v4();
  testUtils.setupMessageStore([
    {
      type: EventType.CREDITS_EARNED,
      stream_name: "creditAccount-" + idAccount1,
      data: {
        id: idAccount1,
        amountCredit: 100,
      },
    },
    {
      type: CommandType.USE_CREDITS,
      stream_name: "creditAccount:command-" + idAccount1,
      data: {
        id: idAccount1,
        amountCredit: 130,
      },
    },
  ]);

  await testUtils.expectIdempotency(run, () => {
    let event = testUtils.getStreamMessages("creditAccount");
    expect(event).toHaveLength(2);
    expect(event[1].type).toEqual(EventType.CREDITS_ERROR);
    expect(event[1].data.id).toEqual(idAccount1);
    expect(event[1].data.type).toEqual("AmmontoMinimoNonRaggiunto");
  });

  expect(await runBalanceProjector(idAccount1)).toEqual(100);
});

it("Addebito balance oltre il minimo balance ad un dato account", async () => {
  let idAccount1 = v4();
  testUtils.setupMessageStore([
    {
      type: EventType.CREDITS_EARNED,
      stream_name: "creditAccount-" + idAccount1,
      data: {
        id: idAccount1,
        amountCredit: 130,
      },
    },
    {
      type: CommandType.USE_CREDITS,
      stream_name: "creditAccount:command-" + idAccount1,
      data: {
        id: idAccount1,
        amountCredit: 100,
      },
    },
  ]);

  await testUtils.expectIdempotency(run, () => {
    let event = testUtils.getStreamMessages("creditAccount");
    expect(event).toHaveLength(2);
    expect(event[1].type).toEqual(EventType.CREDITS_USED);
    expect(event[1].data.id).toEqual(idAccount1);
  });

  expect(await runBalanceProjector(idAccount1)).toEqual(30);
});

it("Calcolo balance di un utente", async () => {
  let idAccount1 = v4();
  let idAccount2 = v4();
  testUtils.setupMessageStore([
    {
      type: EventType.CREDITS_EARNED,
      stream_name: "creditAccount-" + idAccount1,
      data: {
        id: idAccount1,
        amountCredit: 30,
      },
    },
    {
      type: EventType.CREDITS_EARNED,
      stream_name: "creditAccount-" + idAccount2,
      data: {
        id: idAccount2,
        amountCredit: 30,
      },
    },
    {
      type: EventType.CREDITS_EARNED,
      stream_name: "creditAccount-" + idAccount1,
      data: {
        id: idAccount1,
        amountCredit: 20,
      },
    },
    {
      type: EventType.CREDITS_EARNED,
      stream_name: "creditAccount-" + idAccount1,
      data: {
        id: idAccount1,
        amountCredit: 50,
      },
    },
  ]);

  expect(await runBalanceProjector(idAccount1)).toEqual(100);
});

it("Calcolo balance misto di un utente", async () => {
  let idAccount1 = v4();
  let idAccount2 = v4();
  testUtils.setupMessageStore([
    {
      type: EventType.CREDITS_EARNED,
      stream_name: "creditAccount-" + idAccount1,
      data: {
        id: idAccount1,
        amountCredit: 70,
      },
    },
    {
      type: EventType.CREDITS_EARNED,
      stream_name: "creditAccount-" + idAccount2,
      data: {
        id: idAccount2,
        amountCredit: 30,
      },
    },
    {
      type: EventType.CREDITS_EARNED,
      stream_name: "creditAccount-" + idAccount1,
      data: {
        id: idAccount1,
        amountCredit: 50,
      },
    },
    {
      type: EventType.CREDITS_USED,
      stream_name: "creditAccount-" + idAccount1,
      data: {
        id: idAccount1,
        amountCredit: 100,
      },
    },
  ]);

  expect(await runBalanceProjector(idAccount1)).toEqual(20);
});

it("Calcolo balance misto di un utente in tempo passato", async () => {
  let idAccount1 = v4();
  let timePast = new Date();
  timePast.setMonth(timePast.getMonth() - 14);
  testUtils.setupMessageStore([
    {
      type: EventType.CREDITS_EARNED,
      stream_name: "creditAccount-" + idAccount1,
      data: {
        id: idAccount1,
        amountCredit: 70,
      },
      time: timePast,
    },
    {
      type: EventType.CREDITS_EARNED,
      stream_name: "creditAccount-" + idAccount1,
      data: {
        id: idAccount1,
        amountCredit: 300,
      },
    },
    {
      type: EventType.CREDITS_EARNED,
      stream_name: "creditAccount-" + idAccount1,
      data: {
        id: idAccount1,
        amountCredit: 50,
      },
      time: timePast,
    },

    {
      type: EventType.CREDITS_USED,
      stream_name: "creditAccount-" + idAccount1,
      data: {
        id: idAccount1,
        amountCredit: 100,
      },
    },
  ]);

  expect(await runBalanceProjector(idAccount1)).toEqual(200);
});
