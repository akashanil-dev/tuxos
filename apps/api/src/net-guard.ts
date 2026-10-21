// Every request the API makes to an AI provider goes through guardedFetch, so a provider's address (or a
// learner's custom one) can't turn the server into a proxy into its own network (SSRF):
//   - the address is checked when the connection is made, against the IPs it actually resolves to, so a
//     name can't pass a check and then point somewhere private (DNS rebinding);
//   - loopback, private, link-local (cloud metadata), CGNAT and other reserved ranges are refused;
//   - redirects are never followed, and responses are size-capped.
// systemd's IPAddressDeny (deploy/tuxos-api.service) enforces the same at the kernel, as a second layer.

import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import { request as httpRequest, type IncomingMessage } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { BlockList, isIP, type LookupFunction } from 'node:net';

export interface FetchPolicy {
  /** Allow private and loopback addresses and plain http (local development with a custom server only). */
  allowPrivate: boolean;
  /** The largest response accepted, in bytes. */
  maxBytes: number;
}

const blocked = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
  ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) blocked.addSubnet(network, prefix, 'ipv4');
for (const [network, prefix] of [
  ['::', 128], ['::1', 128], ['64:ff9b::', 96], ['64:ff9b:1::', 48], ['100::', 64], ['2001::', 23], ['2001:db8::', 32],
  ['2002::', 16], ['fc00::', 7], ['fe80::', 10], ['fec0::', 10], ['ff00::', 8],
] as const) blocked.addSubnet(network, prefix, 'ipv6');

const mappedV4 = new BlockList();
mappedV4.addSubnet('::ffff:0:0', 96, 'ipv6');

/** Whether an IP is on the public internet (not loopback, private, link-local, reserved...). */
export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !blocked.check(address, 'ipv4');
  if (family !== 6) return false;
  // IPv4 addresses written as IPv6 (::ffff:10.0.0.1, in any notation) are refused outright. They have a list
  // of their own: in the main one, Node would match that range against every IPv4 address too.
  if (mappedV4.check(address, 'ipv6')) return false;
  return !blocked.check(address, 'ipv6');
}

export class BlockedAddressError extends Error {
  constructor(host: string, reason = 'it is not a public internet address') {
    super(`refused to connect to ${host}: ${reason}`);
    this.name = 'BlockedAddressError';
  }
}

/** A fetch for AI providers under a policy. Only what the API uses: method, headers, a string body, signal. */
export function guardedFetch(policy: FetchPolicy): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.protocol !== 'https:' && !(policy.allowPrivate && url.protocol === 'http:')) {
      throw new BlockedAddressError(url.host, 'only https addresses are allowed');
    }
    const host = url.hostname.replace(/^\[|\]$/g, '');
    // A literal IP skips name resolution, so check it here.
    if (isIP(host) && !policy.allowPrivate && !isPublicAddress(host)) throw new BlockedAddressError(host);
    const signal = init?.signal ?? undefined;
    const headers = Object.fromEntries(new Headers(init?.headers).entries());
    const body = typeof init?.body === 'string' ? init.body : undefined;

    const lookup = ((hostname: string, options: { all?: boolean; family?: number | string }, callback: (...args: unknown[]) => void) => {
      const family = options.family === 'IPv4' ? 4 : options.family === 'IPv6' ? 6 : typeof options.family === 'number' ? options.family : 0;
      dnsLookup(hostname, { family, all: true }, (error, addresses: LookupAddress[]) => {
        if (error) return callback(error);
        if (!addresses.length || (!policy.allowPrivate && addresses.some((entry) => !isPublicAddress(entry.address)))) {
          return callback(new BlockedAddressError(hostname));
        }
        if (options.all) callback(null, addresses);
        else callback(null, addresses[0]!.address, addresses[0]!.family);
      });
    }) as unknown as LookupFunction;

    return new Promise<Response>((resolve, reject) => {
      const send = url.protocol === 'https:' ? httpsRequest : httpRequest;
      const request = send(url, { method: init?.method ?? 'GET', headers, lookup, signal }, (response: IncomingMessage) => {
        const chunks: Buffer[] = [];
        let size = 0;
        response.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > policy.maxBytes) {
            response.destroy();
            reject(new Error('the AI provider sent too large a response'));
            return;
          }
          chunks.push(chunk);
        });
        response.on('error', (error) => reject(signal?.aborted ? signal.reason : error));
        response.on('end', () => {
          const status = response.statusCode ?? 502;
          const responseHeaders = new Headers();
          for (const [name, value] of Object.entries(response.headers)) {
            if (typeof value === 'string') responseHeaders.set(name, value);
            else if (Array.isArray(value)) responseHeaders.set(name, value.join(', '));
          }
          // Redirects are not followed: a 3xx is returned as it is, which callers treat as a failure.
          const empty = status === 204 || status === 304 || status < 200;
          resolve(new Response(empty ? null : Buffer.concat(chunks), { status: empty && status < 200 ? 502 : status, headers: responseHeaders }));
        });
      });
      request.on('error', (error) => reject(signal?.aborted ? signal.reason : error));
      if (body !== undefined) request.write(body);
      request.end();
    });
  }) as typeof fetch;
}
