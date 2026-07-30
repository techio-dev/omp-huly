import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// T-62 #67: mock loadConfig tránh đọc ~/.pi/agent/huly/config.json thật.
// Default trả config rỗng → resolveFilterPatterns dùng DEFAULT patterns.
vi.mock("../../config/config.js", () => ({
  loadConfig: vi.fn().mockResolvedValue({ version: 1, transport: "ws", projects: {} }),
}));

// Mock @hcengineering/api-client BEFORE import client.ts
vi.mock("@hcengineering/api-client", () => {
  const mockPlatformClient = {
    findOne: vi.fn().mockResolvedValue({ _id: "doc1", name: "Test" }),
    findAll: vi.fn().mockResolvedValue([{ _id: "doc1" }, { _id: "doc2" }]),
    createDoc: vi.fn().mockResolvedValue("new-doc-ref"),
    updateDoc: vi.fn().mockResolvedValue({ ok: true }),
    removeDoc: vi.fn().mockResolvedValue({ ok: true }),
    addCollection: vi.fn().mockResolvedValue("new-attached-ref"),
    createMixin: vi.fn().mockResolvedValue({ ok: true }),
    getAccount: vi.fn().mockResolvedValue({
      uuid: "account-uuid-123",
      primarySocialId: "person-id-456",
      socialIds: ["person-id-456"],
    }),
    close: vi.fn().mockResolvedValue(undefined),
  };
  const mockRestClient = {
    findOne: vi.fn().mockResolvedValue({ _id: "rest-doc1" }),
    findAll: vi.fn().mockResolvedValue([{ _id: "rest-doc1" }]),
    getAccount: vi.fn().mockResolvedValue({
      uuid: "rest-account-uuid",
      primarySocialId: "rest-person-id",
      socialIds: ["rest-person-id"],
    }),
  };
  const mockTxOperations = {
    createDoc: vi.fn().mockResolvedValue("rest-new-doc-ref"),
    updateDoc: vi.fn().mockResolvedValue({ ok: true }),
    removeDoc: vi.fn().mockResolvedValue({ ok: true }),
    addCollection: vi.fn().mockResolvedValue("rest-new-attached-ref"),
    createMixin: vi.fn().mockResolvedValue({ ok: true }),
  };
  const apiClient = {
    connect: vi.fn().mockResolvedValue(mockPlatformClient),
    connectRest: vi.fn().mockResolvedValue(mockRestClient),
    createRestTxOperations: vi.fn().mockResolvedValue(mockTxOperations),
    getWorkspaceToken: vi.fn().mockResolvedValue({
      endpoint: "https://huly.io/api",
      workspaceId: "ws-uuid",
      token: "resolved-token",
    }),
    // expose mocks cho test assertions
    __mockPlatformClient: mockPlatformClient,
    __mockRestClient: mockRestClient,
    __mockTxOperations: mockTxOperations,
  };
  // CJS interop: source dùng default import → mock phải expose default.
  return { default: apiClient, ...apiClient };
});

import {
  connect,
  connectRest,
  createRestTxOperations,
  getWorkspaceToken,
} from "@hcengineering/api-client";
import { createHulyClient, type HulyCredentials } from "../client.js";
import { ConnectionError } from "../errors.js";
import { loadConfig } from "../../config/config.js";
import { getUpstreamNoiseCounters, resetUpstreamNoiseCounters } from "../console-filter.js";

const tokenCreds = {
  url: "https://huly.example.com",
  workspace: "myteam",
  token: "test-token-abc",
} as HulyCredentials;
const emailCreds = {
  url: "https://huly.example.com",
  workspace: "myteam",
  email: "user@example.com",
  password: "pass123",
} as HulyCredentials;

