// Test T-14 workspace/profile domain (5 tools) — schema + handler delegate.

import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock pool.getClient + resolver (builder sẽ resolve binding trước handler).
vi.mock("../../../client/pool.js", () => ({ getClient: vi.fn() }));
vi.mock("../../../config/resolver.js", () => ({
  resolveWorkspace: vi.fn().mockResolvedValue("ws1"),
  resolveProject: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../../client/errors.js", () => ({
  HulyError: class extends Error {
    readonly class: string;
    constructor(c: string, m: string) {
      super(m);
      this.class = c;
    }
  },
  mapError: vi.fn((e: unknown) => ({
    class: "Internal",
    message: String(e),
  })),
  sanitize: vi.fn((s: string) => s),
  LEAK_PATTERNS: [],
}));

import { getClient } from "../../../client/pool.js";
import { tools } from "../workspace.js";

function makeClient() {
  return {
    getCurrentUser: vi.fn().mockResolvedValue({ id: "u1", name: "User", email: "u@x.com" }),
    findAll: vi.fn(),
    findOne: vi.fn(),
    updateDoc: vi.fn().mockResolvedValue(undefined),
  };
}

const ctx = {
  hasUI: false,
  cwd: "/proj",
  ui: { confirm: vi.fn() },
} as never;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getClient).mockResolvedValue(makeClient() as never);
});

describe("workspace domain — 5 tools registered", () => {
  it("exports 5 tools với huly_ prefix", () => {
    expect(tools).toHaveLength(5);
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual(
      [
        "huly_get_user_profile",
        "huly_get_workspace_info",
        "huly_list_workspace_members",
        "huly_list_workspaces",
        "huly_update_user_profile",
      ].sort(),
    );
  });
});

describe("huly_get_workspace_info", () => {
  it("returns resolved workspace id", async () => {
    const tool = tools.find((t) => t.name === "huly_get_workspace_info")!;
    const result = await tool.execute("tc1", {}, undefined, undefined, ctx);
    expect(result.content[0]?.text).toBe("Workspace: ws1");
    expect(result.details).toEqual({ workspace: "ws1" });
  });
});

describe("huly_list_workspaces", () => {
  // T-74: honest-unavailable (needs account-client HTTP layer).
  it("→ isError (account-client required), findAll KHÔNG gọi", async () => {
    const client = makeClient();
    vi.mocked(getClient).mockResolvedValueOnce(client as never);

    const tool = tools.find((t) => t.name === "huly_list_workspaces")!;
    const result = await tool.execute("tc1", {}, undefined, undefined, ctx);
    expect(result.isError).toBe(true);
    expect(result.details).toMatchObject({ reason: "account_client_layer_required" });
    expect(client.findAll).not.toHaveBeenCalled();
  });
});

describe("huly_list_workspace_members", () => {
  // T-74: honest-unavailable (account-client for roles).
  it("→ isError (account-client required), suggests list_employees", async () => {
    const client = makeClient();
    vi.mocked(getClient).mockResolvedValueOnce(client as never);

    const tool = tools.find((t) => t.name === "huly_list_workspace_members")!;
    const result = await tool.execute("tc1", {}, undefined, undefined, ctx);
    expect(result.isError).toBe(true);
    expect(result.details).toMatchObject({
      reason: "account_client_layer_required",
      alternative: "huly_list_employees",
    });
    expect(client.findAll).not.toHaveBeenCalled();
  });
});

describe("huly_get_user_profile", () => {
  it("returns current user passthrough", async () => {
    const tool = tools.find((t) => t.name === "huly_get_user_profile")!;
    const result = await tool.execute("tc1", {}, undefined, undefined, ctx);
    expect(result.content[0]?.text).toContain("User");
    expect(result.content[0]?.text).toContain("u@x.com");
    expect(result.details).toEqual({
      user: { id: "u1", name: "User", email: "u@x.com" },
    });
  });
});

