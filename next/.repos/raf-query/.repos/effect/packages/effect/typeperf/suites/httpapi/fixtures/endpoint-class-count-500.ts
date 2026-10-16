// Measures class-like endpoint declaration for 500 same-shaped endpoints.
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

class GetUser0001 extends HttpApiEndpoint.get("getUser0001", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0002 extends HttpApiEndpoint.get("getUser0002", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0003 extends HttpApiEndpoint.get("getUser0003", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0004 extends HttpApiEndpoint.get("getUser0004", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0005 extends HttpApiEndpoint.get("getUser0005", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0006 extends HttpApiEndpoint.get("getUser0006", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0007 extends HttpApiEndpoint.get("getUser0007", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0008 extends HttpApiEndpoint.get("getUser0008", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0009 extends HttpApiEndpoint.get("getUser0009", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0010 extends HttpApiEndpoint.get("getUser0010", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0011 extends HttpApiEndpoint.get("getUser0011", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0012 extends HttpApiEndpoint.get("getUser0012", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0013 extends HttpApiEndpoint.get("getUser0013", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0014 extends HttpApiEndpoint.get("getUser0014", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0015 extends HttpApiEndpoint.get("getUser0015", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0016 extends HttpApiEndpoint.get("getUser0016", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0017 extends HttpApiEndpoint.get("getUser0017", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0018 extends HttpApiEndpoint.get("getUser0018", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0019 extends HttpApiEndpoint.get("getUser0019", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0020 extends HttpApiEndpoint.get("getUser0020", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0021 extends HttpApiEndpoint.get("getUser0021", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0022 extends HttpApiEndpoint.get("getUser0022", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0023 extends HttpApiEndpoint.get("getUser0023", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0024 extends HttpApiEndpoint.get("getUser0024", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0025 extends HttpApiEndpoint.get("getUser0025", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0026 extends HttpApiEndpoint.get("getUser0026", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0027 extends HttpApiEndpoint.get("getUser0027", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0028 extends HttpApiEndpoint.get("getUser0028", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0029 extends HttpApiEndpoint.get("getUser0029", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0030 extends HttpApiEndpoint.get("getUser0030", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0031 extends HttpApiEndpoint.get("getUser0031", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0032 extends HttpApiEndpoint.get("getUser0032", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0033 extends HttpApiEndpoint.get("getUser0033", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0034 extends HttpApiEndpoint.get("getUser0034", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0035 extends HttpApiEndpoint.get("getUser0035", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0036 extends HttpApiEndpoint.get("getUser0036", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0037 extends HttpApiEndpoint.get("getUser0037", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0038 extends HttpApiEndpoint.get("getUser0038", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0039 extends HttpApiEndpoint.get("getUser0039", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0040 extends HttpApiEndpoint.get("getUser0040", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0041 extends HttpApiEndpoint.get("getUser0041", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0042 extends HttpApiEndpoint.get("getUser0042", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0043 extends HttpApiEndpoint.get("getUser0043", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0044 extends HttpApiEndpoint.get("getUser0044", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0045 extends HttpApiEndpoint.get("getUser0045", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0046 extends HttpApiEndpoint.get("getUser0046", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0047 extends HttpApiEndpoint.get("getUser0047", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0048 extends HttpApiEndpoint.get("getUser0048", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0049 extends HttpApiEndpoint.get("getUser0049", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0050 extends HttpApiEndpoint.get("getUser0050", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0051 extends HttpApiEndpoint.get("getUser0051", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0052 extends HttpApiEndpoint.get("getUser0052", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0053 extends HttpApiEndpoint.get("getUser0053", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0054 extends HttpApiEndpoint.get("getUser0054", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0055 extends HttpApiEndpoint.get("getUser0055", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0056 extends HttpApiEndpoint.get("getUser0056", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0057 extends HttpApiEndpoint.get("getUser0057", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0058 extends HttpApiEndpoint.get("getUser0058", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0059 extends HttpApiEndpoint.get("getUser0059", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0060 extends HttpApiEndpoint.get("getUser0060", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0061 extends HttpApiEndpoint.get("getUser0061", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0062 extends HttpApiEndpoint.get("getUser0062", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0063 extends HttpApiEndpoint.get("getUser0063", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0064 extends HttpApiEndpoint.get("getUser0064", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0065 extends HttpApiEndpoint.get("getUser0065", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0066 extends HttpApiEndpoint.get("getUser0066", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0067 extends HttpApiEndpoint.get("getUser0067", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0068 extends HttpApiEndpoint.get("getUser0068", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0069 extends HttpApiEndpoint.get("getUser0069", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0070 extends HttpApiEndpoint.get("getUser0070", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0071 extends HttpApiEndpoint.get("getUser0071", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0072 extends HttpApiEndpoint.get("getUser0072", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0073 extends HttpApiEndpoint.get("getUser0073", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0074 extends HttpApiEndpoint.get("getUser0074", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0075 extends HttpApiEndpoint.get("getUser0075", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0076 extends HttpApiEndpoint.get("getUser0076", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0077 extends HttpApiEndpoint.get("getUser0077", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0078 extends HttpApiEndpoint.get("getUser0078", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0079 extends HttpApiEndpoint.get("getUser0079", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0080 extends HttpApiEndpoint.get("getUser0080", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0081 extends HttpApiEndpoint.get("getUser0081", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0082 extends HttpApiEndpoint.get("getUser0082", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0083 extends HttpApiEndpoint.get("getUser0083", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0084 extends HttpApiEndpoint.get("getUser0084", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0085 extends HttpApiEndpoint.get("getUser0085", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0086 extends HttpApiEndpoint.get("getUser0086", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0087 extends HttpApiEndpoint.get("getUser0087", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0088 extends HttpApiEndpoint.get("getUser0088", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0089 extends HttpApiEndpoint.get("getUser0089", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0090 extends HttpApiEndpoint.get("getUser0090", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0091 extends HttpApiEndpoint.get("getUser0091", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0092 extends HttpApiEndpoint.get("getUser0092", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0093 extends HttpApiEndpoint.get("getUser0093", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0094 extends HttpApiEndpoint.get("getUser0094", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0095 extends HttpApiEndpoint.get("getUser0095", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0096 extends HttpApiEndpoint.get("getUser0096", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0097 extends HttpApiEndpoint.get("getUser0097", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0098 extends HttpApiEndpoint.get("getUser0098", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0099 extends HttpApiEndpoint.get("getUser0099", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0100 extends HttpApiEndpoint.get("getUser0100", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0101 extends HttpApiEndpoint.get("getUser0101", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0102 extends HttpApiEndpoint.get("getUser0102", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0103 extends HttpApiEndpoint.get("getUser0103", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0104 extends HttpApiEndpoint.get("getUser0104", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0105 extends HttpApiEndpoint.get("getUser0105", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0106 extends HttpApiEndpoint.get("getUser0106", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0107 extends HttpApiEndpoint.get("getUser0107", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0108 extends HttpApiEndpoint.get("getUser0108", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0109 extends HttpApiEndpoint.get("getUser0109", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0110 extends HttpApiEndpoint.get("getUser0110", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0111 extends HttpApiEndpoint.get("getUser0111", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0112 extends HttpApiEndpoint.get("getUser0112", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0113 extends HttpApiEndpoint.get("getUser0113", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0114 extends HttpApiEndpoint.get("getUser0114", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0115 extends HttpApiEndpoint.get("getUser0115", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0116 extends HttpApiEndpoint.get("getUser0116", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0117 extends HttpApiEndpoint.get("getUser0117", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0118 extends HttpApiEndpoint.get("getUser0118", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0119 extends HttpApiEndpoint.get("getUser0119", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0120 extends HttpApiEndpoint.get("getUser0120", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0121 extends HttpApiEndpoint.get("getUser0121", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0122 extends HttpApiEndpoint.get("getUser0122", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0123 extends HttpApiEndpoint.get("getUser0123", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0124 extends HttpApiEndpoint.get("getUser0124", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0125 extends HttpApiEndpoint.get("getUser0125", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0126 extends HttpApiEndpoint.get("getUser0126", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0127 extends HttpApiEndpoint.get("getUser0127", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0128 extends HttpApiEndpoint.get("getUser0128", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0129 extends HttpApiEndpoint.get("getUser0129", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0130 extends HttpApiEndpoint.get("getUser0130", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0131 extends HttpApiEndpoint.get("getUser0131", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0132 extends HttpApiEndpoint.get("getUser0132", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0133 extends HttpApiEndpoint.get("getUser0133", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0134 extends HttpApiEndpoint.get("getUser0134", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0135 extends HttpApiEndpoint.get("getUser0135", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0136 extends HttpApiEndpoint.get("getUser0136", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0137 extends HttpApiEndpoint.get("getUser0137", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0138 extends HttpApiEndpoint.get("getUser0138", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0139 extends HttpApiEndpoint.get("getUser0139", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0140 extends HttpApiEndpoint.get("getUser0140", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0141 extends HttpApiEndpoint.get("getUser0141", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0142 extends HttpApiEndpoint.get("getUser0142", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0143 extends HttpApiEndpoint.get("getUser0143", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0144 extends HttpApiEndpoint.get("getUser0144", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0145 extends HttpApiEndpoint.get("getUser0145", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0146 extends HttpApiEndpoint.get("getUser0146", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0147 extends HttpApiEndpoint.get("getUser0147", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0148 extends HttpApiEndpoint.get("getUser0148", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0149 extends HttpApiEndpoint.get("getUser0149", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0150 extends HttpApiEndpoint.get("getUser0150", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0151 extends HttpApiEndpoint.get("getUser0151", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0152 extends HttpApiEndpoint.get("getUser0152", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0153 extends HttpApiEndpoint.get("getUser0153", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0154 extends HttpApiEndpoint.get("getUser0154", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0155 extends HttpApiEndpoint.get("getUser0155", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0156 extends HttpApiEndpoint.get("getUser0156", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0157 extends HttpApiEndpoint.get("getUser0157", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0158 extends HttpApiEndpoint.get("getUser0158", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0159 extends HttpApiEndpoint.get("getUser0159", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0160 extends HttpApiEndpoint.get("getUser0160", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0161 extends HttpApiEndpoint.get("getUser0161", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0162 extends HttpApiEndpoint.get("getUser0162", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0163 extends HttpApiEndpoint.get("getUser0163", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0164 extends HttpApiEndpoint.get("getUser0164", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0165 extends HttpApiEndpoint.get("getUser0165", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0166 extends HttpApiEndpoint.get("getUser0166", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0167 extends HttpApiEndpoint.get("getUser0167", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0168 extends HttpApiEndpoint.get("getUser0168", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0169 extends HttpApiEndpoint.get("getUser0169", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0170 extends HttpApiEndpoint.get("getUser0170", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0171 extends HttpApiEndpoint.get("getUser0171", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0172 extends HttpApiEndpoint.get("getUser0172", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0173 extends HttpApiEndpoint.get("getUser0173", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0174 extends HttpApiEndpoint.get("getUser0174", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0175 extends HttpApiEndpoint.get("getUser0175", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0176 extends HttpApiEndpoint.get("getUser0176", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0177 extends HttpApiEndpoint.get("getUser0177", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0178 extends HttpApiEndpoint.get("getUser0178", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0179 extends HttpApiEndpoint.get("getUser0179", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0180 extends HttpApiEndpoint.get("getUser0180", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0181 extends HttpApiEndpoint.get("getUser0181", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0182 extends HttpApiEndpoint.get("getUser0182", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0183 extends HttpApiEndpoint.get("getUser0183", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0184 extends HttpApiEndpoint.get("getUser0184", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0185 extends HttpApiEndpoint.get("getUser0185", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0186 extends HttpApiEndpoint.get("getUser0186", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0187 extends HttpApiEndpoint.get("getUser0187", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0188 extends HttpApiEndpoint.get("getUser0188", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0189 extends HttpApiEndpoint.get("getUser0189", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0190 extends HttpApiEndpoint.get("getUser0190", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0191 extends HttpApiEndpoint.get("getUser0191", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0192 extends HttpApiEndpoint.get("getUser0192", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0193 extends HttpApiEndpoint.get("getUser0193", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0194 extends HttpApiEndpoint.get("getUser0194", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0195 extends HttpApiEndpoint.get("getUser0195", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0196 extends HttpApiEndpoint.get("getUser0196", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0197 extends HttpApiEndpoint.get("getUser0197", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0198 extends HttpApiEndpoint.get("getUser0198", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0199 extends HttpApiEndpoint.get("getUser0199", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0200 extends HttpApiEndpoint.get("getUser0200", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0201 extends HttpApiEndpoint.get("getUser0201", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0202 extends HttpApiEndpoint.get("getUser0202", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0203 extends HttpApiEndpoint.get("getUser0203", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0204 extends HttpApiEndpoint.get("getUser0204", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0205 extends HttpApiEndpoint.get("getUser0205", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0206 extends HttpApiEndpoint.get("getUser0206", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0207 extends HttpApiEndpoint.get("getUser0207", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0208 extends HttpApiEndpoint.get("getUser0208", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0209 extends HttpApiEndpoint.get("getUser0209", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0210 extends HttpApiEndpoint.get("getUser0210", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0211 extends HttpApiEndpoint.get("getUser0211", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0212 extends HttpApiEndpoint.get("getUser0212", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0213 extends HttpApiEndpoint.get("getUser0213", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0214 extends HttpApiEndpoint.get("getUser0214", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0215 extends HttpApiEndpoint.get("getUser0215", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0216 extends HttpApiEndpoint.get("getUser0216", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0217 extends HttpApiEndpoint.get("getUser0217", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0218 extends HttpApiEndpoint.get("getUser0218", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0219 extends HttpApiEndpoint.get("getUser0219", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0220 extends HttpApiEndpoint.get("getUser0220", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0221 extends HttpApiEndpoint.get("getUser0221", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0222 extends HttpApiEndpoint.get("getUser0222", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0223 extends HttpApiEndpoint.get("getUser0223", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0224 extends HttpApiEndpoint.get("getUser0224", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0225 extends HttpApiEndpoint.get("getUser0225", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0226 extends HttpApiEndpoint.get("getUser0226", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0227 extends HttpApiEndpoint.get("getUser0227", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0228 extends HttpApiEndpoint.get("getUser0228", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0229 extends HttpApiEndpoint.get("getUser0229", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0230 extends HttpApiEndpoint.get("getUser0230", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0231 extends HttpApiEndpoint.get("getUser0231", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0232 extends HttpApiEndpoint.get("getUser0232", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0233 extends HttpApiEndpoint.get("getUser0233", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0234 extends HttpApiEndpoint.get("getUser0234", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0235 extends HttpApiEndpoint.get("getUser0235", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0236 extends HttpApiEndpoint.get("getUser0236", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0237 extends HttpApiEndpoint.get("getUser0237", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0238 extends HttpApiEndpoint.get("getUser0238", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0239 extends HttpApiEndpoint.get("getUser0239", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0240 extends HttpApiEndpoint.get("getUser0240", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0241 extends HttpApiEndpoint.get("getUser0241", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0242 extends HttpApiEndpoint.get("getUser0242", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0243 extends HttpApiEndpoint.get("getUser0243", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0244 extends HttpApiEndpoint.get("getUser0244", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0245 extends HttpApiEndpoint.get("getUser0245", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0246 extends HttpApiEndpoint.get("getUser0246", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0247 extends HttpApiEndpoint.get("getUser0247", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0248 extends HttpApiEndpoint.get("getUser0248", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0249 extends HttpApiEndpoint.get("getUser0249", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0250 extends HttpApiEndpoint.get("getUser0250", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0251 extends HttpApiEndpoint.get("getUser0251", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0252 extends HttpApiEndpoint.get("getUser0252", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0253 extends HttpApiEndpoint.get("getUser0253", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0254 extends HttpApiEndpoint.get("getUser0254", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0255 extends HttpApiEndpoint.get("getUser0255", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0256 extends HttpApiEndpoint.get("getUser0256", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0257 extends HttpApiEndpoint.get("getUser0257", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0258 extends HttpApiEndpoint.get("getUser0258", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0259 extends HttpApiEndpoint.get("getUser0259", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0260 extends HttpApiEndpoint.get("getUser0260", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0261 extends HttpApiEndpoint.get("getUser0261", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0262 extends HttpApiEndpoint.get("getUser0262", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0263 extends HttpApiEndpoint.get("getUser0263", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0264 extends HttpApiEndpoint.get("getUser0264", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0265 extends HttpApiEndpoint.get("getUser0265", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0266 extends HttpApiEndpoint.get("getUser0266", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0267 extends HttpApiEndpoint.get("getUser0267", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0268 extends HttpApiEndpoint.get("getUser0268", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0269 extends HttpApiEndpoint.get("getUser0269", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0270 extends HttpApiEndpoint.get("getUser0270", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0271 extends HttpApiEndpoint.get("getUser0271", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0272 extends HttpApiEndpoint.get("getUser0272", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0273 extends HttpApiEndpoint.get("getUser0273", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0274 extends HttpApiEndpoint.get("getUser0274", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0275 extends HttpApiEndpoint.get("getUser0275", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0276 extends HttpApiEndpoint.get("getUser0276", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0277 extends HttpApiEndpoint.get("getUser0277", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0278 extends HttpApiEndpoint.get("getUser0278", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0279 extends HttpApiEndpoint.get("getUser0279", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0280 extends HttpApiEndpoint.get("getUser0280", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0281 extends HttpApiEndpoint.get("getUser0281", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0282 extends HttpApiEndpoint.get("getUser0282", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0283 extends HttpApiEndpoint.get("getUser0283", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0284 extends HttpApiEndpoint.get("getUser0284", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0285 extends HttpApiEndpoint.get("getUser0285", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0286 extends HttpApiEndpoint.get("getUser0286", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0287 extends HttpApiEndpoint.get("getUser0287", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0288 extends HttpApiEndpoint.get("getUser0288", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0289 extends HttpApiEndpoint.get("getUser0289", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0290 extends HttpApiEndpoint.get("getUser0290", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0291 extends HttpApiEndpoint.get("getUser0291", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0292 extends HttpApiEndpoint.get("getUser0292", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0293 extends HttpApiEndpoint.get("getUser0293", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0294 extends HttpApiEndpoint.get("getUser0294", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0295 extends HttpApiEndpoint.get("getUser0295", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0296 extends HttpApiEndpoint.get("getUser0296", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0297 extends HttpApiEndpoint.get("getUser0297", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0298 extends HttpApiEndpoint.get("getUser0298", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0299 extends HttpApiEndpoint.get("getUser0299", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0300 extends HttpApiEndpoint.get("getUser0300", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0301 extends HttpApiEndpoint.get("getUser0301", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0302 extends HttpApiEndpoint.get("getUser0302", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0303 extends HttpApiEndpoint.get("getUser0303", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0304 extends HttpApiEndpoint.get("getUser0304", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0305 extends HttpApiEndpoint.get("getUser0305", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0306 extends HttpApiEndpoint.get("getUser0306", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0307 extends HttpApiEndpoint.get("getUser0307", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0308 extends HttpApiEndpoint.get("getUser0308", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0309 extends HttpApiEndpoint.get("getUser0309", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0310 extends HttpApiEndpoint.get("getUser0310", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0311 extends HttpApiEndpoint.get("getUser0311", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0312 extends HttpApiEndpoint.get("getUser0312", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0313 extends HttpApiEndpoint.get("getUser0313", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0314 extends HttpApiEndpoint.get("getUser0314", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0315 extends HttpApiEndpoint.get("getUser0315", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0316 extends HttpApiEndpoint.get("getUser0316", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0317 extends HttpApiEndpoint.get("getUser0317", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0318 extends HttpApiEndpoint.get("getUser0318", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0319 extends HttpApiEndpoint.get("getUser0319", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0320 extends HttpApiEndpoint.get("getUser0320", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0321 extends HttpApiEndpoint.get("getUser0321", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0322 extends HttpApiEndpoint.get("getUser0322", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0323 extends HttpApiEndpoint.get("getUser0323", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0324 extends HttpApiEndpoint.get("getUser0324", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0325 extends HttpApiEndpoint.get("getUser0325", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0326 extends HttpApiEndpoint.get("getUser0326", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0327 extends HttpApiEndpoint.get("getUser0327", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0328 extends HttpApiEndpoint.get("getUser0328", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0329 extends HttpApiEndpoint.get("getUser0329", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0330 extends HttpApiEndpoint.get("getUser0330", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0331 extends HttpApiEndpoint.get("getUser0331", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0332 extends HttpApiEndpoint.get("getUser0332", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0333 extends HttpApiEndpoint.get("getUser0333", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0334 extends HttpApiEndpoint.get("getUser0334", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0335 extends HttpApiEndpoint.get("getUser0335", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0336 extends HttpApiEndpoint.get("getUser0336", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0337 extends HttpApiEndpoint.get("getUser0337", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0338 extends HttpApiEndpoint.get("getUser0338", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0339 extends HttpApiEndpoint.get("getUser0339", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0340 extends HttpApiEndpoint.get("getUser0340", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0341 extends HttpApiEndpoint.get("getUser0341", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0342 extends HttpApiEndpoint.get("getUser0342", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0343 extends HttpApiEndpoint.get("getUser0343", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0344 extends HttpApiEndpoint.get("getUser0344", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0345 extends HttpApiEndpoint.get("getUser0345", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0346 extends HttpApiEndpoint.get("getUser0346", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0347 extends HttpApiEndpoint.get("getUser0347", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0348 extends HttpApiEndpoint.get("getUser0348", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0349 extends HttpApiEndpoint.get("getUser0349", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0350 extends HttpApiEndpoint.get("getUser0350", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0351 extends HttpApiEndpoint.get("getUser0351", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0352 extends HttpApiEndpoint.get("getUser0352", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0353 extends HttpApiEndpoint.get("getUser0353", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0354 extends HttpApiEndpoint.get("getUser0354", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0355 extends HttpApiEndpoint.get("getUser0355", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0356 extends HttpApiEndpoint.get("getUser0356", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0357 extends HttpApiEndpoint.get("getUser0357", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0358 extends HttpApiEndpoint.get("getUser0358", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0359 extends HttpApiEndpoint.get("getUser0359", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0360 extends HttpApiEndpoint.get("getUser0360", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0361 extends HttpApiEndpoint.get("getUser0361", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0362 extends HttpApiEndpoint.get("getUser0362", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0363 extends HttpApiEndpoint.get("getUser0363", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0364 extends HttpApiEndpoint.get("getUser0364", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0365 extends HttpApiEndpoint.get("getUser0365", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0366 extends HttpApiEndpoint.get("getUser0366", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0367 extends HttpApiEndpoint.get("getUser0367", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0368 extends HttpApiEndpoint.get("getUser0368", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0369 extends HttpApiEndpoint.get("getUser0369", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0370 extends HttpApiEndpoint.get("getUser0370", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0371 extends HttpApiEndpoint.get("getUser0371", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0372 extends HttpApiEndpoint.get("getUser0372", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0373 extends HttpApiEndpoint.get("getUser0373", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0374 extends HttpApiEndpoint.get("getUser0374", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0375 extends HttpApiEndpoint.get("getUser0375", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0376 extends HttpApiEndpoint.get("getUser0376", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0377 extends HttpApiEndpoint.get("getUser0377", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0378 extends HttpApiEndpoint.get("getUser0378", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0379 extends HttpApiEndpoint.get("getUser0379", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0380 extends HttpApiEndpoint.get("getUser0380", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0381 extends HttpApiEndpoint.get("getUser0381", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0382 extends HttpApiEndpoint.get("getUser0382", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0383 extends HttpApiEndpoint.get("getUser0383", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0384 extends HttpApiEndpoint.get("getUser0384", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0385 extends HttpApiEndpoint.get("getUser0385", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0386 extends HttpApiEndpoint.get("getUser0386", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0387 extends HttpApiEndpoint.get("getUser0387", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0388 extends HttpApiEndpoint.get("getUser0388", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0389 extends HttpApiEndpoint.get("getUser0389", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0390 extends HttpApiEndpoint.get("getUser0390", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0391 extends HttpApiEndpoint.get("getUser0391", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0392 extends HttpApiEndpoint.get("getUser0392", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0393 extends HttpApiEndpoint.get("getUser0393", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0394 extends HttpApiEndpoint.get("getUser0394", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0395 extends HttpApiEndpoint.get("getUser0395", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0396 extends HttpApiEndpoint.get("getUser0396", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0397 extends HttpApiEndpoint.get("getUser0397", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0398 extends HttpApiEndpoint.get("getUser0398", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0399 extends HttpApiEndpoint.get("getUser0399", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0400 extends HttpApiEndpoint.get("getUser0400", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0401 extends HttpApiEndpoint.get("getUser0401", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0402 extends HttpApiEndpoint.get("getUser0402", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0403 extends HttpApiEndpoint.get("getUser0403", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0404 extends HttpApiEndpoint.get("getUser0404", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0405 extends HttpApiEndpoint.get("getUser0405", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0406 extends HttpApiEndpoint.get("getUser0406", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0407 extends HttpApiEndpoint.get("getUser0407", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0408 extends HttpApiEndpoint.get("getUser0408", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0409 extends HttpApiEndpoint.get("getUser0409", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0410 extends HttpApiEndpoint.get("getUser0410", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0411 extends HttpApiEndpoint.get("getUser0411", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0412 extends HttpApiEndpoint.get("getUser0412", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0413 extends HttpApiEndpoint.get("getUser0413", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0414 extends HttpApiEndpoint.get("getUser0414", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0415 extends HttpApiEndpoint.get("getUser0415", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0416 extends HttpApiEndpoint.get("getUser0416", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0417 extends HttpApiEndpoint.get("getUser0417", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0418 extends HttpApiEndpoint.get("getUser0418", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0419 extends HttpApiEndpoint.get("getUser0419", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0420 extends HttpApiEndpoint.get("getUser0420", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0421 extends HttpApiEndpoint.get("getUser0421", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0422 extends HttpApiEndpoint.get("getUser0422", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0423 extends HttpApiEndpoint.get("getUser0423", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0424 extends HttpApiEndpoint.get("getUser0424", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0425 extends HttpApiEndpoint.get("getUser0425", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0426 extends HttpApiEndpoint.get("getUser0426", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0427 extends HttpApiEndpoint.get("getUser0427", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0428 extends HttpApiEndpoint.get("getUser0428", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0429 extends HttpApiEndpoint.get("getUser0429", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0430 extends HttpApiEndpoint.get("getUser0430", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0431 extends HttpApiEndpoint.get("getUser0431", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0432 extends HttpApiEndpoint.get("getUser0432", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0433 extends HttpApiEndpoint.get("getUser0433", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0434 extends HttpApiEndpoint.get("getUser0434", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0435 extends HttpApiEndpoint.get("getUser0435", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0436 extends HttpApiEndpoint.get("getUser0436", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0437 extends HttpApiEndpoint.get("getUser0437", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0438 extends HttpApiEndpoint.get("getUser0438", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0439 extends HttpApiEndpoint.get("getUser0439", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0440 extends HttpApiEndpoint.get("getUser0440", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0441 extends HttpApiEndpoint.get("getUser0441", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0442 extends HttpApiEndpoint.get("getUser0442", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0443 extends HttpApiEndpoint.get("getUser0443", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0444 extends HttpApiEndpoint.get("getUser0444", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0445 extends HttpApiEndpoint.get("getUser0445", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0446 extends HttpApiEndpoint.get("getUser0446", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0447 extends HttpApiEndpoint.get("getUser0447", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0448 extends HttpApiEndpoint.get("getUser0448", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0449 extends HttpApiEndpoint.get("getUser0449", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0450 extends HttpApiEndpoint.get("getUser0450", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0451 extends HttpApiEndpoint.get("getUser0451", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0452 extends HttpApiEndpoint.get("getUser0452", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0453 extends HttpApiEndpoint.get("getUser0453", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0454 extends HttpApiEndpoint.get("getUser0454", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0455 extends HttpApiEndpoint.get("getUser0455", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0456 extends HttpApiEndpoint.get("getUser0456", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0457 extends HttpApiEndpoint.get("getUser0457", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0458 extends HttpApiEndpoint.get("getUser0458", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0459 extends HttpApiEndpoint.get("getUser0459", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0460 extends HttpApiEndpoint.get("getUser0460", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0461 extends HttpApiEndpoint.get("getUser0461", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0462 extends HttpApiEndpoint.get("getUser0462", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0463 extends HttpApiEndpoint.get("getUser0463", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0464 extends HttpApiEndpoint.get("getUser0464", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0465 extends HttpApiEndpoint.get("getUser0465", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0466 extends HttpApiEndpoint.get("getUser0466", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0467 extends HttpApiEndpoint.get("getUser0467", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0468 extends HttpApiEndpoint.get("getUser0468", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0469 extends HttpApiEndpoint.get("getUser0469", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0470 extends HttpApiEndpoint.get("getUser0470", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0471 extends HttpApiEndpoint.get("getUser0471", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0472 extends HttpApiEndpoint.get("getUser0472", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0473 extends HttpApiEndpoint.get("getUser0473", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0474 extends HttpApiEndpoint.get("getUser0474", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0475 extends HttpApiEndpoint.get("getUser0475", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0476 extends HttpApiEndpoint.get("getUser0476", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0477 extends HttpApiEndpoint.get("getUser0477", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0478 extends HttpApiEndpoint.get("getUser0478", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0479 extends HttpApiEndpoint.get("getUser0479", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0480 extends HttpApiEndpoint.get("getUser0480", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0481 extends HttpApiEndpoint.get("getUser0481", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0482 extends HttpApiEndpoint.get("getUser0482", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0483 extends HttpApiEndpoint.get("getUser0483", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0484 extends HttpApiEndpoint.get("getUser0484", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0485 extends HttpApiEndpoint.get("getUser0485", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0486 extends HttpApiEndpoint.get("getUser0486", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0487 extends HttpApiEndpoint.get("getUser0487", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0488 extends HttpApiEndpoint.get("getUser0488", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0489 extends HttpApiEndpoint.get("getUser0489", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0490 extends HttpApiEndpoint.get("getUser0490", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0491 extends HttpApiEndpoint.get("getUser0491", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0492 extends HttpApiEndpoint.get("getUser0492", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0493 extends HttpApiEndpoint.get("getUser0493", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0494 extends HttpApiEndpoint.get("getUser0494", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0495 extends HttpApiEndpoint.get("getUser0495", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0496 extends HttpApiEndpoint.get("getUser0496", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0497 extends HttpApiEndpoint.get("getUser0497", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0498 extends HttpApiEndpoint.get("getUser0498", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0499 extends HttpApiEndpoint.get("getUser0499", "/users/:id", {
  params: Params,
  success: User
}) {}

class GetUser0500 extends HttpApiEndpoint.get("getUser0500", "/users/:id", {
  params: Params,
  success: User
}) {}

const api = HttpApi.make("Api").add(
  HttpApiGroup.make("users").add(
    GetUser0001,
    GetUser0002,
    GetUser0003,
    GetUser0004,
    GetUser0005,
    GetUser0006,
    GetUser0007,
    GetUser0008,
    GetUser0009,
    GetUser0010,
    GetUser0011,
    GetUser0012,
    GetUser0013,
    GetUser0014,
    GetUser0015,
    GetUser0016,
    GetUser0017,
    GetUser0018,
    GetUser0019,
    GetUser0020,
    GetUser0021,
    GetUser0022,
    GetUser0023,
    GetUser0024,
    GetUser0025,
    GetUser0026,
    GetUser0027,
    GetUser0028,
    GetUser0029,
    GetUser0030,
    GetUser0031,
    GetUser0032,
    GetUser0033,
    GetUser0034,
    GetUser0035,
    GetUser0036,
    GetUser0037,
    GetUser0038,
    GetUser0039,
    GetUser0040,
    GetUser0041,
    GetUser0042,
    GetUser0043,
    GetUser0044,
    GetUser0045,
    GetUser0046,
    GetUser0047,
    GetUser0048,
    GetUser0049,
    GetUser0050,
    GetUser0051,
    GetUser0052,
    GetUser0053,
    GetUser0054,
    GetUser0055,
    GetUser0056,
    GetUser0057,
    GetUser0058,
    GetUser0059,
    GetUser0060,
    GetUser0061,
    GetUser0062,
    GetUser0063,
    GetUser0064,
    GetUser0065,
    GetUser0066,
    GetUser0067,
    GetUser0068,
    GetUser0069,
    GetUser0070,
    GetUser0071,
    GetUser0072,
    GetUser0073,
    GetUser0074,
    GetUser0075,
    GetUser0076,
    GetUser0077,
    GetUser0078,
    GetUser0079,
    GetUser0080,
    GetUser0081,
    GetUser0082,
    GetUser0083,
    GetUser0084,
    GetUser0085,
    GetUser0086,
    GetUser0087,
    GetUser0088,
    GetUser0089,
    GetUser0090,
    GetUser0091,
    GetUser0092,
    GetUser0093,
    GetUser0094,
    GetUser0095,
    GetUser0096,
    GetUser0097,
    GetUser0098,
    GetUser0099,
    GetUser0100,
    GetUser0101,
    GetUser0102,
    GetUser0103,
    GetUser0104,
    GetUser0105,
    GetUser0106,
    GetUser0107,
    GetUser0108,
    GetUser0109,
    GetUser0110,
    GetUser0111,
    GetUser0112,
    GetUser0113,
    GetUser0114,
    GetUser0115,
    GetUser0116,
    GetUser0117,
    GetUser0118,
    GetUser0119,
    GetUser0120,
    GetUser0121,
    GetUser0122,
    GetUser0123,
    GetUser0124,
    GetUser0125,
    GetUser0126,
    GetUser0127,
    GetUser0128,
    GetUser0129,
    GetUser0130,
    GetUser0131,
    GetUser0132,
    GetUser0133,
    GetUser0134,
    GetUser0135,
    GetUser0136,
    GetUser0137,
    GetUser0138,
    GetUser0139,
    GetUser0140,
    GetUser0141,
    GetUser0142,
    GetUser0143,
    GetUser0144,
    GetUser0145,
    GetUser0146,
    GetUser0147,
    GetUser0148,
    GetUser0149,
    GetUser0150,
    GetUser0151,
    GetUser0152,
    GetUser0153,
    GetUser0154,
    GetUser0155,
    GetUser0156,
    GetUser0157,
    GetUser0158,
    GetUser0159,
    GetUser0160,
    GetUser0161,
    GetUser0162,
    GetUser0163,
    GetUser0164,
    GetUser0165,
    GetUser0166,
    GetUser0167,
    GetUser0168,
    GetUser0169,
    GetUser0170,
    GetUser0171,
    GetUser0172,
    GetUser0173,
    GetUser0174,
    GetUser0175,
    GetUser0176,
    GetUser0177,
    GetUser0178,
    GetUser0179,
    GetUser0180,
    GetUser0181,
    GetUser0182,
    GetUser0183,
    GetUser0184,
    GetUser0185,
    GetUser0186,
    GetUser0187,
    GetUser0188,
    GetUser0189,
    GetUser0190,
    GetUser0191,
    GetUser0192,
    GetUser0193,
    GetUser0194,
    GetUser0195,
    GetUser0196,
    GetUser0197,
    GetUser0198,
    GetUser0199,
    GetUser0200,
    GetUser0201,
    GetUser0202,
    GetUser0203,
    GetUser0204,
    GetUser0205,
    GetUser0206,
    GetUser0207,
    GetUser0208,
    GetUser0209,
    GetUser0210,
    GetUser0211,
    GetUser0212,
    GetUser0213,
    GetUser0214,
    GetUser0215,
    GetUser0216,
    GetUser0217,
    GetUser0218,
    GetUser0219,
    GetUser0220,
    GetUser0221,
    GetUser0222,
    GetUser0223,
    GetUser0224,
    GetUser0225,
    GetUser0226,
    GetUser0227,
    GetUser0228,
    GetUser0229,
    GetUser0230,
    GetUser0231,
    GetUser0232,
    GetUser0233,
    GetUser0234,
    GetUser0235,
    GetUser0236,
    GetUser0237,
    GetUser0238,
    GetUser0239,
    GetUser0240,
    GetUser0241,
    GetUser0242,
    GetUser0243,
    GetUser0244,
    GetUser0245,
    GetUser0246,
    GetUser0247,
    GetUser0248,
    GetUser0249,
    GetUser0250,
    GetUser0251,
    GetUser0252,
    GetUser0253,
    GetUser0254,
    GetUser0255,
    GetUser0256,
    GetUser0257,
    GetUser0258,
    GetUser0259,
    GetUser0260,
    GetUser0261,
    GetUser0262,
    GetUser0263,
    GetUser0264,
    GetUser0265,
    GetUser0266,
    GetUser0267,
    GetUser0268,
    GetUser0269,
    GetUser0270,
    GetUser0271,
    GetUser0272,
    GetUser0273,
    GetUser0274,
    GetUser0275,
    GetUser0276,
    GetUser0277,
    GetUser0278,
    GetUser0279,
    GetUser0280,
    GetUser0281,
    GetUser0282,
    GetUser0283,
    GetUser0284,
    GetUser0285,
    GetUser0286,
    GetUser0287,
    GetUser0288,
    GetUser0289,
    GetUser0290,
    GetUser0291,
    GetUser0292,
    GetUser0293,
    GetUser0294,
    GetUser0295,
    GetUser0296,
    GetUser0297,
    GetUser0298,
    GetUser0299,
    GetUser0300,
    GetUser0301,
    GetUser0302,
    GetUser0303,
    GetUser0304,
    GetUser0305,
    GetUser0306,
    GetUser0307,
    GetUser0308,
    GetUser0309,
    GetUser0310,
    GetUser0311,
    GetUser0312,
    GetUser0313,
    GetUser0314,
    GetUser0315,
    GetUser0316,
    GetUser0317,
    GetUser0318,
    GetUser0319,
    GetUser0320,
    GetUser0321,
    GetUser0322,
    GetUser0323,
    GetUser0324,
    GetUser0325,
    GetUser0326,
    GetUser0327,
    GetUser0328,
    GetUser0329,
    GetUser0330,
    GetUser0331,
    GetUser0332,
    GetUser0333,
    GetUser0334,
    GetUser0335,
    GetUser0336,
    GetUser0337,
    GetUser0338,
    GetUser0339,
    GetUser0340,
    GetUser0341,
    GetUser0342,
    GetUser0343,
    GetUser0344,
    GetUser0345,
    GetUser0346,
    GetUser0347,
    GetUser0348,
    GetUser0349,
    GetUser0350,
    GetUser0351,
    GetUser0352,
    GetUser0353,
    GetUser0354,
    GetUser0355,
    GetUser0356,
    GetUser0357,
    GetUser0358,
    GetUser0359,
    GetUser0360,
    GetUser0361,
    GetUser0362,
    GetUser0363,
    GetUser0364,
    GetUser0365,
    GetUser0366,
    GetUser0367,
    GetUser0368,
    GetUser0369,
    GetUser0370,
    GetUser0371,
    GetUser0372,
    GetUser0373,
    GetUser0374,
    GetUser0375,
    GetUser0376,
    GetUser0377,
    GetUser0378,
    GetUser0379,
    GetUser0380,
    GetUser0381,
    GetUser0382,
    GetUser0383,
    GetUser0384,
    GetUser0385,
    GetUser0386,
    GetUser0387,
    GetUser0388,
    GetUser0389,
    GetUser0390,
    GetUser0391,
    GetUser0392,
    GetUser0393,
    GetUser0394,
    GetUser0395,
    GetUser0396,
    GetUser0397,
    GetUser0398,
    GetUser0399,
    GetUser0400,
    GetUser0401,
    GetUser0402,
    GetUser0403,
    GetUser0404,
    GetUser0405,
    GetUser0406,
    GetUser0407,
    GetUser0408,
    GetUser0409,
    GetUser0410,
    GetUser0411,
    GetUser0412,
    GetUser0413,
    GetUser0414,
    GetUser0415,
    GetUser0416,
    GetUser0417,
    GetUser0418,
    GetUser0419,
    GetUser0420,
    GetUser0421,
    GetUser0422,
    GetUser0423,
    GetUser0424,
    GetUser0425,
    GetUser0426,
    GetUser0427,
    GetUser0428,
    GetUser0429,
    GetUser0430,
    GetUser0431,
    GetUser0432,
    GetUser0433,
    GetUser0434,
    GetUser0435,
    GetUser0436,
    GetUser0437,
    GetUser0438,
    GetUser0439,
    GetUser0440,
    GetUser0441,
    GetUser0442,
    GetUser0443,
    GetUser0444,
    GetUser0445,
    GetUser0446,
    GetUser0447,
    GetUser0448,
    GetUser0449,
    GetUser0450,
    GetUser0451,
    GetUser0452,
    GetUser0453,
    GetUser0454,
    GetUser0455,
    GetUser0456,
    GetUser0457,
    GetUser0458,
    GetUser0459,
    GetUser0460,
    GetUser0461,
    GetUser0462,
    GetUser0463,
    GetUser0464,
    GetUser0465,
    GetUser0466,
    GetUser0467,
    GetUser0468,
    GetUser0469,
    GetUser0470,
    GetUser0471,
    GetUser0472,
    GetUser0473,
    GetUser0474,
    GetUser0475,
    GetUser0476,
    GetUser0477,
    GetUser0478,
    GetUser0479,
    GetUser0480,
    GetUser0481,
    GetUser0482,
    GetUser0483,
    GetUser0484,
    GetUser0485,
    GetUser0486,
    GetUser0487,
    GetUser0488,
    GetUser0489,
    GetUser0490,
    GetUser0491,
    GetUser0492,
    GetUser0493,
    GetUser0494,
    GetUser0495,
    GetUser0496,
    GetUser0497,
    GetUser0498,
    GetUser0499,
    GetUser0500
  )
)

type Groups = typeof api extends HttpApi.HttpApi<string, infer Groups> ? Groups : never
type Endpoints = HttpApiGroup.Endpoints<Groups>

export type Api = typeof api
export type EndpointIdentifiers = HttpApiEndpoint.Identifier<Endpoints>
export type EndpointRequests = HttpApiEndpoint.Request<Endpoints>
export type ServerServices = HttpApiEndpoint.ServerServices<Endpoints>
export type ClientServices = HttpApiEndpoint.ClientServices<Endpoints>