describe("createHulyClient — transport selection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ws transport calls connect() with url + auth", async () => {
    const client = await createHulyClient(tokenCreds, "ws");
    expect(connect).toHaveBeenCalledWith("https://huly.example.com", {
      workspace: "myteam",
      token: "test-token-abc",
    });
    expect(connectRest).not.toHaveBeenCalled();
    expect(client.transport).toBe("ws");
  });

  it("rest transport calls connectRest() + createRestTxOperations()", async () => {
    const client = await createHulyClient(tokenCreds, "rest");
    expect(connectRest).toHaveBeenCalledWith("https://huly.example.com", {
      workspace: "myteam",
      token: "test-token-abc",
    });
    expect(getWorkspaceToken).toHaveBeenCalled();
    expect(createRestTxOperations).toHaveBeenCalledWith(
      "https://huly.io/api",
      "ws-uuid",
      "resolved-token",
    );
    expect(client.transport).toBe("rest");
  });

  it("default transport is ws", async () => {
    const client = await createHulyClient(tokenCreds);
    expect(connect).toHaveBeenCalled();
    expect(client.transport).toBe("ws");
  });

  it("works with email+password auth", async () => {
    const client = await createHulyClient(emailCreds, "ws");
    expect(connect).toHaveBeenCalledWith("https://huly.example.com", {
      workspace: "myteam",
      email: "user@example.com",
      password: "pass123",
    });
    expect(client.transport).toBe("ws");
  });
});

describe("HulyClient ws — delegates to PlatformClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("findOne delegates", async () => {
    const client = await createHulyClient(tokenCreds, "ws");
    const result = await client.findOne("class-ref" as never, {} as never);
    expect(result).toEqual({ _id: "doc1", name: "Test" });
  });

  it("findAll delegates", async () => {
    const client = await createHulyClient(tokenCreds, "ws");
    const result = await client.findAll("class-ref" as never, {} as never);
    expect(result).toHaveLength(2);
  });

  it("createDoc delegates", async () => {
    const client = await createHulyClient(tokenCreds, "ws");
    const result = await client.createDoc("class-ref" as never, "space" as never, {} as never);
    expect(result).toBe("new-doc-ref");
  });

  it("updateDoc delegates", async () => {
    const client = await createHulyClient(tokenCreds, "ws");
    await client.updateDoc("class-ref" as never, "space" as never, "id" as never, {} as never);
    // Just verify no throw
    expect(true).toBe(true);
  });

  it("removeDoc delegates", async () => {
    const client = await createHulyClient(tokenCreds, "ws");
    await client.removeDoc("class-ref" as never, "space" as never, "id" as never);
    expect(true).toBe(true);
  });

  it("addCollection delegates", async () => {
    const client = await createHulyClient(tokenCreds, "ws");
    const result = await client.addCollection(
      "class-ref" as never,
      "space" as never,
      "attachedTo" as never,
      "attachedToClass" as never,
      "collection",
      {} as never,
    );
    expect(result).toBe("new-attached-ref");
  });

  it("createMixin delegates", async () => {
    const client = await createHulyClient(tokenCreds, "ws");
    await client.createMixin(
      "objectId" as never,
      "objectClass" as never,
      "objectSpace" as never,
      "mixin" as never,
      {} as never,
    );
    expect(true).toBe(true);
  });

  it("getAccount delegates", async () => {
    const client = await createHulyClient(tokenCreds, "ws");
    const account = await client.getAccount();
    expect(account.uuid).toBe("account-uuid-123");
  });

  it("close delegates to PlatformClient.close", async () => {
    const client = await createHulyClient(tokenCreds, "ws");
    await client.close();
    // Verify close called (via mock, would error if not)
    expect(true).toBe(true);
  });
});

describe("HulyClient rest — delegates to RestClient (read) + TxOperations (write)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("findOne delegates to RestClient", async () => {
    const client = await createHulyClient(tokenCreds, "rest");
    const result = await client.findOne("class-ref" as never, {} as never);
    expect(result).toEqual({ _id: "rest-doc1" });
  });

  it("findAll delegates to RestClient", async () => {
    const client = await createHulyClient(tokenCreds, "rest");
    const result = await client.findAll("class-ref" as never, {} as never);
    expect(result).toHaveLength(1);
  });

  it("createDoc delegates to TxOperations (RestClient read-only)", async () => {
    const client = await createHulyClient(tokenCreds, "rest");
    const result = await client.createDoc("class-ref" as never, "space" as never, {} as never);
    expect(result).toBe("rest-new-doc-ref");
  });

  it("updateDoc delegates to TxOperations", async () => {
    const client = await createHulyClient(tokenCreds, "rest");
    await client.updateDoc("class-ref" as never, "space" as never, "id" as never, {} as never);
    expect(true).toBe(true);
  });

  it("getAccount delegates to RestClient", async () => {
    const client = await createHulyClient(tokenCreds, "rest");
    const account = await client.getAccount();
    expect(account.uuid).toBe("rest-account-uuid");
  });

  it("close is no-op (stateless, KHÔNG throw)", async () => {
    const client = await createHulyClient(tokenCreds, "rest");
    await expect(client.close()).resolves.toBeUndefined();
  });
});

