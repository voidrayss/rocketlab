// ===========================================================================
// js/onshape/client.js - the Onshape API SEAM (SCAFFOLDING, no live API).
//
// This is the single, well-documented place where a future authenticated
// Onshape REST call will plug in. Right now it makes NO network request: with
// no transport configured, every method throws a clear, documented
// "Onshape API not yet configured" error. That is deliberate. The live API is
// currently blocked because the user's new personal Onshape account cannot
// create API keys yet (a new-account anti-abuse delay).
//
// DESIGN: the transport (the thing that actually performs an HTTP request) is
// INJECTABLE via the constructor. That makes the eventual swap trivial: pass a
// transport and the same method bodies send real requests. Until then the
// default transport is null and the client refuses to pretend.
//
// SECURITY (read this before wiring a real transport):
//   Onshape authenticates with an API key PLUS a SECRET (HMAC request signing,
//   or an OAuth client secret). A secret MUST NEVER live in client-side
//   browser JavaScript: anyone can read it in the page source or network tab.
//   Therefore the real transport cannot be "fetch directly from the browser to
//   api.onshape.com with the secret in a header". A later phase needs a TINY
//   LOCAL SIGNING / PROXY SERVER (for example a small Node service running on
//   the user's own machine) that holds the secret, signs each request, and
//   forwards it to Onshape. The browser talks only to that local server. This
//   client's injectable transport is exactly the hook for that server: point
//   baseUrl at the local proxy and give it a transport that calls it.
//
// FURTHER KNOWN CONSTRAINTS to plan for (documented, not handled here):
//   - Onshape FREE accounts make every document PUBLIC. Anything created via
//     this pipeline on a free account is world-readable. Warn the user.
//   - New accounts cannot create API keys for a while (the current blocker).
//
// REST endpoints this seam will target later (Onshape REST API v6, base
// https://cad.onshape.com/api/v6 or the local proxy standing in for it):
//   - POST /documents                                  -> createDocument
//   - POST /partstudios/d/{did}/w/{wid}/features        -> createPartStudioFeature
//   - POST /featurestudios/d/{did}/w/{wid}/...          -> (FeatureScript upload)
// Auth is either API-key HMAC signing or OAuth bearer tokens, performed by the
// transport / local signing server, NOT in this file.
// ===========================================================================

export const ONSHAPE_API_BASE = "https://cad.onshape.com/api/v6";

// The error thrown by every method when no transport is configured. Exported
// so tests and callers can assert on it precisely.
export const NOT_CONFIGURED_MESSAGE =
  "Onshape API not yet configured: no transport injected. " +
  "A live connection is deferred until API keys work, and because API secrets " +
  "cannot live in client-side JS it must go through a local signing/proxy server. " +
  "Inject a transport via new OnshapeClient({ transport }) to enable requests.";

export class OnshapeNotConfiguredError extends Error {
  constructor(message = NOT_CONFIGURED_MESSAGE) {
    super(message);
    this.name = "OnshapeNotConfiguredError";
  }
}

export class OnshapeClient {
  // options:
  //   transport  async ({ method, path, body, headers }) -> response object.
  //              When null/omitted the client is in SCAFFOLDING mode and every
  //              method throws OnshapeNotConfiguredError WITHOUT any network
  //              activity. Later, inject a transport backed by the local
  //              signing/proxy server described in the file header.
  //   baseUrl    API base (default ONSHAPE_API_BASE). Point this at the local
  //              proxy once it exists.
  constructor({ transport = null, baseUrl = ONSHAPE_API_BASE } = {}) {
    this.transport = transport;
    this.baseUrl = baseUrl;
  }

  // True only when a transport has been injected. Callers can check this to
  // decide whether to offer a live "Export to Onshape" action yet.
  isConfigured() {
    return typeof this.transport === "function";
  }

  // Internal: perform a request through the injected transport, or refuse.
  // This is the ONLY method that would ever touch the network, and only via
  // the injected transport. With no transport it throws before any I/O, so the
  // client provably makes no network call in scaffolding mode.
  async request({ method, path, body = null, headers = {} }) {
    if (!this.isConfigured()) {
      throw new OnshapeNotConfiguredError();
    }
    // API SEAM: the injected transport performs the authenticated HTTP request
    // (signing handled by the local proxy / signing server, never here).
    return this.transport({
      method,
      url: `${this.baseUrl}${path}`,
      body,
      headers,
    });
  }

  // POST /documents - create a new Onshape document to hold the rocket.
  // Returns the created document descriptor (later: { id, defaultWorkspace }).
  async createDocument(name = "RocketLab Export") {
    return this.request({
      method: "POST",
      path: "/documents",
      body: { name, isPublic: true }, // free accounts force public; be explicit
    });
  }

  // POST /partstudios/d/{did}/w/{wid}/features - add one parametric feature
  // (one rocket component) to a Part Studio. partDef is a payload from
  // js/onshape/featurescript.js (its .parameters / .source).
  async createPartStudioFeature(documentId, workspaceId, partDef) {
    if (!partDef) {
      throw new Error("createPartStudioFeature requires a partDef payload");
    }
    return this.request({
      method: "POST",
      path: `/partstudios/d/${documentId}/w/${workspaceId}/features`,
      body: partDef,
    });
  }

  // Convenience: create a document then push every feature for a rocket. Built
  // from the featurescript payloads. Still makes no network call unless a
  // transport is injected (each step routes through request()).
  async exportRocket(featureScriptPayloads, { name = "RocketLab Export" } = {}) {
    const doc = await this.createDocument(name);
    const results = [];
    for (const payload of featureScriptPayloads) {
      results.push(
        await this.createPartStudioFeature(doc.id, doc.defaultWorkspace, payload)
      );
    }
    return { document: doc, features: results };
  }
}

// A default, deliberately-unconfigured client. Importing this never performs
// any network activity; calling a method on it throws the documented error.
export const onshapeClient = new OnshapeClient();
