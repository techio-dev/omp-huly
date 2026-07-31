// HulyClient — thin wrapper @hcengineering/api-client (ws + rest).
// Design: 04-system.md §6 (reconciled T-05 với api-client@0.7.423 real API).
//
// Transport toggle (D3):
//   ws   = connect() persistent + full CRUD via PlatformClient
//   rest = connectRest() + createRestTxOperations() (RestClient read-only + TxOperations cho write)
//
// getCurrentUser() wrap client.getAccount() (D15 FR-18 default assignee).
// Error mapping: delegate sang T-04 HulyError qua mapError.

// CJS interop: @hcengineering/* ship CommonJS (dynamic __reExport loop) → named
// ESM imports crash at runtime ("Named export 'connect' not found"). Default
// import = module.exports, destructure for values. Types stay type-only.
import apiClient from "@hcengineering/api-client";
import type {
  Account,
  ConnectOptions,
  AttachedData,
  AttachedDoc,
  Class,
  Doc,
  DocumentQuery,
  DocumentUpdate,
  FindOptions,
  FindResult,
  Mixin,
  MixinData,
  PlatformClient,
  Ref,
  RestClient,
  Space,
  StorageClient,
  TxOperations,
  TxResult,
  WithLookup,
  WithMarkup,
} from "@hcengineering/api-client";
// T-103 #156: makeCollabId + jsonToMarkup exist runtime nhưng KHÔNG trong .d.ts.
// 0.2.4 fix: makeCollabId replicated local (src/client/huly-ids.ts) — triệt tiêu
// CJS interop (static import mất func dưới vitest; createRequire break omp loader)
// + bỏ `as` cast unchecked. jsonToMarkup (text-core) phức tạp → giữ default import
// + cast (pre-existing beta.18, work ở cả vitest + dist).
import { makeCollabId } from "./huly-ids.js";
import textCore from "@hcengineering/text-core";
import textMarkdown from "@hcengineering/text-markdown";
const { connect, connectRest, connectStorage, createRestTxOperations, getWorkspaceToken } =
  apiClient;
const { markdownToMarkup } = textMarkdown;
const jsonToMarkup = (textCore as unknown as { jsonToMarkup: (j: unknown) => string }).jsonToMarkup;
import { mapError } from "./errors.js";
import { DEFAULT_UPSTREAM_NOISE_PATTERNS, runWithConsoleFilter } from "./console-filter.js";
import { loadConfig } from "../config/config.js";

/** Transport global toggle (D3). Default 'ws'. */
export type Transport = "ws" | "rest";

/** Huly credentials: url tách + auth union (D8) + workspace BẮT BUỘC. */
export type HulyCredentials = {
  url: string;
} & ConnectOptions;

/** Current user shape (mapped từ Account, D15 FR-18). */
export interface CurrentUser {
  id: string;
  name: string;
  email: string;
}

/**
 * HulyClient — unified interface cho cả ws + rest transport.
 * Methods ủy quyền PlatformClient (ws) hoặc RestClient + TxOperations (rest).
 */
export interface HulyClient {
  readonly transport: Transport;

  // FindOperations
  findOne<T extends Doc>(
    _class: Ref<Class<T>>,
    query: DocumentQuery<T>,
    options?: FindOptions<T>,
  ): Promise<WithLookup<T> | undefined>;
  findAll<T extends Doc>(
    _class: Ref<Class<T>>,
    query: DocumentQuery<T>,
    options?: FindOptions<T>,
  ): Promise<FindResult<T>>;

  // DocOperations (write)
  createDoc<T extends Doc>(
    _class: Ref<Class<T>>,
    space: Ref<Space>,
    attributes: WithMarkup<Record<string, unknown>>,
    id?: Ref<T>,
  ): Promise<Ref<T>>;
  updateDoc<T extends Doc>(
    _class: Ref<Class<T>>,
    space: Ref<Space>,
    objectId: Ref<T>,
    operations: WithMarkup<DocumentUpdate<T>>,
    retrieve?: boolean,
  ): Promise<TxResult>;
  removeDoc<T extends Doc>(
    _class: Ref<Class<T>>,
    space: Ref<Space>,
    objectId: Ref<T>,
  ): Promise<TxResult>;

