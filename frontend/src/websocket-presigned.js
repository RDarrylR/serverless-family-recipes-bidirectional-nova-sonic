/**
 * SigV4 presigning for AgentCore WebSocket connections.
 * Adapted from the official AWS sample (TypeScript) to plain JS.
 */

import { getAWSCredentials } from './aws-credentials.js';
import { Sha256 } from '@aws-crypto/sha256-js';
import { SignatureV4 } from '@aws-sdk/signature-v4';
import { HttpRequest } from '@smithy/protocol-http';

/**
 * Generate a presigned WebSocket URL for AgentCore.
 *
 * @param {string} agentRuntimeArn - The AgentCore runtime ARN
 * @param {string} sessionId - Session ID for tracking (must be >= 33 chars)
 * @returns {Promise<string>} Presigned wss:// URL
 */
export async function getPresignedWebSocketUrl(agentRuntimeArn, sessionId) {
  const region = import.meta.env.VITE_REGION || 'us-east-1';

  const credentials = await getAWSCredentials();

  // Build the base URL with properly encoded ARN
  const encodedArn = encodeURIComponent(agentRuntimeArn);
  const baseUrl = `https://bedrock-agentcore.${region}.amazonaws.com/runtimes/${encodedArn}/ws`;
  const url = new URL(baseUrl);
  url.searchParams.set('qualifier', 'DEFAULT');
  url.searchParams.set(
    'X-Amzn-Bedrock-AgentCore-Runtime-Session-Id',
    sessionId
  );

  // Create HTTP request for signing
  const request = new HttpRequest({
    method: 'GET',
    protocol: 'https:',
    hostname: url.hostname,
    path: url.pathname,
    query: Object.fromEntries(url.searchParams),
    headers: { host: url.hostname },
  });

  // Sign with SigV4
  const signer = new SignatureV4({
    service: 'bedrock-agentcore',
    region,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
    },
    sha256: Sha256,
  });

  const signed = await signer.presign(request, { expiresIn: 3600 });

  // Convert signed request to wss:// URL
  const queryString = Object.entries(signed.query || {})
    .map(
      ([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`
    )
    .join('&');

  return `wss://${signed.hostname}${signed.path || '/'}${queryString ? '?' + queryString : ''}`;
}