describe("huly_update_user_profile", () => {
  it("no fields → no update", async () => {
    const client = makeClient();
    vi.mocked(getClient).mockResolvedValueOnce(client as never);
    const tool = tools.find((t) => t.name === "huly_update_user_profile")!;
    const result = await tool.execute("tc1", {}, undefined, undefined, ctx);
    expect(client.updateDoc).not.toHaveBeenCalled();
    expect(result.details).toEqual({ updated: false });
  });

  // T-103 #157: Person resolve qua `personUuid` field (= currentUser.id =
  // account.uuid). Lookup-by-_id fail (Person._id generated, KHÔNG uuid).
  function mockPersonResolve(
    client: ReturnType<typeof makeClient>,
    person: Record<string, unknown>,
  ) {
    client.findOne = vi.fn().mockResolvedValue(person);
  }

  // T-50 #40 + T-82 #105: firstName/lastName → formatName "Last,First".
  it('firstName + lastName → updateDoc với name dạng "Last,First"', async () => {
    const client = makeClient();
    mockPersonResolve(client, { _id: "person-1", space: "ws1-person-space" });
    vi.mocked(getClient).mockResolvedValueOnce(client as never);
    const tool = tools.find((t) => t.name === "huly_update_user_profile")!;
    const result = await tool.execute(
      "tc1",
      { firstName: "Jane", lastName: "Doe" },
      undefined,
      undefined,
      ctx,
    );

    // #157: resolve Person by personUuid (= currentUser.id), KHÔNG _id.
    expect(client.findOne).toHaveBeenCalledWith("contact:class:Person", { personUuid: "u1" });
    expect(client.updateDoc).toHaveBeenCalledWith(
      "contact:class:Person",
      "ws1-person-space",
      "person-1",
      { name: "Doe,Jane" },
    );
    expect(result.details).toMatchObject({ updated: true, name: "Doe,Jane" });
  });

  it("firstName only (partial) → parse current name, giữ lastName cũ", async () => {
    const client = makeClient();
    mockPersonResolve(client, { _id: "person-1", space: "ws1-person-space", name: "Smith,John" });
    vi.mocked(getClient).mockResolvedValueOnce(client as never);
    const tool = tools.find((t) => t.name === "huly_update_user_profile")!;
    await tool.execute("tc1", { firstName: "Johnny" }, undefined, undefined, ctx);

    expect(client.updateDoc).toHaveBeenCalledWith(
      "contact:class:Person",
      "ws1-person-space",
      "person-1",
      { name: "Smith,Johnny" },
    );
  });

  // #157: Person không có personUuid match → isError.
  it("Person not found (personUuid) → isError, updateDoc KHÔNG gọi", async () => {
    const client = makeClient();
    client.findOne = vi.fn().mockResolvedValue(undefined); // Channel not found
    vi.mocked(getClient).mockResolvedValueOnce(client as never);
    const tool = tools.find((t) => t.name === "huly_update_user_profile")!;
    const result = await tool.execute("tc1", { firstName: "Jane" }, undefined, undefined, ctx);

    expect(result.isError).toBe(true);
    expect(client.updateDoc).not.toHaveBeenCalled();
  });

  // T-50 review fix: Person record tồn tại nhưng space missing (schema drift) → isError.
  it("Person record missing space field (schema drift) → isError, updateDoc KHÔNG gọi", async () => {
    const client = makeClient();
    mockPersonResolve(client, { _id: "person-1" /* space missing */ });
    vi.mocked(getClient).mockResolvedValueOnce(client as never);
    const tool = tools.find((t) => t.name === "huly_update_user_profile")!;
    const result = await tool.execute("tc1", { firstName: "Jane" }, undefined, undefined, ctx);

    expect(result.isError).toBe(true);
    const text = result.content[0]?.text ?? "";
    expect(text).toMatch(/schema drift/i);
    expect(client.updateDoc).not.toHaveBeenCalled();
  });
});