  // CollectionOperations (cho comments/labels/relations)
  addCollection<T extends Doc, P extends AttachedDoc>(
    _class: Ref<Class<P>>,
    space: Ref<Space>,
    attachedTo: Ref<T>,
    attachedToClass: Ref<Class<T>>,
    collection: string,
    attributes: WithMarkup<AttachedData<P>>,
    id?: Ref<P>,
  ): Promise<Ref<P>>;

  // MixinOperations
  createMixin<D extends Doc, M extends D>(
    objectId: Ref<D>,
    objectClass: Ref<Class<D>>,
    objectSpace: Ref<Space>,
    mixin: Ref<Mixin<M>>,
    attributes: WithMarkup<MixinData<D, M>>,
  ): Promise<TxResult>;

  // MarkupOperations (T-41 — fetch markup content từ MarkupBlobRef; T-66 — upload/update)
  // Issue.description / Document.content là MarkupBlobRef (document ref), KHÔNG inline string.
  // fetchMarkup resolve ref → markdown/html/markup string theo format.
  // uploadMarkup/upload-save markup → trả MarkupBlobRef (create + edit document).
  // Ref branded types bypass (string runtime, Ref compile-time).
  fetchMarkup(
    objectClass: string,
    objectId: string,
    objectAttr: string,
    markup: unknown,
    format: "markdown" | "html" | "markup",
  ): Promise<string>;
  uploadMarkup(
    objectClass: string,
    objectId: string,
    objectAttr: string,
    markup: string,
    format: "markdown" | "html" | "markup",
  ): Promise<unknown>;
  // T-103 #156: updateMarkup = updateContent rpc (edit existing doc content).
  // uploadMarkup/createMarkup (createContent rpc) chỉ tạo INITIAL version — KHÔNG
  // update document đã tồn tại (content unchanged, 0 snapshot). updateMarkup update
  // content in-place qua collaborator. Optional (chỉ WS transport có).
  updateMarkup?(
    objectClass: string,
    objectId: string,
    objectAttr: string,
    markup: string,
    format: "markdown" | "html" | "markup",
  ): Promise<void>;
  // T-77: Fulltext search API (relevance-ranked, fulltext index).
  // Signature: searchFulltext({query, classes?, spaces?}, {limit?}) → {docs, total?}.
  // WS PlatformClient có thể KHÔNG expose — handler fallback $like nếu throw.
  searchFulltext?(query: unknown, options?: unknown): Promise<unknown>;

  // T-75: Blob storage ops (Attachment file upload/download).
  // uploadBlob → {blobId, size}. getBlob → Buffer. Lazy connectStorage.
  uploadBlob?(
    filename: string,
    buffer: Buffer,
    contentType: string,
  ): Promise<{ blobId: string; size: number }>;
  getBlob?(blobId: string): Promise<Buffer>;

  // Account
  getAccount(): Promise<Account>;
  getCurrentUser(): Promise<CurrentUser>;

  // Lifecycle
  close(): Promise<void>;
}

/**
 * T-62 #67: Resolve console filter pattern từ config.
 *
 * - `quietUpstreamNoise === false` → return null (KHÔNG filter — debug thật)
 * - `upstreamNoisePatterns` override → compile user pattern (case-insensitive)
 * - Default → `DEFAULT_UPSTREAM_NOISE_PATTERNS` (T-62: #67 + T-64: WS spam)
 *
 * Filter scope hẹp (chỉ quanh connect()) → KHÔNG global-silent vĩnh viễn.
 * KHÔNG throw nếu config invalid (default patterns) — connect vẫn chạy.
 */
async function resolveFilterPatterns(): Promise<RegExp[] | null> {
  let config;
  try {
    config = await loadConfig();
  } catch {
    // Config error KHÔNG block connect — filter dùng default patterns.
    return DEFAULT_UPSTREAM_NOISE_PATTERNS;
  }
  if (config.quietUpstreamNoise === false) return null;
  if (config.upstreamNoisePatterns !== undefined && config.upstreamNoisePatterns.length > 0) {
    // Compile user pattern — skip invalid (KHÔNG crash connect)
    const compiled: RegExp[] = [];
    for (const src of config.upstreamNoisePatterns) {
      try {
        compiled.push(new RegExp(src, "i"));
      } catch {
        // Skip — validateConfig đã catch khi load, runtime skip cho safety.
      }
    }
    return compiled.length > 0 ? compiled : DEFAULT_UPSTREAM_NOISE_PATTERNS;
  }
  return DEFAULT_UPSTREAM_NOISE_PATTERNS;
}

