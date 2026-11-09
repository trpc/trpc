/**
 * Golden wire bytes, as hex.
 *
 * Everything under `backend`, `rows`, `scram`, and `md5` was captured from a
 * live PostgreSQL 16 server by `regenerate.ts` in this directory: the server
 * produced those bytes in reply to the frames this codec sent, and it
 * accepted every parameter, password, and SCRAM proof along the way. The
 * `frontend` entries are this codec's own output for representative
 * messages, checked against the message formats in the PostgreSQL protocol
 * documentation.
 *
 * A fresh capture reproduces every value except the four that are unique to a
 * session: the SCRAM salt and server nonce, and the backend process id in
 * `backendKeyData` and `notificationResponse`.
 */

export const bytes = (hex: string): Uint8Array => {
  const result = new Uint8Array(hex.length / 2)
  for (let i = 0; i < result.length; i++) {
    result[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return result
}

export const frontend = {
  sslRequest: "0000000804d2162f",
  cancelRequest: "0000001004d2162e0000003f09e5e380",
  startupMessage:
    "0000005b00030000757365720065666665637400646174616261736500656666656374006170706c69636174696f6e5f6e616d65006566666563742d70672d636f64656300636c69656e745f656e636f64696e6700555446380000",
  parse: "500000001773310053454c45435420243100000100000017",
  bind: "42000000207031007331000001000100020000000400000001ffffffff00010001",
  execute: "450000000b70310000000005",
  describeStatement: "440000000853733100",
  closePortal: "430000000850703100",
  sync: "5300000004",
  flush: "4800000004",
  terminate: "5800000004",
  passwordMessage: "700000000b6d643561626300",
  saslInitialResponse: "7000000019534352414d2d5348412d32353600000000036e2c2c",
  saslInitialResponseEmpty: "7000000016534352414d2d5348412d32353600ffffffff",
  saslResponse: "7000000007010203"
} as const

export const backend = {
  authenticationOk: "520000000800000000",
  authenticationCleartextPassword: "520000000800000003",
  authenticationMD5Password: "520000000c0000000570e7d45e",
  authenticationSASL: "52000000170000000a534352414d2d5348412d3235360000",
  authenticationSASLContinue:
    "52000000590000000b723d6566666563746e6f6e636530313233343536373839346144344f4d2b625a387865755769306f433133614357742c733d4442526d4e34586939694d4f6f31745a6673692b48673d3d2c693d34303936",
  authenticationSASLFinal:
    "52000000360000000c763d34674158727358386e69784873545861573056724b31784c763173315a644f52744e757a6e4f79455a72493d",
  parameterStatus: "5300000017696e5f686f745f7374616e646279006f666600",
  backendKeyData: "4b0000000c0000003f09e5e380",
  readyForQuery: "5a0000000549",
  rowDescription: "540000002e00026100000000000000000000170004ffffffff0001620000000000000000000019ffffffffffff0001",
  dataRowTwoColumns: "4400000013000200000004000000010000000178",
  dataRowWithNull: "44000000160002000000080000000000000007ffffffff",
  parameterDescription: "740000000a000100000014",
  commandComplete: "430000000d53454c454354203100",
  parseComplete: "3100000004",
  bindComplete: "3200000004",
  closeComplete: "3300000004",
  portalSuspended: "7300000004",
  emptyQueryResponse: "4900000004",
  noData: "6e00000004",
  errorResponse:
    "4500000041534552524f5200564552524f5200433232303132004d6469766973696f6e206279207a65726f0046696e742e63004c3837300052696e74346469760000",
  noticeResponse:
    "4e0000007f534e4f5449434500564e4f5449434500433030303030004d7461626c6520226566666563745f6d697373696e675f7461626c652220646f6573206e6f742065786973742c20736b697070696e6700467461626c65636d64732e63004c31333236005244726f704572726f724d73674e6f6e4578697374656e740000",
  notificationResponse: "41000000240000003f6566666563745f6368616e6e656c007061796c6f6164207465787400"
} as const

/**
 * One `DataRow` message per value, each the reply to `SELECT $1::<type>` with
 * binary parameters and binary results.
 */
export const rows = {
  bool: "440000000b00010000000101",
  int2: "440000000c000100000002cfc7",
  int4: "440000000e0001000000047fffffff",
  int8Max: "44000000120001000000087fffffffffffffff",
  int8Min: "44000000120001000000088000000000000000",
  oid: "440000000e000100000004ffffffff",
  regclass: "440000000e000100000004ffffffff",
  float4: "440000000e0001000000043fc00000",
  float8: "4400000012000100000008c008800000000000",
  numeric: "440000001800010000000e0003000100000004000109291a85",
  numericSmall: "440000001400010000000a0001ffff000000040001",
  numericNegative: "440000001c000100000012000500044000000026941538044a1de60c8a",
  numericNaN: "440000001200010000000800000000c0000000",
  text: "440000001400010000000a68c3a96c6c6f20e29883",
  varchar: "440000000d000100000003616263",
  bpchar: "440000000c0001000000027879",
  name: "4400000013000100000009736f6d655f6e616d65",
  bytea: "440000000e0001000000040001feff",
  json: "440000001e0001000000147b2261223a5b312c325d2c2262223a6e756c6c7d",
  jsonb: "4400000023000100000019017b2261223a205b312c20325d2c202262223a206e756c6c7d",
  uuid: "440000001a0001000000106ba7b8109dad11d180b400c04fd430c8",
  inet4: "440000001200010000000802200004c0a80001",
  inet4Masked: "440000001200010000000802180004c0a80001",
  inet6: "440000001e0001000000140380001020010db8000000000000000000000001",
  cidr: "4400000012000100000008020801040a000000",
  date: "440000000e00010000000400002279",
  dateInfinity: "440000000e0001000000047fffffff",
  dateNegInfinity: "440000000e00010000000480000000",
  time: "44000000120001000000080000000a8bda1c00",
  timetz: "440000001600010000000c0000000a8bda1c00ffffe3e0",
  timestamp: "44000000120001000000080002bcc0f6ffcbb8",
  timestampInfinity: "44000000120001000000087fffffffffffffff",
  timestamptz: "44000000120001000000080002bcc0f6ffcbb8",
  timestamptzNegInfinity: "44000000120001000000088000000000000000",
  int4ArrayWithNulls:
    "440000003200010000002800000001000000010000001700000003000000010000000400000001ffffffff00000004fffffffd",
  textArrayEmpty: "440000001600010000000c000000000000000000000019",
  timestamptzArray:
    "440000003a0001000000300000000100000001000004a0000000030000000100000008fffca2fec4c82000ffffffff000000080002bcc0f6fdeb40"
} as const

/**
 * A complete SCRAM-SHA-256 exchange with PostgreSQL 16, for user `effect`
 * with password `secret`. The server accepted `clientFinalMessage` and
 * replied with `serverFinalMessage`.
 */
export const scram = {
  password: "secret",
  clientNonce: "effectnonce0123456789",
  clientFirstMessage: "n,,n=,r=effectnonce0123456789",
  serverFirstMessage: "r=effectnonce01234567894aD4OM+bZ8xeuWi0oC13aCWt,s=DBRmN4Xi9iMOo1tZfsi+Hg==,i=4096",
  clientFinalMessage:
    "c=biws,r=effectnonce01234567894aD4OM+bZ8xeuWi0oC13aCWt,p=MzbwxN5OtYdVrj5y4YLvTcjQEOgJaNmODnCVqny303A=",
  serverFinalMessage: "v=4gAXrsX8nixHsTXaW0VrK1xLv1s1ZdORtNuznOyEZrI="
} as const

/** An `AuthenticationMD5Password` challenge and the reply the server accepted. */
export const md5 = {
  user: "effect",
  password: "secret",
  salt: "70e7d45e",
  expected: "md5dc8f3c0ed2dd6e3843d5b7623544d96b"
} as const
