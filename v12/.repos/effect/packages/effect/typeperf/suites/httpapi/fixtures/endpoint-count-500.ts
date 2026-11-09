// Measures endpoint declaration for 500 same-shaped endpoints in one group.
import { Schema } from "effect"
import { HttpApi, HttpApiEndpoint, HttpApiGroup } from "effect/http-api"

Schema.String
HttpApi.make("Api")
HttpApiGroup.make("users")
HttpApiEndpoint.get("warmup", "/warmup")

const Params = Schema.Struct({
  id: Schema.FiniteFromString
})

const User = Schema.Struct({
  id: Schema.String,
  name: Schema.String
})

const api = HttpApi.make("Api").add(
  HttpApiGroup.make("users").add(
    HttpApiEndpoint.get("getUser0001", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0002", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0003", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0004", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0005", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0006", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0007", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0008", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0009", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0010", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0011", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0012", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0013", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0014", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0015", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0016", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0017", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0018", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0019", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0020", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0021", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0022", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0023", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0024", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0025", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0026", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0027", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0028", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0029", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0030", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0031", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0032", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0033", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0034", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0035", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0036", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0037", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0038", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0039", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0040", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0041", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0042", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0043", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0044", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0045", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0046", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0047", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0048", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0049", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0050", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0051", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0052", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0053", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0054", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0055", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0056", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0057", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0058", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0059", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0060", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0061", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0062", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0063", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0064", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0065", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0066", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0067", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0068", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0069", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0070", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0071", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0072", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0073", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0074", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0075", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0076", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0077", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0078", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0079", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0080", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0081", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0082", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0083", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0084", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0085", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0086", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0087", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0088", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0089", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0090", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0091", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0092", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0093", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0094", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0095", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0096", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0097", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0098", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0099", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0100", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0101", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0102", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0103", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0104", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0105", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0106", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0107", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0108", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0109", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0110", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0111", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0112", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0113", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0114", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0115", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0116", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0117", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0118", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0119", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0120", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0121", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0122", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0123", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0124", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0125", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0126", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0127", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0128", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0129", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0130", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0131", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0132", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0133", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0134", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0135", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0136", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0137", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0138", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0139", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0140", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0141", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0142", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0143", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0144", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0145", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0146", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0147", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0148", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0149", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0150", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0151", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0152", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0153", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0154", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0155", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0156", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0157", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0158", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0159", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0160", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0161", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0162", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0163", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0164", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0165", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0166", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0167", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0168", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0169", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0170", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0171", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0172", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0173", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0174", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0175", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0176", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0177", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0178", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0179", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0180", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0181", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0182", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0183", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0184", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0185", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0186", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0187", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0188", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0189", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0190", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0191", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0192", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0193", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0194", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0195", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0196", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0197", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0198", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0199", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0200", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0201", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0202", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0203", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0204", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0205", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0206", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0207", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0208", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0209", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0210", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0211", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0212", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0213", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0214", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0215", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0216", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0217", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0218", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0219", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0220", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0221", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0222", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0223", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0224", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0225", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0226", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0227", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0228", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0229", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0230", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0231", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0232", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0233", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0234", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0235", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0236", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0237", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0238", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0239", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0240", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0241", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0242", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0243", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0244", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0245", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0246", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0247", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0248", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0249", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0250", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0251", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0252", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0253", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0254", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0255", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0256", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0257", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0258", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0259", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0260", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0261", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0262", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0263", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0264", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0265", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0266", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0267", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0268", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0269", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0270", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0271", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0272", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0273", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0274", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0275", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0276", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0277", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0278", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0279", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0280", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0281", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0282", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0283", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0284", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0285", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0286", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0287", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0288", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0289", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0290", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0291", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0292", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0293", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0294", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0295", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0296", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0297", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0298", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0299", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0300", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0301", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0302", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0303", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0304", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0305", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0306", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0307", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0308", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0309", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0310", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0311", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0312", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0313", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0314", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0315", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0316", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0317", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0318", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0319", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0320", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0321", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0322", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0323", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0324", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0325", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0326", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0327", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0328", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0329", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0330", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0331", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0332", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0333", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0334", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0335", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0336", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0337", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0338", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0339", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0340", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0341", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0342", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0343", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0344", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0345", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0346", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0347", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0348", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0349", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0350", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0351", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0352", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0353", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0354", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0355", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0356", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0357", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0358", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0359", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0360", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0361", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0362", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0363", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0364", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0365", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0366", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0367", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0368", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0369", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0370", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0371", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0372", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0373", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0374", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0375", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0376", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0377", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0378", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0379", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0380", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0381", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0382", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0383", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0384", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0385", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0386", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0387", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0388", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0389", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0390", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0391", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0392", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0393", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0394", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0395", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0396", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0397", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0398", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0399", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0400", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0401", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0402", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0403", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0404", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0405", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0406", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0407", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0408", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0409", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0410", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0411", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0412", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0413", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0414", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0415", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0416", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0417", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0418", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0419", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0420", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0421", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0422", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0423", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0424", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0425", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0426", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0427", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0428", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0429", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0430", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0431", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0432", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0433", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0434", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0435", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0436", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0437", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0438", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0439", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0440", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0441", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0442", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0443", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0444", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0445", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0446", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0447", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0448", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0449", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0450", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0451", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0452", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0453", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0454", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0455", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0456", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0457", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0458", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0459", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0460", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0461", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0462", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0463", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0464", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0465", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0466", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0467", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0468", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0469", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0470", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0471", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0472", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0473", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0474", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0475", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0476", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0477", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0478", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0479", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0480", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0481", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0482", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0483", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0484", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0485", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0486", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0487", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0488", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0489", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0490", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0491", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0492", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0493", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0494", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0495", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0496", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0497", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0498", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0499", "/users/:id", {
      params: Params,
      success: User
    }),
    HttpApiEndpoint.get("getUser0500", "/users/:id", {
      params: Params,
      success: User
    })
  )
)

type Groups = typeof api extends HttpApi.HttpApi<string, infer Groups> ? Groups : never
type Endpoints = HttpApiGroup.Endpoints<Groups>

export type Api = typeof api
export type EndpointIdentifiers = HttpApiEndpoint.Identifier<Endpoints>
export type EndpointRequests = HttpApiEndpoint.Request<Endpoints>
export type ServerServices = HttpApiEndpoint.ServerServices<Endpoints>
export type ClientServices = HttpApiEndpoint.ClientServices<Endpoints>