/**
 * Create HulyClient theo transport (D3):
 *   ws   → connect() + delegate PlatformClient
 *   rest → connectRest() + createRestTxOperations() + delegate RestClient (read) + TxOperations (write)
 *
 * T-62 #67: wrap `connect()` qua `runWithConsoleFilter()` — gate upstream
 * `console.warn/error/log` spam (cache-miss replay + WS error). Filter scope
 * hẹp (try/finally restore). Escape hatch: config `quietUpstreamNoise: false`.
 *
 * Throws HulyError nếu connect/connectRest/createRestTxOperations fail (mapError từ T-04).
 */
export async function createHulyClient(
  creds: HulyCredentials,
  transport: Transport = "ws",
): Promise<HulyClient> {
  const patterns = await resolveFilterPatterns();
  try {
    const { url, ...auth } = creds;
    if (transport === "ws") {
      const connectFn = () => connect(url, auth);
      // T-62: wrap connect() — upstream replay tải model diff + warn cache-miss
      // hàng loạt. Filter chỉ active trong scope connect (try/finally restore).
      const client =
        patterns !== null ? await runWithConsoleFilter(patterns, connectFn) : await connectFn();
      return makeWsClient(client, () => connectStorage(url, auth));
    }
    // rest
    const rest = await connectRest(url, auth);
    const { endpoint, workspaceId, token } = await getWorkspaceToken(url, auth);
    const tx = await createRestTxOperations(endpoint, workspaceId, token);
    return makeRestClient(rest, tx, () => connectStorage(url, auth));
  } catch (e) {
    throw mapError(e);
  }
}

/** Wrap PlatformClient (ws) thành HulyClient. */
function makeWsClient(
  client: PlatformClient,
  getStorage: () => Promise<StorageClient>,
): HulyClient {
  let cachedUser: CurrentUser | undefined;
  let cachedStorage: StorageClient | undefined;
  return {
    transport: "ws",
    findOne: (...args) => client.findOne(...args),
    findAll: (...args) => client.findAll(...args),
    createDoc: (...args) => client.createDoc(...args),
    updateDoc: (...args) => client.updateDoc(...args),
    removeDoc: (...args) => client.removeDoc(...args),
    addCollection: (...args) => client.addCollection(...args),
    createMixin: (...args) => client.createMixin(...args),
    // T-41: PlatformClient có fetchMarkup/uploadMarkup built-in (MarkupOperations).
    // Library KHÔNG có updateMarkup — edit = uploadMarkup + updateDoc.
    fetchMarkup: (...args) => client.fetchMarkup(...args),
    uploadMarkup: (...args) => client.uploadMarkup(...args),
    // T-103 #156: updateMarkup qua collaborator.updateMarkup (updateContent rpc).
    // client.markup = MarkupOperationsImpl (public field) — hold collaborator +
    // refUrl/imageUrl (private TS, runtime-accessible). Convert markdown→markup
    // mirror MarkupOperationsImpl.uploadMarkup, rồi updateMarkup thay createMarkup.
    updateMarkup: async (objectClass, objectId, objectAttr, value, format) => {
      const mo = (
        client as unknown as {
          markup: {
            collaborator: {
              updateMarkup: (doc: unknown, markup: string) => Promise<void>;
            };
            refUrl?: string;
            imageUrl?: string;
          };
        }
      ).markup;
      let markup = "";
      if (format === "markdown") {
        markup = jsonToMarkup(
          markdownToMarkup(value, { refUrl: mo.refUrl, imageUrl: mo.imageUrl }),
        );
      } else {
        markup = value;
      }
      const collabId = makeCollabId(objectClass, objectId, objectAttr);
      await mo.collaborator.updateMarkup(collabId, markup);
    },
    // T-77: searchFulltext — optional trên PlatformClient. Guard runtime +
    // helpful error nếu undefined (handler fulltext_search fallback $like).
    searchFulltext: (...args) => {
      const fn = client.searchFulltext;
      if (typeof fn !== "function") {
        throw new Error("searchFulltext not available on WS transport — fallback to $like.");
      }
      return fn(...args);
    },
    // T-75: blob storage ops (lazy connectStorage).
    uploadBlob: async (filename, buffer, contentType) => {
      if (!cachedStorage) cachedStorage = await getStorage();
      const objectName = `attachment/${Math.random().toString(36).slice(2, 14)}/${filename}`;
      const blob = await cachedStorage.put(objectName, buffer, contentType, buffer.length);
      return { blobId: blob._id, size: blob.size };
    },
    getBlob: async (blobId) => {
      if (!cachedStorage) cachedStorage = await getStorage();
      const stream = await cachedStorage.get(blobId);
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
      }
      return Buffer.concat(chunks);
    },
    getAccount: () => client.getAccount(),
    async getCurrentUser(): Promise<CurrentUser> {
      if (cachedUser) return cachedUser;
      const account = await client.getAccount();
      cachedUser = accountToUser(account);
      return cachedUser;
    },
    close: () => client.close(),
  };
}

