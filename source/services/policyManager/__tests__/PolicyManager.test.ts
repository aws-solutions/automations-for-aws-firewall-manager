import "jest";
import { FMSHelper } from "../lib/PolicyHelper";
import { IEvent } from "../lib/exports";
import { handler } from "../index";

describe("PolicyManager", function () {
  describe("Create Event", function () {
    it("fails on fetching ssm parameter", async () => {
      const EVENT = {
        version: "",
        account: "",
        time: "",
        region: "",
        resources: [""],
        detail: {
          operation: "",
          name: "",
          type: "",
          description: "",
        } as { [key: string]: string },
      } as IEvent;
      try {
        FMSHelper.getSSMParameter = jest
          .fn()
          .mockRejectedValue(new Error("err1"));
        await handler(EVENT);
      } catch (e) {
        expect(e.message).toBe("Failed to fetch SSM parameter: err1");
      }
    });
    it("fails to validate tag parameter", async () => {
      const EVENT = {
        version: "",
        account: "",
        time: "",
        region: "",
        resources: [""],
        detail: {
          operation: "",
          name: "",
          type: "",
          description: "",
        } as { [key: string]: string },
      } as IEvent;
      try {
        FMSHelper.getSSMParameter = jest.fn().mockResolvedValue([""]);
        await handler(EVENT);
      } catch (e) {
        expect(e.message).toBe(
          "Failed to validate SSM parameter: tags.toLowerCase is not a function"
        );
      }
    });
  });
});