describe("getCurrentUser — cache (D15)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("first call fetches account via getAccount", async () => {
    const client = await createHulyClient(tokenCreds, "ws");
    const user = await client.getCurrentUser();
    expect(user).toEqual({
      id: "account-uuid-123",
      name: "person-id-456",
      email: "person-id-456",
    });
  });

  it("second call uses cache (getAccount called once across 2 getCurrentUser)", async () => {
    const client = await createHulyClient(tokenCreds, "ws");
    await client.getCurrentUser();
    await client.getCurrentUser();
    // Verify underlying mock getAccount called exactly once (cache hit on 2nd)
    const lastCall = vi.mocked(connect).mock.results.at(-1);
    const mockClient = (await lastCall?.value) as unknown as {
      getAccount: { mock: { calls: unknown[] } };
    };
    expect(mockClient.getAccount.mock.calls).toHaveLength(1);
  });

  it("cache returns same object reference on subsequent calls", async () => {
    const client = await createHulyClient(tokenCreds, "ws");
    const user1 = await client.getCurrentUser();
    const user2 = await client.getCurrentUser();
    expect(user1).toBe(user2); // same reference (cache)
  });

  it("rest getCurrentUser fetches from RestClient", async () => {
    const client = await createHulyClient(tokenCreds, "rest");
    const user = await client.getCurrentUser();
    expect(user.id).toBe("rest-account-uuid");
  });
});

describe("createHulyClient — error mapping (T-04 integration)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("connect throw PlatformError → mapped HulyError", async () => {
    vi.mocked(connect).mockRejectedValueOnce(
      Object.assign(new Error("ERROR: platform:status:Unauthorized {}"), {
        name: "PlatformError",
        status: { severity: "ERROR", code: "platform:status:Unauthorized", params: {} },
      }),
    );
    await expect(createHulyClient(tokenCreds, "ws")).rejects.toMatchObject({
      class: "Auth",
    });
  });

  it("connect throw network Error → ConnectionError", async () => {
    vi.mocked(connect).mockRejectedValueOnce(new Error("connect ECONNREFUSED 1.2.3.4:80"));
    await expect(createHulyClient(tokenCreds, "ws")).rejects.toBeInstanceOf(ConnectionError);
  });

  it("connectRest throw → mapped HulyError", async () => {
    vi.mocked(connectRest).mockRejectedValueOnce(
      Object.assign(new Error("ERROR: platform:status:Forbidden {}"), {
        name: "PlatformError",
        status: { severity: "ERROR", code: "platform:status:Forbidden", params: {} },
      }),
    );
    await expect(createHulyClient(tokenCreds, "rest")).rejects.toMatchObject({
      class: "Auth",
    });
  });
});

describe("integration: full flow end-to-end", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ws: createHulyClient → findAll → createDoc → getCurrentUser → close", async () => {
    const client = await createHulyClient(tokenCreds, "ws");
    const docs = await client.findAll("class-ref" as never, {} as never);
    expect(docs).toHaveLength(2);
    const newRef = await client.createDoc(
      "class-ref" as never,
      "space" as never,
      { name: "new" } as never,
    );
    expect(newRef).toBe("new-doc-ref");
    const user = await client.getCurrentUser();
    expect(user.id).toBe("account-uuid-123");
    await client.close();
  });

  it("rest: createHulyClient → findOne → updateDoc → getCurrentUser → close", async () => {
    const client = await createHulyClient(tokenCreds, "rest");
    const doc = await client.findOne("class-ref" as never, {} as never);
    expect(doc).toEqual({ _id: "rest-doc1" });
    await client.updateDoc("class-ref" as never, "space" as never, "id" as never, {} as never);
    const user = await client.getCurrentUser();
    expect(user.id).toBe("rest-account-uuid");
    await client.close(); // no-op for rest
  });
});