/** Wrap RestClient + TxOperations (rest) thành HulyClient. */
function makeRestClient(
  rest: RestClient,
  tx: TxOperations,
  getStorage: () => Promise<StorageClient>,
): HulyClient {
  let cachedUser: CurrentUser | undefined;
  let cachedStorage: StorageClient | undefined;
  return {
    transport: "rest",
    // Read ops → RestClient
    findOne: (...args) => rest.findOne(...args),
    findAll: (...args) => rest.findAll(...args),
    // Write ops → TxOperations (RestClient read-only)
    createDoc: (...args) => tx.createDoc(...args),
    updateDoc: (...args) => tx.updateDoc(...args),
    removeDoc: (...args) => tx.removeDoc(...args),
    addCollection: (...args) => tx.addCollection(...args),
    createMixin: (...args) => tx.createMixin(...args),
    // T-41: RestClient KHÔNG có fetchMarkup built-in (chỉ PlatformClient ws có).
    // REST transport fallback: throw rõ ràng — user đổi sang ws transport nếu cần
    // resolve MarkupBlobRef (vd get_issue description). Default transport = ws
    // (config.ts D3) nên path này hiếm khi hit. T-66: upload/updateMarkup cùng.
    fetchMarkup: () => {
      throw new Error(
        "fetchMarkup not supported on REST transport. Use WS transport (default) " +
          "to resolve MarkupBlobRef fields like issue description.",
      );
    },
    uploadMarkup: () => {
      throw new Error(
        "uploadMarkup not supported on REST transport. Use WS transport (default) " +
          "to save document content (MarkupBlobRef).",
      );
    },
    // T-103 #156: updateMarkup cũng WS-only (collaborator) — throwing stub mirror.
    updateMarkup: () => {
      throw new Error(
        "updateMarkup not supported on REST transport. Use WS transport (default) " +
          "to edit document content.",
      );
    },
    // T-77: REST has searchFulltext (RestClient.searchFulltext exists).
    searchFulltext: (...args) => rest.searchFulltext(...args),
    // T-75: blob storage ops (lazy connectStorage).
    uploadBlob: async (filename, buffer, contentType) => {
      if (!cachedStorage) cachedStorage = await getStorage();
      const objectName = `attachment/${Math.random().toString(36).slice(2, 14)}/${filename}`;
      const blob = await cachedStorage.put(objectName, buffer, contentType, buffer.length);
      return { blobId: blob._id, size: blob.size };
    },
    getBlob: async (blobId) => {
      if (!cachedStorage) cachedStorage = await getStorage();
      const stream = await cachedStorage.get(blobId);
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
      }
      return Buffer.concat(chunks);
    },
    getAccount: () => rest.getAccount(),
    async getCurrentUser(): Promise<CurrentUser> {
      if (cachedUser) return cachedUser;
      const account = await rest.getAccount();
      cachedUser = accountToUser(account);
      return cachedUser;
    },
    // REST stateless — close no-op
    close: async () => {},
  };
}

/** Map Account → CurrentUser (D15 FR-18 assignee default). */
function accountToUser(account: Account): CurrentUser {
  // T-103 #157: primarySocialId có thể là numeric id (Google/huly login), KHÔNG
  // email. Extract email THẬT từ fullSocialIds[type=email].value (fallback
  // primarySocialId nếu không có — vd workspace chỉ có 1 social id).
  const emailSocial = (
    account as { fullSocialIds?: Array<{ type: string; value: string }> }
  ).fullSocialIds?.find((s) => s.type === "email");
  const email = emailSocial?.value ?? account.primarySocialId;
  return {
    id: account.uuid,
    name: account.primarySocialId,
    email,
  };
}
