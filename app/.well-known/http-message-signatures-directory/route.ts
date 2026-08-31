/**
 * /.well-known/http-message-signatures-directory — Web Bot Auth key
 * directory (draft-meunier-http-message-signatures-directory).
 *
 * The one key below is real: the operator holds the matching Ed25519
 * private key offline. Nothing this site sends is signed with it today —
 * the directory exists so that if outbound signed requests ever start,
 * the verification key is already published at the address verifiers
 * check first. A receiving site that sees a `Signature-Agent` pointing
 * here can verify the signature against this key; absence of signed
 * traffic means simply that none has been sent yet.
 *
 * A route (not a static file) because the media type is the draft's own
 * suffix type, which static hosting would serve as octet-stream.
 */
const DIRECTORY = {
  keys: [
    {
      kty: 'OKP',
      crv: 'Ed25519',
      x: 'lk4TVUxU0xjH7ZThE5o1MUFfSk3cC-Lu978-RbxuUE0',
      kid: 'SPUc4zGM6hIGiZe0lS3qOeqB66IXNxRWkkeu3472bbE',
      use: 'sig',
      alg: 'EdDSA',
    },
  ],
};

export function GET(): Response {
  return new Response(JSON.stringify(DIRECTORY, null, 2) + '\n', {
    status: 200,
    headers: {
      'Content-Type': 'application/http-message-signatures-directory+json',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
    },
  });
}