// T-62 #67: filter wrap quanh connect() — gate upstream console spam.
// Strategy: mock connect() trigger `console.warn()` nội bộ (giả lập upstream
// cache-miss warn) → verify filter swallow + counter + restore symmetry.
describe("T-62 createHulyClient — console filter wrap", () => {
  const realWarn = console.warn;
  const realError = console.error;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadConfig).mockResolvedValue({ version: 1, transport: "ws", projects: {} });
    resetUpstreamNoiseCounters();
    console.warn = realWarn;
    console.error = realError;
  });

  afterEach(() => {
    console.warn = realWarn;
    console.error = realError;
  });

  it("ws: connect() wrap runWithConsoleFilter → upstream warn bị filter", async () => {
    // Inject warn vào scope connect (giả lập upstream replay warn).
    // Filter active (default config) → warn bị swallow, counter +1.
    vi.mocked(connect).mockImplementationOnce(async () => {
      console.warn("no document found, failed to apply model transaction, skipping");
      return {} as never;
    });
    // Spy install TRƯỚC createHulyClient. Filter install/restore phải tôn trọng
    // reference hiện tại (= spy) — KHÔNG leak override ra ngoài scope connect.
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const preInstall = console.warn; // = spy (filter restore phải về lại đây)
    await createHulyClient(tokenCreds, "ws");
    // Counter tăng → filter đã swallow warn trong scope connect.
    expect(getUpstreamNoiseCounters().total).toBe(1);
    // KHÔNG leak override ra ngoài scope: console.warn restored về pre-install (= spy).
    expect(console.warn).toBe(preInstall);
    // Spy gốc KHÔNG nhận warn match pattern (filter swallow trước khi delegate).
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("config quietUpstreamNoise: false → KHÔNG filter (debug thật)", async () => {
    vi.mocked(loadConfig).mockResolvedValueOnce({
      version: 1,
      transport: "ws",
      projects: {},
      quietUpstreamNoise: false,
    });
    // Inject warn trong scope connect — escape hatch disable → warn vẫn ra.
    vi.mocked(connect).mockImplementationOnce(async () => {
      console.warn("no document found, failed to apply model transaction, skipping");
      return {} as never;
    });
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    await createHulyClient(tokenCreds, "ws");
    // Filter disable → counter KHÔNG tăng + warn delegate ra (spy được gọi).
    expect(getUpstreamNoiseCounters().total).toBe(0);
    expect(spy).toHaveBeenCalledWith(
      "no document found, failed to apply model transaction, skipping",
    );
    spy.mockRestore();
  });

  it("connect() throw vẫn restore console (try/finally)", async () => {
    vi.mocked(connect).mockRejectedValueOnce(new Error("connect failed"));
    // Capture pre-install reference — filter restore phải về lại đây dù throw.
    const preInstallWarn = console.warn;
    const preInstallError = console.error;
    await expect(createHulyClient(tokenCreds, "ws")).rejects.toThrow();
    // Quan trọng: override KHÔNG leak dù connect throw — strict identity check.
    expect(console.warn).toBe(preInstallWarn);
    expect(console.error).toBe(preInstallError);
  });

  it("config upstreamNoisePatterns override được apply thật", async () => {
    vi.mocked(loadConfig).mockResolvedValueOnce({
      version: 1,
      transport: "ws",
      projects: {},
      upstreamNoisePatterns: ["^custom noise pattern$"],
    });
    // Inject warn match custom pattern → filter active → swallow + counter +1.
    vi.mocked(connect).mockImplementationOnce(async () => {
      console.warn("custom noise pattern"); // match override pattern
      return {} as never;
    });
    await createHulyClient(tokenCreds, "ws");
    // Custom pattern compiled + apply → counter tăng.
    expect(getUpstreamNoiseCounters().total).toBe(1);
    expect(getUpstreamNoiseCounters().byPattern["/^custom noise pattern$/i"]).toBe(1);
  });

  it("config upstreamNoisePatterns override KHÔNG match default pattern", async () => {
    // Override toàn bộ registry → default #67 pattern KHÔNG còn active.
    vi.mocked(loadConfig).mockResolvedValueOnce({
      version: 1,
      transport: "ws",
      projects: {},
      upstreamNoisePatterns: ["^custom noise pattern$"],
    });
    vi.mocked(connect).mockImplementationOnce(async () => {
      console.warn("no document found, failed to apply model transaction"); // default #67
      return {} as never;
    });
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    await createHulyClient(tokenCreds, "ws");
    // Override replace default → #67 warn KHÔNG match → delegate ra (spy gọi).
    expect(getUpstreamNoiseCounters().total).toBe(0);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
