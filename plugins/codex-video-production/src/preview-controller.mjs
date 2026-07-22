import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SessionStore } from "./session-store.mjs";
import { startPreviewHttpServer } from "./preview-http-server.mjs";
import { validatePipelineDeclaration } from "./pipeline-contract.mjs";

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../skills/video-production");
export const TVC_PIPELINE = { id: "tvc", version: 1, revision: 4, manifestRef: "pipelines/tvc/revisions/4/pipeline.yaml" };

export class PreviewController {
  constructor({ preferredPort = Number(process.env.VIDEO_PREVIEW_PORT) || 5630, skillRoot: configuredSkillRoot = skillRoot } = {}) {
    this.preferredPort = preferredPort;
    this.skillRoot = configuredSkillRoot;
    this.store = new SessionStore({ skillRoot: configuredSkillRoot });
    this.http = null;
  }

  async ensureServer() {
    if (!this.http) this.http = await startPreviewHttpServer(this.store, this.preferredPort);
    return this.http;
  }

  async start({ title, outputDir, productionId, pipeline = TVC_PIPELINE }) {
    const active = await this.store.active({ outputDir, productionId, pipeline });
    if (active) {
      const { baseUrl } = await this.ensureServer();
      const opened = this.store.snapshot(active);
      return {
        sessionId: active.sessionId,
        productionId: opened.state.identity.productionId,
        restored: true,
        url: `${baseUrl}/?session=${encodeURIComponent(active.sessionId)}`,
        ...opened
      };
    }
    const loadedPipeline = await validatePipelineDeclaration({ skillRoot: this.skillRoot, pipeline });
    const sessionId = randomUUID();
    const opened = await this.store.open({ sessionId, title, outputDir, productionId, pipeline, loadedPipeline });
    let baseUrl;
    try { ({ baseUrl } = await this.ensureServer()); }
    catch (error) { await this.store.closeSession(this.store.record(sessionId)); throw error; }
    return {
      sessionId,
      productionId: opened.state.identity.productionId,
      restored: Boolean(productionId),
      url: `${baseUrl}/?session=${encodeURIComponent(sessionId)}`,
      ...opened
    };
  }

  publish({ sessionId, ...signal }) { return this.store.publish(this.store.record(sessionId), signal); }

  async requestInteraction({ sessionId, interaction }) {
    const stored = await this.store.requestInteraction(this.store.record(sessionId), interaction);
    return { interactionId: stored.id, url: `${this.http.baseUrl}/?session=${encodeURIComponent(sessionId)}`, interaction: stored };
  }

  wait({ sessionId, interactionId, timeoutSeconds = 45 }) {
    return this.store.wait(this.store.record(sessionId), interactionId, Math.min(timeoutSeconds, 55) * 1000);
  }

  appendDecision({ sessionId, interactionId }) { return this.store.appendDecision(this.store.record(sessionId), interactionId); }
  appendTaskEvent({ sessionId, event }) { return this.store.appendTaskEvent(this.store.record(sessionId), event); }
  updateState({ sessionId, expectedStateRevision, actions }) { return this.store.updateState(this.store.record(sessionId), { expectedStateRevision, actions }); }
  get({ sessionId, scope }) { return this.store.get(this.store.record(sessionId), scope); }
  complete({ sessionId, expectedStateRevision }) { return this.store.complete(this.store.record(sessionId), expectedStateRevision); }

  async close() {
    await this.store.close();
    const active = this.http;
    this.http = null;
    if (active?.server.listening) await new Promise((resolve, reject) => {
      active.server.close((error) => error ? reject(error) : resolve());
      active.server.closeAllConnections();
    });
  }
}
