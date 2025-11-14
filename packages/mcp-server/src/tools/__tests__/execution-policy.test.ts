import { ErrorCode } from "@inchankang/zettel-memory-common";
import { withExecutionPolicy } from "..";

describe("withExecutionPolicy", () => {
  it("retries failures up to the configured limit", async () => {
    let attempts = 0;
    const result = await withExecutionPolicy(
      async () => {
        attempts += 1;
        if (attempts < 3) {
          throw new Error("transient");
        }
        return "ok";
      },
      {
        maxRetries: 3,
        timeoutMs: 100,
      }
    );

    expect(result).toBe("ok");
    expect(attempts).toBe(3);
  });

  it("wraps timeout errors in a MemoryMcpError", async () => {
    await expect(
      withExecutionPolicy(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve("late"), 50);
          }),
        {
          maxRetries: 0,
          timeoutMs: 10,
        }
      )
    ).rejects.toMatchObject({ code: ErrorCode.TIMEOUT_ERROR });
  });
});
